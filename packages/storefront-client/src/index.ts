import type {
  ClientOptions,
  StorefrontQueries,
  StorefrontMutations,
  CodegenOperations,
} from "./schemas";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as TypedStorefrontClient from "./services/TypedStorefrontClient.js";
import * as StorefrontClient from "./services/StorefrontClient.js";

const mainLayer = Layer.mergeAll(TypedStorefrontClient.Default);

const storefrontRuntime = ManagedRuntime.make(mainLayer);

export namespace createStorefrontClient {
  export type Options = ClientOptions["Encoded"];
}

export type { StorefrontQueries, StorefrontMutations };

export const createStorefrontClient = <
  GeneratedQueries extends CodegenOperations = StorefrontQueries,
  GeneratedMutations extends CodegenOperations = StorefrontMutations,
>(
  options: ClientOptions["Encoded"],
) =>
  storefrontRuntime.runSync(
    Effect.gen(function* () {
      const client = yield* TypedStorefrontClient.make<
        GeneratedQueries,
        GeneratedMutations
      >(options);

      return {
        mutate<const Mutation extends string>(
          mutation: Mutation,
          options?: StorefrontClient.RequestOptions<
            GeneratedMutations[Mutation]["variables"]
          >,
        ) {
          return storefrontRuntime.runPromise(client.mutate(mutation, options));
        },

        query<const Query extends string>(
          query: Query,
          options?: StorefrontClient.RequestOptions<
            GeneratedQueries[Query]["variables"]
          >,
        ) {
          return storefrontRuntime.runPromise(client.query(query, options));
        },
      };
    }),
  );
