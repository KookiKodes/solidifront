import type {
  LogContentTypes,
  Logger,
  RequestOptions,
  ClientHeaders,
} from "./types";

import ky, { KyResponse, KyRequest, KyInstance, Hooks } from "ky";
import isomorphicFetch from "isomorphic-fetch";
import {
  CLIENT,
  CONTENT_TYPES,
  DEFAULT_CLIENT_VERSION,
  DEFAULT_SDK_VARIANT,
  DEFER_OPERATION_REGEX,
  GQL_API_ERROR,
  MAX_RETRIES,
  NO_DATA_OR_ERRORS_ERROR,
  SDK_VARIANT_HEADER,
  SDK_VERSION_HEADER,
  UNEXPECTED_CONTENT_TYPE_ERROR,
} from "./constants.js";

import {
  formatErrorMessage,
  getErrorMessage,
  getKeyValueIfValid,
  validateRetries,
} from "./utils.js";

function generateClientLogger(logger?: Logger): Logger {
  return (logContent: LogContentTypes) => {
    if (logger) {
      logger(logContent);
    }
  };
}

export namespace createGraphqlClient {
  export type Options = {
    headers: ClientHeaders;
    url: string;
    retries?: number;
    logger?: Logger;
    hooks?: Hooks;
  };

  export type Config = {
    readonly headers: Options["headers"];
    readonly retries: Options["retries"];
  };

  type FetchResponseBody<TData = any> = {
    data?: TData;
    extensions: Record<string, any>;
    headers?: KyResponse["headers"];
  };

  type ResponseErrors = {
    networkStatusCode?: number;
    message?: string;
    graphQLErrors?: any[];
    response?: KyResponse;
  };

  export type Response<TData = any> = {
    errors?: ResponseErrors;
  } & FetchResponseBody<TData>;
}

export const createGraphqlClient = (options: createGraphqlClient.Options) => {
  const clientLogger = generateClientLogger(options.logger);

  const config: createGraphqlClient.Config = {
    headers: options.headers,
    retries: options.retries || MAX_RETRIES,
  };

  const client = ky.create({
    prefixUrl: options.url,
    retry: options.retries,
    fetch: isomorphicFetch,
    hooks: {
      beforeError: [
        (error) => {
          const { response, request, ...rest } = error;

          clientLogger({
            type: "HTTP-Error",
            content: {
              requestParams: [response.url, request],
              error: rest,
              response,
            },
          });

          return error;
        },
        ...(options.hooks?.beforeError || []),
      ],
      beforeRequest: [
        (request) => {
          Object.entries(options.headers).forEach(([key, value]) => {
            request.headers.set(key, value);
          });
        },
        ...(options.hooks?.beforeRequest || []),
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
        ...(options.hooks?.afterResponse || []),
      ],
      beforeRetry: [
        ({ request, retryCount, error }) => {
          clientLogger({
            type: "HTTP-Retry",
            content: {
              requestParams: [request.url, request],
              error,
              retryAttempt: retryCount,
              maxRetries: config.retries!,
            },
          });
        },
        ...(options.hooks?.beforeRetry || []),
      ],
    },
  });

  const fetcher = generateFetch(client, config);
  const request = generateRequest(fetcher);

  return {
    request,
  };
};

namespace generateFetch {
  export type Parameters = [operation: string, options: RequestOptions];
  export type ReturnFn = <TData extends any>(
    ...props: Parameters
  ) => Promise<KyResponse<TData>>;
}

function generateFetch(
  client: KyInstance,
  { headers, retries }: createGraphqlClient.Config
): generateFetch.ReturnFn {
  return async <TData extends any>(
    operation: generateFetch.Parameters[0],
    options: generateFetch.Parameters[1] = {}
  ): Promise<KyResponse<TData>> => {
    const {
      variables,
      headers: overrideHeaders,
      retries: overrideRetries,
      signal,
    } = options;

    validateRetries({ client: CLIENT, retries: overrideRetries });

    const flatHeaders = Object.entries({
      ...headers,
      ...overrideHeaders,
    }).reduce((headers: Record<string, string>, [key, value]) => {
      headers[key] = Array.isArray(value) ? value.join(", ") : value.toString();
      return headers;
    }, {});

    if (!flatHeaders[SDK_VARIANT_HEADER] && !flatHeaders[SDK_VERSION_HEADER]) {
      flatHeaders[SDK_VARIANT_HEADER] = DEFAULT_SDK_VARIANT;
      flatHeaders[SDK_VERSION_HEADER] = DEFAULT_CLIENT_VERSION;
    }

    return client.post("", {
      headers: flatHeaders,
      signal,
      retry: retries || overrideRetries,
      json: {
        query: operation,
        variables,
      },
    });
  };
}

async function processJSONResponse<TData = any>(
  response: KyResponse<any>
): Promise<createGraphqlClient.Response<TData>> {
  const { errors, data, extensions } = await response.json<any>();

  return {
    ...getKeyValueIfValid("data", data),
    ...getKeyValueIfValid("extensions", extensions),
    headers: response.headers,

    ...(errors || !data
      ? {
          errors: {
            networkStatusCode: response.status,
            message: formatErrorMessage(
              errors ? GQL_API_ERROR : NO_DATA_OR_ERRORS_ERROR
            ),
            ...getKeyValueIfValid("graphQLErrors", errors),
            response,
          },
        }
      : {}),
  } as createGraphqlClient.Response<TData>;
}

namespace generateRequest {
  export type Parameters = ReturnType<typeof generateFetch>;
  export type ReturnFn = <TData = any>(
    ...props: generateFetch.Parameters
  ) => Promise<createGraphqlClient.Response<TData>>;
}

function generateRequest(
  fetcher: generateFetch.ReturnFn
): generateRequest.ReturnFn {
  //@ts-ignore
  return async (...props) => {
    if (DEFER_OPERATION_REGEX.test(props[0])) {
      throw new Error(
        "This operation will result in a streamable response - use requestStream() instead."
      );
    }

    try {
      const response = await fetcher(...props);
      const { status, statusText } = response;
      const contentType = response.headers.get("content-type");

      if (!response.ok) {
        return {
          errors: {
            networkStatusCode: status,
            message: formatErrorMessage(statusText),
            response,
          },
        };
      }

      if (!contentType?.includes(CONTENT_TYPES.json)) {
        return {
          errors: {
            networkStatusCode: status,
            message: formatErrorMessage(
              `${UNEXPECTED_CONTENT_TYPE_ERROR} ${contentType}`
            ),
            response,
          },
        };
      }

      return processJSONResponse(response);
    } catch (error) {
      return {
        errors: {
          message: getErrorMessage(error),
        },
      };
    }
  };
}
