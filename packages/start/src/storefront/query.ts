import type { Accessor } from "solid-js";
import type { StorefrontQueries } from "./types";
import { createStorefrontClient } from "@solidifront/storefront-client";

import { storefront } from "./storefront";
import { getOperationName } from "./utils";

import { cache, createAsyncStore } from "@solidjs/router";

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
