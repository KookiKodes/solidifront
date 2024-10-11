import type { Accessor } from "solid-js";
import type { StorefrontQueries } from "./types";
import { createStorefrontClient } from "@solidifront/storefront-client";

import { storefront } from "./storefront";
import { getOperationName } from "./utils";

import { cache, createAsyncStore } from "@solidjs/router";

// Simple helper to force using server-side storefront client

export function createQueryCache<Query extends string>(query: Query) {
  return cache(
    async (
      query: Query,
      variables?: createStorefrontClient.OperationVariables<
        StorefrontQueries,
        Query
      >
    ) => {
      return storefront.query<Query>(query, variables);
    },
    getOperationName(query)
  );
}

export function createAsyncQuery<Query extends string>({
  query,
  variables,
}: {
  query: Query;
  variables?:
    | Accessor<
        createStorefrontClient.OperationVariables<StorefrontQueries, Query>
      >
    | createStorefrontClient.OperationVariables<StorefrontQueries, Query>;
  name?: string;
}) {
  const cachedQuery = createQueryCache(query);
  return createAsyncStore(async () => {
    const v =
      typeof variables === "function" && typeof variables !== "undefined"
        ? variables()
        : variables;
    return cachedQuery(query, v);
  });
}
