import type { HTTPError, KyRequest, KyResponse } from "ky";
import type isomorphicFetch from "isomorphic-fetch";

type OperationVariables = Record<string, any>;

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

export interface HTTPErrorLog extends LogContent {
  type: "HTTP-Error";
  content: {
    requestParams: Parameters<typeof isomorphicFetch>;
    error: Error;
    response: KyResponse;
  };
}

export type ClientHeaders =
  | NonNullable<RequestInit["headers"]>
  | Record<string, string | undefined>;

export type LogContentTypes = HTTPResponseLog | HTTPRetryLog | HTTPErrorLog;

export type Logger<TLogContentTypes = LogContentTypes> = (
  logContent: TLogContentTypes
) => void;

export type RequestOptions = {
  variables?: OperationVariables;
  headers?: ClientHeaders;
  retries?: number;
  signal?: AbortSignal;
};
