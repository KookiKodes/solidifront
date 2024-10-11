import { createStorefrontClient as _createStorefrontClient, type StorefrontQueries, type StorefrontMutations } from "@solidifront/start";
import { isServer } from "solid-js/web";

export const createStorefrontClient = (options: Omit<_createStorefrontClient.Config, "publicAccessToken" | "privateAccessToken" | "apiVersion" | "storeDomain">): ReturnType<typeof _createStorefrontClient<StorefrontQueries, StorefrontMutations>> => {
    return _createStorefrontClient<StorefrontQueries, StorefrontMutations>({
        ...options,
        apiVersion: import.meta.env.SHOPIFY_PUBLIC_STOREFRONT_VERSION,
        storeDomain: import.meta.env.SHOPIFY_PUBLIC_STORE_DOMAIN,
        privateAccessToken: isServer ? import.meta.env.SHOPIFY_PRIVATE_ACCESS_TOKEN : undefined,
        publicAccessToken: isServer ? import.meta.env.SHOPIFY_PUBLIC_ACCESS_TOKEN : undefined,
    })
}