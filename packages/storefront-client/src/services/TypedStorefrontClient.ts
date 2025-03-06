import type {
  ClientOptions,
  StorefrontQueries,
  StorefrontMutations,
  CodegenOperations,
  RequestOptions,
} from "../schemas";
import type { ClientResponse } from "../data/ClientResponse";
import type { ExtractOperationNameError } from "../errors";
import type { HttpClientError } from "@effect/platform/HttpClientError";
import type { HttpBodyError } from "@effect/platform/HttpBody";
import type { HttpClient } from "@effect/platform/HttpClient";
import type { ParseError } from "effect/ParseResult";
import type { Layer } from "effect/Layer";

import * as Effect from "effect/Effect";

import * as StorefrontOperation from "./StorefrontOperation.js";
import * as StorefrontClient from "./StorefrontClient.js";
import * as LoggerUtils from "./LoggerUtils.js";

type MakeReturn<
  GeneratedQueries extends CodegenOperations = StorefrontQueries,
  GeneratedMutations extends CodegenOperations = StorefrontMutations,
> = Effect.Effect<
  {
    query: <const Query extends string>(
      query: Query,
      options?: RequestOptions<GeneratedQueries[Query]["variables"]>
    ) => Effect.Effect<
      ClientResponse<GeneratedQueries[Query]["return"]>,
      ParseError | HttpClientError | ExtractOperationNameError | HttpBodyError,
      never
    >;
    mutate: <const Mutation extends string>(
      mutation: Mutation,
      options?: RequestOptions<GeneratedMutations[Mutation]["variables"]>
    ) => Effect.Effect<
      ClientResponse<GeneratedMutations[Mutation]["return"]>,
      ParseError | HttpClientError | ExtractOperationNameError | HttpBodyError,
      never
    >;
  },
  never,
  StorefrontClient.StorefrontClient | HttpClient
>;

export const make = <
  GeneratedQueries extends CodegenOperations = StorefrontQueries,
  GeneratedMutations extends CodegenOperations = StorefrontMutations,
>(
  options: ClientOptions["Encoded"]
): MakeReturn<GeneratedQueries, GeneratedMutations> => {
  const clientEffect = Effect.gen(function* () {
    const createClient = yield* StorefrontClient.StorefrontClient;
    const client = yield* createClient(options);

    const executeOperation = <
      const Operation extends string,
      OperationData extends { variables: any; return: any } = {
        variables: any;
        return: any;
      },
    >(
      type: "query" | "mutate",
      originalOperation: Operation,
      options?: RequestOptions<OperationData["variables"]>
    ) =>
      Effect.gen(function* () {
        const operation = yield* StorefrontOperation.validate({
          type,
          operation: originalOperation,
          variables: Reflect.get(options || {}, "variables"),
        });

        const response = yield* client.request<
          Operation,
          OperationData["variables"],
          OperationData["return"]
        >(operation, options);

        if (response?.errors) {
          yield* Effect.logError(response);
        } else {
          yield* Effect.logInfo(response);
        }

        return response;
      }).pipe(Effect.scoped);

    const query = <const Query extends string>(
      query: Query,
      options?: RequestOptions<GeneratedQueries[Query]["variables"]>
    ) =>
      executeOperation<Query, GeneratedQueries[Query]>(
        "query",
        query,
        options
      ).pipe(LoggerUtils.withNamespacedLogSpan("Query"));

    const mutate = <const Mutation extends string>(
      mutation: Mutation,
      options?: RequestOptions<GeneratedMutations[Mutation]["variables"]>
    ) =>
      executeOperation<Mutation, GeneratedMutations[Mutation]>(
        "mutate",
        mutation,
        options
      ).pipe(LoggerUtils.withNamespacedLogSpan("Mutation"));

    return {
      query,
      mutate,
    };
  }).pipe(LoggerUtils.withNamespacedLogSpan("Create"));

  const cachedEffect = Effect.gen(function* () {
    const cachedClient = yield* Effect.cached(clientEffect);
    return yield* cachedClient;
  });

  return cachedEffect.pipe(
    Effect.catchTag("ParseError", (e) => Effect.dieMessage(e.message))
  );
};

export const Default: Layer<
  HttpClient | StorefrontClient.StorefrontClient,
  never,
  never
> = StorefrontClient.Default;
