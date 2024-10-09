import { type Accessor } from "solid-js";
import {
  type createStorefrontClient,
  type StorefrontQueries,
  type StorefrontMutations,
} from "@solidifront/storefront-client";
import { getStorefrontClient } from "./utils";

import { createAsync, cache, action } from "@solidjs/router";

type Transformer = <T>(formData: FormData) => T;
type MutationOptions = {
  transformer?: Transformer;
  name?: string;
};

const defaultTransformer: Transformer = <T>(formData: FormData) => {
  return Object.fromEntries(formData.entries()) as T;
};

export const storefront = {
  async query<const Query extends string>(
    query: Query,
    options?: {
      variables?: createStorefrontClient.OperationVariables<
        StorefrontQueries,
        Query
      >;
      name?: string;
    }
  ) {
    return cache(async (query: Query, variables) => {
      "use server";
      const client = getStorefrontClient();
      if (!client) throw new Error("Storefront client not initialized");
      return client.query<Query>(query, { variables });
    }, options?.name || "storefront-query")(
      query,
      options?.variables
    ) as Promise<
      createStorefrontClient.QueryFnReturn<Query, StorefrontQueries>
    >;
  },
  mutate<const Mutation extends string>(
    mutation: Mutation,
    { transformer = defaultTransformer, name }: MutationOptions = {
      transformer: defaultTransformer,
    }
  ) {
    return action(async (formData: FormData) => {
      "use server";
      const client = getStorefrontClient();
      if (!client) throw new Error("Storefront client not initialized");
      const transformedData =
        transformer<
          createStorefrontClient.OperationReturn<StorefrontMutations, Mutation>
        >(formData);
      return client.mutate(mutation, { variables: transformedData });
    }, name);
  },
};

// function isAsyncIterator<T>(value: any): value is AsyncIterable<T> {
//   return typeof value?.[Symbol.asyncIterator] === "function";
// }

// function isClientStreamIterator<const Query extends string>(
//   value: any
// ): value is ClientStreamIterator<
//   createStorefrontClient.OperationReturn<StorefrontMutations, Query>
// > {
//   return isAsyncIterator(value);
// }

export function createStorefrontQuery<Query extends string>(
  query: Query,
  variables?:
    | createStorefrontClient.OperationVariables<StorefrontQueries, Query>
    | Accessor<
        createStorefrontClient.OperationVariables<StorefrontQueries, Query>
      >
) {
  const clientQuery = createAsync(
    async () => {
      const v =
        typeof variables === "function" && typeof variables !== "undefined"
          ? variables()
          : variables;

      return storefront.query(query, v);
    },
    {
      deferStream: !query.includes("...@defer"),
    }
  );
  return clientQuery;
}

export { getStorefrontClient };
export type { StorefrontMutations, StorefrontQueries };
