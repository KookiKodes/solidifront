import type { QueryVariables, MutationVariables } from "./types";

import { getStorefrontClient } from "./utils.js";

export const storefront = {
  query: async <const Query extends string>(
    query: Query,
    variables?: QueryVariables<Query>,
  ) => {
    "use server";
    const client = getStorefrontClient();
    if (!client) throw new Error("Storefront client not found!");
    return client.query<Query>(query, { variables } as any);
  },
  mutate: async <const Mutation extends string>(
    mutation: Mutation,
    variables: MutationVariables<Mutation>,
  ) => {
    "use server";
    const client = getStorefrontClient();
    if (!client) throw new Error("Storefront client not found!");
    return client.mutate<Mutation>(mutation, { variables } as any);
  },
};
