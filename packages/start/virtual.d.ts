/// <reference types="vite/client" />

interface ImportMetaEnv {
  SHOPIFY_PUBLIC_STORE_DOMAIN: string;
  SHOPIFY_STOREFRONT_API_VERSION: string;
  SHOPIFY_PUBLIC_STOREFRONT_ACCESS_TOKEN: string;
  SHOPIFY_PRIVATE_STORFRONT_TOKEN: string;
}

declare module "@solidifront/start/middleware:internal" {
  import type { RequestMiddleware } from "@solidjs/start/middleware";

  export function createSolidifrontMiddleware(): RequestMiddleware[];
}
