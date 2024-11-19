import type { Accessor } from "solid-js";
import type { MutationVariables, QueryVariables } from "./types";
import type { ExtractOperationName } from "@solidifront/storefront-client/utils";

import { action, json } from "@solidjs/router";
import { query, createAsyncStore } from "@solidjs/router";

import { storefront } from "./storefront.js";
import { extractOperationName } from "./utils.js";

export function createQueryCache<Query extends string>(operation: Query) {
  return query(
    async (variables?: QueryVariables<Query>) =>
      storefront.query<Query>(operation, variables),
    extractOperationName(operation),
  );
}

export function createAsyncQuery<Query extends string>(
  query: Query,
  variables?: QueryVariables<Query> | Accessor<QueryVariables<Query>>,
) {
  const cachedQuery = createQueryCache<Query>(query);
  return createAsyncStore(async () => {
    const v = variables instanceof Function ? variables() : variables;
    return cachedQuery(v);
  });
}

export function createMutationAction<Mutation extends string>(
  mutation: Mutation,
  revalidateQueries?: string[],
) {
  const revalidationKeys = (revalidateQueries || []).map((query) =>
    extractOperationName(query),
  );
  return action(
    async (
      mutation: Mutation,
      revalidationKeys: string[] = [],
      formData: FormData,
    ) => {
      "use server";
      const req = await storefront.mutate<Mutation>(
        mutation,
        Object.fromEntries(formData.entries()) as MutationVariables<Mutation>,
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
        },
      );
    },
    extractOperationName(mutation),
  ).with(mutation, revalidationKeys);
}

export const createCombinedOperations = <
  const Queries extends string[],
  const Mutations extends string[],
>(
  queries: Queries,
  mutations: Mutations,
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
      const queryName = extractOperationName(query);
      if (queryName) acc[queryName] = createQueryCache<Query>(query);
      return acc;
    },
    {} as CachedQueries,
  );

  const mutationActions = mutations.reduce<MutationActions>(
    (acc: MutationActions, mutation: Mutation) => {
      const mutationName = extractOperationName(mutation);
      if (mutationName)
        acc[mutationName] = createMutationAction<Mutation>(mutation, queries);
      return acc;
    },
    {} as MutationActions,
  );

  return [queryFunctions, mutationActions] as const;
};
