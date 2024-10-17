import type {
  StorefrontQueries,
  StorefrontMutations,
} from "@solidifront/storefront-client";

import { createStorefrontClient } from "@solidifront/storefront-client";
import { getStorefrontClient } from "./utils.js";

export const storefront = {
  query: async <const Query extends string>(
    query: Query,
    variables?: createStorefrontClient.OperationVariables<
      StorefrontQueries,
      Query
    >
  ) => {
    "use server";
    const client = getStorefrontClient();
    if (!client) throw new Error("Storefront client not found!");
    return client.query<Query>(query, { variables });
  },
  mutate: async <const Mutation extends string>(
    mutation: Mutation,
    variables: createStorefrontClient.OperationVariables<
      StorefrontMutations,
      Mutation
    >
  ) => {
    "use server";
    const client = getStorefrontClient();
    if (!client) throw new Error("Storefront client not found!");
    return client.mutate<Mutation>(mutation, { variables });
  },
};
