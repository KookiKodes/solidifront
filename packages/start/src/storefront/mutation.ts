import type { StorefrontMutations } from "./types";

import { action, json } from "@solidjs/router";
import { createStorefrontClient } from "@solidifront/storefront-client";

import { storefront } from "./storefront";
import { getOperationName } from "./utils";

// Simple helper to force using server-side storefront client

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
      revalidationKeys: string[],
      params: URLSearchParams
    ) => {
      "use server";
      const req = await storefront.mutate<Mutation>(
        mutation,
        Object.fromEntries(params) as createStorefrontClient.OperationVariables<
          StorefrontMutations,
          Mutation
        >
      );
      return json(req, {
        revalidate: revalidationKeys,
        status: req.errors ? 500 : 200,
      });
    },
    getOperationName(mutation)
  ).with(mutation, revalidationKeys);
}
