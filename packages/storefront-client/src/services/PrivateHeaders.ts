import type { HttpClientRequest } from "@effect/platform";

export type Options = {
  privateAccessToken?: string;
  buyerIp?: string;
};

export const make = (options?: Options) => ({
  "Shopify-Storefront-Private-Token": options?.privateAccessToken,
  "Shopify-Storefront-Buyer-IP": options?.buyerIp,
});

export const makeFallback = (
  request: HttpClientRequest.HttpClientRequest,
  options?: Options,
) =>
  make({
    privateAccessToken:
      request.headers["shopify-storefront-private-token"] ??
      options?.privateAccessToken,
    buyerIp: request.headers["shopify-storefront-buyer-ip"] ?? options?.buyerIp,
  });
