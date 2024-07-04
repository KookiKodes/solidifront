import type { FetchEvent } from "@solidjs/start/server";
import { createStorefrontApiClient } from "@shopify/storefront-api-client";

export const createShopifyContext = async (event: FetchEvent) => {
  if (event.locals.shopify) return;
  const env = event.locals.env;

  const storefront = createStorefrontApiClient({
    storeDomain: env.SHOPIFY_PUBLIC_STORE_DOMAIN,
    apiVersion: env.SHOPIFY_STOREFRONT_API_VERSION,
    publicAccessToken: env.SHOPIFY_PUBLIC_STOREFRONT_ACCESS_TOKEN,
    // privateAccessToken: env.SHOPIFY_PRIVATE_STOREFRONT_ACCESS_TOKEN,
  });

  event.locals.shopify = {
    storefront,
  };
};

declare module "@solidjs/start/server" {
  interface RequestEventLocals {
    shopify: {
      storefront: ReturnType<typeof createStorefrontApiClient>;
    };
  }
}
