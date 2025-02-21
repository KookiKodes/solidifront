import type { StorefrontQueries, StorefrontMutations } from "./types";

import {
  type CodegenOperations,
  type ValidVersion,
  createStorefrontClient as _createStorefrontClient,
} from "@solidifront/storefront-client";
import { isServer } from "solid-js/web";

export const createStorefrontClient = <
  GeneratedQueries extends CodegenOperations = StorefrontQueries,
  GeneratedMutations extends CodegenOperations = StorefrontMutations,
>(
  options?: Omit<
    _createStorefrontClient.Options,
    "publicAccessToken" | "privateAccessToken" | "apiVersion" | "storeName"
  >,
) => {
  return _createStorefrontClient<GeneratedQueries, GeneratedMutations>({
    ...(options || {}),
    storeName: import.meta.env.SHOPIFY_PUBLIC_STORE_NAME,
    apiVersion: import.meta.env
      .SHOPIFY_PUBLIC_STOREFRONT_VERSION as ValidVersion,
    privateAccessToken: isServer
      ? import.meta.env.SHOPIFY_PRIVATE_ACCESS_TOKEN
      : undefined,
    publicAccessToken: !isServer
      ? import.meta.env.SHOPIFY_PUBLIC_ACCESS_TOKEN
      : undefined,
  });
};
