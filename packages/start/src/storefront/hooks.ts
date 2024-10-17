import type { Accessor } from "solid-js";
import type {
  StorefrontQueries,
  StorefrontMutations,
} from "@solidifront/storefront-client";
import type { ExtractOperationName } from "./types";

import { action, json } from "@solidjs/router";
import { createStorefrontClient } from "@solidifront/storefront-client";
import { cache, createAsyncStore } from "@solidjs/router";

import { storefront } from "./storefront.js";
import { getOperationName } from "./utils.js";

export function createQueryCache<Query extends string>(query: Query) {
  return cache(
    async (
      variables?: createStorefrontClient.OperationVariables<
        StorefrontQueries,
        Query
      >
    ) => storefront.query<Query>(query, variables),
    getOperationName(query)
  );
}

export function createAsyncQuery<Query extends string>(
  query: Query,
  variables?:
    | Accessor<
        createStorefrontClient.OperationVariables<StorefrontQueries, Query>
      >
    | createStorefrontClient.OperationVariables<StorefrontQueries, Query>
) {
  const cachedQuery = createQueryCache<Query>(query);
  return createAsyncStore(async () => {
    const v =
      typeof variables === "function" && typeof variables !== "undefined"
        ? variables()
        : variables;
    return cachedQuery(v);
  });
}

export function createMutationAction<Mutation extends string>(
  mutation: Mutation,
  revalidateQueries?: string[]
) {
  const revalidationKeys = (revalidateQueries || []).map((query) =>
    getOperationName(query)
  );
  return action(
    async (
      mutation: Mutation,
      revalidationKeys: string[] = [],
      formData: FormData
    ) => {
      "use server";
      const req = await storefront.mutate<Mutation>(
        mutation,
        Object.fromEntries(
          formData.entries()
        ) as createStorefrontClient.OperationVariables<
          StorefrontMutations,
          Mutation
        >
      );
      return json(
        {
          data: req?.data,
          errors: req.errors,
        },
        {
          revalidate:
            revalidationKeys.length > 0 ? revalidationKeys : "garbage",
          status: req.errors ? 500 : 200,
        }
      );
    },
    getOperationName(mutation)
  ).with(mutation, revalidationKeys);
}

export const createCombinedOperations = <
  const Queries extends string[],
  const Mutations extends string[],
>(
  queries: Queries,
  mutations: Mutations
) => {
  type Query = Queries[number];
  type QueryNames = ExtractOperationName<Query>;
  type CachedQueries = Record<
    QueryNames,
    ReturnType<typeof createQueryCache<Query>>
  >;
  type Mutation = Mutations[number];
  type MutationNames = ExtractOperationName<Mutation>;
  type MutationActions = Record<
    MutationNames,
    ReturnType<typeof createMutationAction<Mutation>>
  >;

  const queryFunctions = queries.reduce<CachedQueries>(
    (acc: CachedQueries, query: Query) => {
      const queryName = getOperationName(query);
      if (queryName) acc[queryName] = createQueryCache<Query>(query);
      return acc;
    },
    {} as CachedQueries
  );

  const mutationActions = mutations.reduce<MutationActions>(
    (acc: MutationActions, mutation: Mutation) => {
      const mutationName = getOperationName(mutation);
      if (mutationName)
        acc[mutationName] = createMutationAction<Mutation>(mutation, queries);
      return acc;
    },
    {} as MutationActions
  );

  return [queryFunctions, mutationActions] as const;
};
