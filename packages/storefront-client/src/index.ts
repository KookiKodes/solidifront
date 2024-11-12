import type {
  ClientOptions,
  StorefrontQueries,
  StorefrontMutations,
  CodegenOperations,
} from "./schemas";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as ManagedRuntime from "effect/ManagedRuntime";

import * as StorefrontClient from "./services/StorefrontClient.js";
import { ValidateOperation } from "./services/ValidateOperation.js";
import { withNamespacedLogSpan } from "./utils/logger.js";

export type { StorefrontQueries, StorefrontMutations };

const mainLayer = Layer.mergeAll(
  StorefrontClient.Default,
  ValidateOperation.Default,
);

const storefrontRuntime = ManagedRuntime.make(mainLayer);

export const createClientEffect = <
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
          OperationData["return"]
        >(operation, options);

        if (response?.errors) {
          yield* Effect.logError(response);
        } else {
          yield* Effect.logInfo(response);
        }

        return response;
      }).pipe(
        Effect.scoped,
        // Effect.catchTags({
        //   ExtractOperationNameError: (e) => Effect.dieMessage(e.message),
        //   RequestError: (e) => Effect.dieMessage(e.message),
        //   ResponseError: (e) => Effect.dieMessage(e.message),
        //   HttpBodyError: (e) => Effect.die(e.reason.error),
        //   ParseError: (e) => Effect.dieMessage(e.message),
        // }),
      );

    const query = <const Query extends string>(
      query: Query,
      options?: StorefrontClient.RequestOptions<
        GeneratedQueries[Query]["variables"]
      >,
    ) =>
      storefrontRuntime.runPromise(
        executeOperation<Query, GeneratedQueries[Query]>(
          "query",
          query,
          options,
        ).pipe(Effect.provide(loggerLayer), withNamespacedLogSpan("Query")),
      );

    const mutate = <const Mutation extends string>(
      mutation: Mutation,
      options?: StorefrontClient.RequestOptions<
        GeneratedMutations[Mutation]["variables"]
      >,
    ) =>
      storefrontRuntime.runPromise(
        executeOperation<Mutation, GeneratedMutations[Mutation]>(
          "mutate",
          mutation,
          options,
        ).pipe(Effect.provide(loggerLayer), withNamespacedLogSpan("Mutation")),
      );

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

export namespace createStorefrontClient {
  export type Options = ClientOptions["Encoded"];
}

export const createStorefrontClient = <
  GeneratedQueries extends CodegenOperations = StorefrontQueries,
  GeneratedMutations extends CodegenOperations = StorefrontMutations,
>(
  options: ClientOptions["Encoded"],
) =>
  storefrontRuntime.runSync(
    createClientEffect<GeneratedQueries, GeneratedMutations>(options),
  );
