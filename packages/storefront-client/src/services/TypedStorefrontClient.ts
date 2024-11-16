import type {
  ClientOptions,
  StorefrontQueries,
  StorefrontMutations,
  CodegenOperations,
} from "../schemas";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";

import * as StorefrontClient from "./StorefrontClient.js";
import { ValidateOperation } from "./ValidateOperation.js";
import { withNamespacedLogSpan } from "../utils/logger.js";

export const Default = Layer.mergeAll(
  StorefrontClient.Default,
  ValidateOperation.Default,
);

export const make = <
  GeneratedQueries extends CodegenOperations = StorefrontQueries,
  GeneratedMutations extends CodegenOperations = StorefrontMutations,
>(
  options: ClientOptions["Encoded"],
) => {
  const loggerLayer = Layer.mergeAll(Logger.pretty);

  const clientEffect = Effect.gen(function* () {
    const createClient = yield* StorefrontClient.StorefrontClient;
    const client = yield* createClient(options);
    const validateOperation = yield* ValidateOperation;

    const executeOperation = <
      const Operation extends string,
      OperationData extends { variables: any; return: any } = {
        variables: any;
        return: any;
      },
    >(
      type: "query" | "mutate",
      originalOperation: Operation,
      options?: StorefrontClient.RequestOptions<OperationData["variables"]>,
    ) =>
      Effect.gen(function* () {
        const operation = yield* validateOperation({
          type,
          operation: originalOperation,
          variables: options?.variables,
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
      options?: StorefrontClient.RequestOptions<
        GeneratedQueries[Query]["variables"]
      >,
    ) =>
      executeOperation<Query, GeneratedQueries[Query]>(
        "query",
        query,
        options,
      ).pipe(Effect.provide(loggerLayer), withNamespacedLogSpan("Query"));

    const mutate = <const Mutation extends string>(
      mutation: Mutation,
      options?: StorefrontClient.RequestOptions<
        GeneratedMutations[Mutation]["variables"]
      >,
    ) =>
      executeOperation<Mutation, GeneratedMutations[Mutation]>(
        "mutate",
        mutation,
        options,
      ).pipe(Effect.provide(loggerLayer), withNamespacedLogSpan("Mutation"));

    return {
      query,
      mutate,
    };
  }).pipe(Effect.provide(loggerLayer), withNamespacedLogSpan("Create"));

  const cachedEffect = Effect.gen(function* () {
    const cachedClient = yield* Effect.cached(clientEffect);
    return yield* cachedClient;
  });

  return cachedEffect.pipe(
    Effect.catchTag("ParseError", (e) => Effect.dieMessage(e.message)),
  );
};
