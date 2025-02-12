/// <reference types="@solidjs/start/env" />
interface ImportMetaEnv {
  SHOPIFY_PUBLIC_STORE_DOMAIN: string;
  SHOPIFY_PUBLIC_STORE_NAME: string;
  SHOPIFY_PUBLIC_STOREFRONT_VERSION: string;
  SHOPIFY_PUBLIC_STOREFRONT_TOKEN: string;
}

declare namespace NodeJS {
  interface ProcessEnv {
    SHOPIFY_PUBLIC_STORE_DOMAIN: string;
    SHOPIFY_PUBLIC_STORE_NAME: string;
    SHOPIFY_PUBLIC_STOREFRONT_VERSION: string;
    SHOPIFY_PUBLIC_STOREFRONT_TOKEN: string;
    SHOPIFY_PRIVATE_STOREFRONT_TOKEN: string;
  }
}
