import { createStorefrontClient } from "@solidifront/start";
import { createMiddleware } from "@solidifront/start/middleware";
import { shopQuery } from "./graphql/storefront/queries";

export default createMiddleware({
  onRequest: [
    async (event) => {
      const client = createStorefrontClient({
        storeDomain: import.meta.env.SHOPIFY_PUBLIC_STORE_DOMAIN,
        apiVersion: import.meta.env.SHOPIFY_STOREFRONT_API_VERSION,
        privateAccessToken: import.meta.env.SHOPIFY_PRIVATE_STORFRONT_TOKEN,
        publicAccessToken: import.meta.env.SHOPIFY_PUBLIC_STORFRONT_TOKEN,
      });
    },
  ],
});
