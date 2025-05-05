import { createStorefrontClient } from "@solidifront/storefront-client";
import type {
  QueryVariables,
  MutationVariables,
  StorefrontQueries,
  StorefrontMutations,
} from "./types";

import { getStorefrontClient } from "./utils.js";

type Storefront = {
  query<const Query extends string, GeneratedQueries extends StorefrontQueries>(
    query: Query,
    variables?: QueryVariables<Query>
  ): createStorefrontClient.Return<Query, GeneratedQueries>;
  mutate<
    const Mutation extends string,
    GeneratedMutations extends StorefrontMutations,
  >(
    query: Mutation,
    variables?: QueryVariables<Mutation>
  ): createStorefrontClient.Return<Mutation, GeneratedMutations>;
};

export const storefront: Storefront = {
  query: async <const Query extends string>(
    query: Query,
    variables?: QueryVariables<Query>
  ) => {
    "use server";
    const client = getStorefrontClient<
      StorefrontQueries,
      StorefrontMutations
    >();
    if (!client) throw new Error("Storefront client not found!");
    return client.query<Query>(query, { variables } as any);
  },
  mutate: async <
    const Mutation extends string,
    GeneratedQueries extends StorefrontQueries = StorefrontQueries,
    GeneratedMutations extends StorefrontMutations = StorefrontMutations,
  >(
    mutation: Mutation,
    variables?: MutationVariables<Mutation>
  ) => {
    "use server";
    const client = getStorefrontClient<GeneratedQueries, GeneratedMutations>();
    if (!client) throw new Error("Storefront client not found!");
    return client.mutate<Mutation>(mutation, { variables } as any);
  },
} as const;
