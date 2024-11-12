import type {
  ClientOptions,
  StorefrontQueries,
  StorefrontMutations,
  CodegenOperations,
} from "./schemas";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";

import * as StorefrontClient from "./services/StorefrontClient.js";
import { ValidateOperation } from "./services/ValidateOperation.js";
import { withNamespacedLogSpan } from "./utils/logger.js";

export type { StorefrontQueries, StorefrontMutations };

export const createClientEffect = <
  GeneratedQueries extends CodegenOperations = StorefrontQueries,
  GeneratedMutations extends CodegenOperations = StorefrontMutations,
>(
  options: ClientOptions["Encoded"]
) => {
  const clientLayer = Layer.mergeAll(
    StorefrontClient.layer(options),
    ValidateOperation.Default,
    Logger.pretty
  );
  const fetchLayer = Layer.mergeAll(Logger.pretty);

  const clientEffect = Effect.gen(function* () {
    yield* Effect.logInfo("Creating...");
    const client = yield* StorefrontClient.StorefrontClient;
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
      options?: StorefrontClient.RequestOptions<OperationData["variables"]>
    ) =>
      Effect.gen(function* () {
        const operation = yield* validateOperation({
          type,
          operation: originalOperation,
          variables: options?.variables,
        });

        const response = yield* client.request<
          Operation,
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
      >
    ) =>
      Effect.runPromise(
        executeOperation<Query, GeneratedQueries[Query]>(
          "query",
          query,
          options
        ).pipe(Effect.provide(fetchLayer), withNamespacedLogSpan("Query"))
      );

    const mutate = <const Mutation extends string>(
      mutation: Mutation,
      options?: StorefrontClient.RequestOptions<
        GeneratedMutations[Mutation]["variables"]
      >
    ) =>
      Effect.runPromise(
        executeOperation<Mutation, GeneratedMutations[Mutation]>(
          "mutate",
          mutation,
          options
        ).pipe(Effect.provide(fetchLayer), withNamespacedLogSpan("Mutation"))
      );

    yield* Effect.logInfo("Created!");

    return {
      query,
      mutate,
    };
  }).pipe(Effect.provide(clientLayer), withNamespacedLogSpan("Client"));

  return Effect.gen(function* () {
    const cachedClient = yield* Effect.cached(clientEffect);
    return yield* cachedClient;
  });
};

export namespace createStorefrontClient {
  export type Options = ClientOptions["Encoded"];
}

export const createStorefrontClient = <
  GeneratedQueries extends CodegenOperations = StorefrontQueries,
  GeneratedMutations extends CodegenOperations = StorefrontMutations,
>(
  options: ClientOptions["Encoded"]
) =>
  Effect.runSync(
    createClientEffect<GeneratedQueries, GeneratedMutations>(options)
  );
