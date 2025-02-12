import type {
  ClientOptions,
  StorefrontQueries,
  StorefrontMutations,
  CodegenOperations,
  RequestOptions,
  ValidVersion,
} from "./schemas";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as TypedStorefrontClient from "./services/TypedStorefrontClient.js";
import * as StorefrontOperation from "./services/StorefrontOperation.js";

const mainLayer = Layer.mergeAll(TypedStorefrontClient.Default);

const storefrontRuntime = ManagedRuntime.make(mainLayer);

export namespace createStorefrontClient {
  export type Options = ClientOptions["Encoded"];
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
>(
  options: ClientOptions["Encoded"],
) => {
  return storefrontRuntime.runSync(
    Effect.gen(function* () {
      const client = yield* TypedStorefrontClient.make<
        GeneratedQueries,
        GeneratedMutations
      >(options);

      return {
        mutate: <const Mutation extends string>(
          mutation: Mutation,
          options?: RequestOptions<GeneratedMutations[Mutation]["variables"]>,
        ) => storefrontRuntime.runPromise(client.mutate(mutation, options)),

        query: <const Query extends string>(
          query: Query,
          options?: RequestOptions<GeneratedQueries[Query]["variables"]>,
        ) => storefrontRuntime.runPromise(client.query(query, options)),
      };
    }),
  );
};
