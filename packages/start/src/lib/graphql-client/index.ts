import ky, { KyResponse } from "ky";
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
  type HeadersObject = Record<string, string | string[]>;
  export type Options = {
    headers: HeadersObject;
    url: string;
    retries?: number;
    logger?: Logger;
  };
}

export const createGraphqlClient = (options: createGraphqlClient.Options) => {
  const clientLogger = generateClientLogger(options.logger);
  const client = ky.create({
    prefixUrl: options.url,
    retry: options.retries,
    fetch: isomorphicFetch,
    hooks: {
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
              maxRetries: options.retries || 1,
            },
          });
        },
      ],
    },
  });
};
