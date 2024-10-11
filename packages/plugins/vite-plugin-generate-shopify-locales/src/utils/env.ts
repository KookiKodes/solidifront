import { loadEnv } from 'vite';

export function getStorefrontEnv() {
  const env = loadEnv('all', process.cwd(), 'SHOPIFY_');
  if (!env.SHOPIFY_PUBLIC_STORE_DOMAIN)
    throw new Error('"SHOPIFY_PUBLIC_STORE_DOMAIN" is required');
  if (!env.SHOPIFY_PUBLIC_STOREFRONT_VERSION)
    throw new Error('"SHOPIFY_STOREFRONT_VERSION" is required');
  if (!env.SHOPIFY_PUBLIC_STOREFRONT_TOKEN)
    throw new Error('"SHOPIFY_PUBLIC_STOREFRONT_TOKEN" is required');

  return {
    shopDomain: env.SHOPIFY_PUBLIC_STORE_DOMAIN,
    apiVersion: env.SHOPIFY_PUBLIC_STOREFRONT_VERSION,
    accessToken: env.SHOPIFY_PUBLIC_STOREFRONT_TOKEN,
  };
}
