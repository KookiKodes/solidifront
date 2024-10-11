import type { StorefrontQueries, StorefrontMutations } from "../types";
import { createStorefrontClient as _createStorefrontClient } from "@solidifront/storefront-client";
import { getStorefrontClient } from "../utils.js";
import { isServer } from "solid-js/web";

export const createStorefrontClient = (
  options: Omit<
    _createStorefrontClient.Config,
    "publicAccessToken" | "privateAccessToken" | "apiVersion" | "storeDomain"
  >
): ReturnType<
  typeof _createStorefrontClient<StorefrontQueries, StorefrontMutations>
> => {
  return _createStorefrontClient<StorefrontQueries, StorefrontMutations>({
    ...options,
    apiVersion: import.meta.env.SHOPIFY_PUBLIC_STOREFRONT_VERSION,
    storeDomain: import.meta.env.SHOPIFY_PUBLIC_STORE_DOMAIN,
    privateAccessToken: isServer
      ? import.meta.env.SHOPIFY_PRIVATE_ACCESS_TOKEN
      : undefined,
    publicAccessToken: isServer
      ? import.meta.env.SHOPIFY_PUBLIC_ACCESS_TOKEN
      : undefined,
  });
};

export const storefront = {
  async query<const Query extends string>(
    query: Query,
    variables?: _createStorefrontClient.OperationVariables<
      StorefrontQueries,
      Query
    >
  ) {
    "use server";
    const client = getStorefrontClient();
    if (!client) throw new Error("Storefront client not found!");
    return client.query<Query>(query, { variables });
  },
  async mutate<const Mutation extends string>(
    mutation: Mutation,
    variables: _createStorefrontClient.OperationVariables<
      StorefrontMutations,
      Mutation
    >
  ) {
    "use server";
    const client = getStorefrontClient();
    if (!client) throw new Error("Storefront client not found!");
    return client.mutate<Mutation>(mutation, { variables });
  },
};
