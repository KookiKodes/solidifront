import type { Accessor } from "solid-js";
import { getStorefrontClient } from "../lib/getStorefrontClient";
import type {
  createStorefrontClient,
  StorefrontMutations,
  StorefrontQueries,
} from "../lib/storefront-client";

import { createAsync, cache, action } from "@solidjs/router";

type Transformer = <T>(formData: FormData) => T;
type MutationOptions = {
  transformer?: Transformer;
};

const defaultTransformer: Transformer = <T>(formData: FormData) => {
  return Object.fromEntries(formData.entries()) as T;
};

export const storefront = {
  query<Query extends string>(
    query: Query,
    variables?: createStorefrontClient.OperationVariables<
      StorefrontQueries,
      Query
    >
  ) {
    return cache(
      async (
        query: Query,
        variables?: createStorefrontClient.OperationVariables<
          StorefrontQueries,
          Query
        >
      ) => {
        "use server";
        const client = getStorefrontClient();
        if (!client) throw new Error("Storefront client not initialized");
        return client.query(query, { variables });
      },
      "storefront-query"
    )(query, variables);
  },
  mutate<Mutation extends string>(
    mutation: Mutation,
    { transformer = defaultTransformer }: MutationOptions = {
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
      return client.mutate(mutation, transformedData);
    });
  },
};

export function createStorefrontQuery<Query extends string>(
  query: Query | Accessor<Query>,
  variables?:
    | createStorefrontClient.OperationVariables<StorefrontQueries, Query>
    | Accessor<
        createStorefrontClient.OperationVariables<StorefrontQueries, Query>
      >
) {
  return createAsync(() => {
    const q = typeof query === "function" ? query() : query,
      // @ts-expect-error
      v = typeof variables === "function" ? variables() : variables;
    return storefront.query(q, v);
  });
}
