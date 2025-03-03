import type {
  ClientOptions,
  StorefrontQueries,
  StorefrontMutations,
  CodegenOperations,
  RequestOptions,
  ValidVersion,
} from "./schemas";

import * as Effect from "effect/Effect";
import * as TypedStorefrontClient from "./services/TypedStorefrontClient.js";
import * as Logger from "effect/Logger";
import * as LogLevel from "effect/LogLevel";
import * as Layer from "effect/Layer";

export namespace createStorefrontClient {
  export type Options = ClientOptions["Encoded"] & {
    logger?: Parameters<typeof Logger.make>[0];
  };
  export type Variables<
    Operation extends string,
    GeneratedOperations extends CodegenOperations =
      | StorefrontQueries
      | StorefrontMutations,
  > = GeneratedOperations[Operation]["variables"];
  export type ReturnData<
    Operation extends string,
    GeneratedOperations extends CodegenOperations =
      | StorefrontMutations
      | StorefrontMutations,
  > = GeneratedOperations[Operation]["return"];
}

export type { StorefrontQueries, StorefrontMutations, ValidVersion };

export const createStorefrontClient = <
  GeneratedQueries extends CodegenOperations = StorefrontQueries,
  GeneratedMutations extends CodegenOperations = StorefrontMutations,
>({
  logger,
  ...initOptions
}: createStorefrontClient.Options) => {
  let layer = TypedStorefrontClient.Default;
  let minimumLogLevel = LogLevel.None;
  let loggerLayer = Logger.pretty;

  if (logger) {
    loggerLayer = Logger.replace(Logger.defaultLogger, Logger.make(logger));
    layer = Layer.mergeAll(loggerLayer, layer);
    minimumLogLevel = LogLevel.All;
  }

  return Effect.runSync(
    Effect.gen(function* () {
      const client = yield* TypedStorefrontClient.make<
        GeneratedQueries,
        GeneratedMutations
      >(initOptions);

      return {
        mutate: <const Mutation extends string>(
          mutation: Mutation,
          options?: RequestOptions<GeneratedMutations[Mutation]["variables"]>,
        ) =>
          Effect.runPromise(
            client
              .mutate(mutation, options)
              .pipe(
                Logger.withMinimumLogLevel(minimumLogLevel),
                Effect.provide(loggerLayer),
              ),
            {
              signal: options?.signal,
            },
          ),

        query: <const Query extends string>(
          query: Query,
          options?: RequestOptions<GeneratedQueries[Query]["variables"]>,
        ) =>
          Effect.runPromise(
            client
              .query(query, options)
              .pipe(
                Logger.withMinimumLogLevel(minimumLogLevel),
                Effect.provide(loggerLayer),
              ),
            {
              signal: options?.signal,
            },
          ),
      };
    }).pipe(Logger.withMinimumLogLevel(minimumLogLevel), Effect.provide(layer)),
  );
};
