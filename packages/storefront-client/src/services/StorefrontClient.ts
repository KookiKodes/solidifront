import type { ParseError } from "effect/ParseResult";
import type { HttpClientError } from "@effect/platform/HttpClientError";
import type { HttpBodyError } from "@effect/platform/HttpBody";
import type { Scope } from "effect/Scope";

import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as DefaultHeaders from "./DefaultHeaders.js";
import * as PublicHeaders from "./PublicHeaders.js";
import * as PrivateHeaders from "./PrivateHeaders.js";
import * as ResponseErrors from "../data/ResponseErrors.js";
import * as ClientResponse from "../data/ClientResponse.js";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Schedule from "effect/Schedule";
import * as Function from "effect/Function";

import { buildStorefrontApiUrl } from "../utils/storefront.js";
import { ClientOptions, GraphQLJsonBody, RequestOptions } from "../schemas.js";
import { RETRY_WAIT_TIME } from "../constants.js";
import {
  BadRequestStatusError,
  ForbiddenStatusError,
  LockedStatusError,
  NotFoundStatusError,
  PaymentRequiredStatusError,
  RetriableStatusCodesError,
  StorefrontServerStatusError,
} from "../errors.js";

type MakeResult = Effect.Effect<
  {
    request: <
      const Operation extends string,
      TVariables extends {
        [x: string]: never;
      },
      TData = any,
    >(
      operation: Operation,
      options?: RequestOptions<TVariables>
    ) => Effect.Effect<
      ClientResponse.ClientResponse<TData>,
      ParseError | HttpClientError | HttpBodyError,
      Scope
    >;
  },
  ParseError,
  HttpClient.HttpClient
>;

export const make = (initOptions: ClientOptions["Encoded"]): MakeResult =>
  Effect.gen(function* () {
    const defaultOptions = yield* Schema.decode(ClientOptions)(initOptions);
    const defaultClient = yield* HttpClient.HttpClient;

    const defaultEndpoint = buildStorefrontApiUrl({
      apiVersion: defaultOptions.apiVersion,
      storeName: defaultOptions.storeName,
    });

    const client = defaultClient.pipe(
      HttpClient.mapRequestInput((request) =>
        HttpClientRequest.setHeaders(request, {
          ...DefaultHeaders.makeFallback(request, {
            contentType: defaultOptions.contentType,
            apiVersion: defaultOptions.apiVersion,
          }),
          ...PublicHeaders.makeFallback(request, {
            publicAccessToken: defaultOptions.publicAccessToken,
          }),
          ...PrivateHeaders.makeFallback(request, {
            privateAccessToken: defaultOptions.privateAccessToken
              ? Redacted.value(defaultOptions.privateAccessToken)
              : undefined,
          }),
        })
      ),
      HttpClient.transformResponse((response) =>
        response.pipe(
          Effect.filterOrFail(
            (res) => res.status !== BadRequestStatusError.status,
            () => new BadRequestStatusError()
          ),
          Effect.filterOrFail(
            (res) => res.status !== PaymentRequiredStatusError.status,
            () => new PaymentRequiredStatusError()
          ),
          Effect.filterOrFail(
            (res) => res.status !== ForbiddenStatusError.status,
            () => new ForbiddenStatusError()
          ),
          Effect.filterOrFail(
            (res) => res.status !== NotFoundStatusError.status,
            () => new NotFoundStatusError()
          ),
          Effect.filterOrFail(
            (res) => res.status !== LockedStatusError.status,
            () => new LockedStatusError()
          ),
          Effect.filterOrElse(
            (res) =>
              !RetriableStatusCodesError.validStatuses.includes(res.status),
            (res) => new RetriableStatusCodesError(res.status)
          ),
          Effect.filterOrElse(
            (res) => res.status < 500,
            (res) => new StorefrontServerStatusError(res.status)
          )
        )
      ),
      HttpClient.retry({
        times: defaultOptions.retries,
        schedule: Schedule.spaced(`${RETRY_WAIT_TIME} millis`),
        while: (error) => {
          if (error._tag === "RetriableStatusCodesError") return true;
          return false;
        },
      })
    );

    const makeRequest = <
      const Operation extends string,
      TVariables extends { [x: string]: any },
    >(
      operation: Operation,
      options?: RequestOptions<TVariables>
    ) =>
      Effect.gen(function* () {
        const validatedOptions = yield* Schema.decodeUnknown(RequestOptions)(
          options || {}
        );
        let endpoint = defaultEndpoint;
        if (options?.apiVersion || options?.storeName)
          endpoint = buildStorefrontApiUrl({
            apiVersion:
              validatedOptions.apiVersion || defaultOptions.apiVersion,
            storeName: validatedOptions.storeName || defaultOptions.storeName,
          });

        const request = HttpClientRequest.post(endpoint).pipe(
          HttpClientRequest.setHeaders({
            ...DefaultHeaders.make({
              contentType: validatedOptions?.contentType,
              apiVersion: validatedOptions?.apiVersion,
            }),
            ...PublicHeaders.make({
              publicAccessToken: validatedOptions?.publicAccessToken,
            }),
            ...PrivateHeaders.make({
              privateAccessToken: validatedOptions?.privateAccessToken
                ? Redacted.value(validatedOptions?.privateAccessToken)
                : undefined,
              buyerIp: validatedOptions?.buyerIp,
            }),
          }),
          HttpClientRequest.bodyJson({
            query: operation,
            variables: validatedOptions?.variables,
          })
        );
        return yield* request;
      });

    const executeRequest = <
      const Operation extends string,
      TVariables extends { [x: string]: never },
      TData = any,
    >(
      operation: Operation,
      options?: RequestOptions<TVariables>
    ) =>
      Effect.gen(function* () {
        const request = yield* makeRequest(operation, options);
        const response = yield* client.execute(request);

        const json = yield* Function.pipe(
          response,
          HttpClientResponse.schemaBodyJson(GraphQLJsonBody)
        );

        if (json.errors) {
          return ClientResponse.make<TData>({
            extensions: json.extensions,
            errors: ResponseErrors.make({
              networkStatusCode: response.status,
              graphQLErrors: json.errors,
            }),
          });
        }

        return ClientResponse.make<TData>({
          data: json.data as TData,
          extensions: json.extensions,
        });
      }).pipe(
        Effect.catchAll((error) => {
          if (
            error._tag === "BadRequestStatusError" ||
            error._tag === "ForbiddenStatusError" ||
            error._tag === "LockedStatusError" ||
            error._tag === "NotFoundStatusError" ||
            error._tag === "PaymentRequiredStatusError" ||
            error._tag === "RetriableStatusCodesError" ||
            error._tag === "StorefrontServerStatusError"
          ) {
            return Effect.succeed(
              ClientResponse.make<TData>({
                errors: ResponseErrors.make({
                  networkStatusCode: error.status,
                  graphQLErrors: [],
                  message: error.message,
                }),
              })
            );
          }
          return Effect.fail(error);
        }),
        Effect.tapError(Effect.logError)
      );

    return {
      request: executeRequest,
    };
  }).pipe(Effect.tapError(Effect.logError));

export class StorefrontClient extends Context.Tag(
  "@solidifront/storefront-client/StorefrontClient"
)<StorefrontClient, typeof make>() {}

export const Default: Layer.Layer<
  HttpClient.HttpClient | StorefrontClient,
  never,
  never
> = Layer.mergeAll(
  Layer.succeed(StorefrontClient, StorefrontClient.of(make)),
  FetchHttpClient.layer
);
