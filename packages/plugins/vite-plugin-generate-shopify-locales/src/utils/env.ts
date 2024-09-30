import { loadEnv } from 'vite';

export function getStorefrontEnv() {
  const env = loadEnv('all', process.cwd(), 'SHOPIFY_');
  if (!env.SHOPIFY_PUBLIC_STORE_DOMAIN)
    throw new Error('SHOPIFY_PUBLIC_STORE_DOMAIN is required');
  if (!env.SHOPIFY_STOREFRONT_API_VERSION)
    throw new Error('SHOPIFY_STOREFRONT_API_VERSION is required');
  if (!env.SHOPIFY_PUBLIC_STOREFRONT_ACCESS_TOKEN)
    throw new Error('SHOPIFY_PUBLIC_STOREFRONT_ACCESS_TOKEN is required');

  return {
    shopDomain: env.SHOPIFY_PUBLIC_STORE_DOMAIN,
    apiVersion: env.SHOPIFY_STOREFRONT_API_VERSION,
    accessToken: env.SHOPIFY_PUBLIC_STOREFRONT_ACCESS_TOKEN,
  };
}
