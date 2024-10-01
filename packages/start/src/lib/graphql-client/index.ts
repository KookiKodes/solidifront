import ky, { KyResponse, KyRequest } from "ky";
import isomorphicFetch from "isomorphic-fetch";

export interface LogContent {
  type: string;
  content: any;
}

export interface HTTPResponseLog extends LogContent {
  type: "HTTP-Response";
  content: {
    requestParams: Parameters<typeof isomorphicFetch>;
    response: KyResponse;
  };
}

export interface HTTPRetryLog extends LogContent {
  type: "HTTP-Retry";
  content: {
    requestParams: Parameters<typeof isomorphicFetch>;
    error?: Error;
    retryAttempt: number;
    maxRetries: number;
  };
}

export type LogContentTypes = HTTPResponseLog | HTTPRetryLog;

export type Logger<TLogContentTypes = LogContentTypes> = (
  logContent: TLogContentTypes
) => void;

function generateClientLogger(logger?: Logger): Logger {
  return (logContent: LogContentTypes) => {
    if (logger) {
      logger(logContent);
    }
  };
}

export namespace createGraphqlClient {
  export type Config = {
    headers: KyRequest["headers"];
    url: string;
    retries?: number;
    logger?: Logger;
  };
}

export const createGraphqlClient = (config: createGraphqlClient.Config) => {
  const clientLogger = generateClientLogger(config.logger);
  const client = ky.create({
    prefixUrl: config.url,
    retry: config.retries,
    fetch: isomorphicFetch,
    hooks: {
      beforeRequest: [
        (request) => {
          Object.entries(config.headers).forEach(([key, value]) => {
            request.headers.set(key, value);
          });
        },
      ],
      afterResponse: [
        (input, _options, response) => {
          clientLogger({
            type: "HTTP-Response",
            content: {
              requestParams: [input.url, input],
              response,
            },
          });
        },
      ],
      beforeRetry: [
        ({ request, retryCount, error }) => {
          clientLogger({
            type: "HTTP-Retry",
            content: {
              requestParams: [request.url, request],
              error,
              retryAttempt: retryCount,
              maxRetries: config.retries || 1,
            },
          });
        },
      ],
    },
  });

  return {
    async query<QueryString extends string, R extends any>(
      query: QueryString,
      options: {}
    ) {
      const response = await client.post<R>("", {
        headers: config.headers,
        json: { query },
      });
    },
  };
};
