/// <reference types="vite/client" />

interface ImportMetaEnv {
  SHOPIFY_PUBLIC_STORE_NAME: string;
  SHOPIFY_PUBLIC_STOREFRONT_VERSION: string;
  SHOPIFY_PUBLIC_STOREFRONT_TOKEN: string;
  SHOPIFY_PRIVATE_STOREFRONT_TOKEN: string;
}

declare module "@solidifront/start/middleware:internal" {
  import type { RequestMiddleware } from "@solidjs/start/middleware";

  export function createSolidifrontMiddleware(): RequestMiddleware[];
}

declare namespace NodeJS {
  interface ProcessEnv {
    SHOPIFY_PUBLIC_STORE_NAME: string;
    SHOPIFY_PUBLIC_STOREFRONT_VERSION: string;
    SHOPIFY_PUBLIC_STOREFRONT_TOKEN: string;
    SHOPIFY_PRIVATE_STOREFRONT_TOKEN: string;
  }
}
