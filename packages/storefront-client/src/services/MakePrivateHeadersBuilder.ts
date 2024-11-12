import type { HttpClientRequest } from "@effect/platform";

import * as Effect from "effect/Effect";

export type MakePrivateHeadersBuilderOptions = {
  privateAccessToken?: string;
  buyerIp?: string;
};

export class MakePrivateHeadersBuilder extends Effect.Service<MakePrivateHeadersBuilder>()(
  "@solidifront/storefront-client/SetPrivateHttpHeaders",
  {
    effect: Effect.gen(function* () {
      const make = (options?: MakePrivateHeadersBuilderOptions) => ({
        "Shopify-Storefront-Private-Token": options?.privateAccessToken,
        "Shopify-Storefront-Buyer-IP": options?.buyerIp,
      });

      return {
        make,
        makeFallback: (
          request: HttpClientRequest.HttpClientRequest,
          options?: MakePrivateHeadersBuilderOptions,
        ) =>
          make({
            privateAccessToken:
              request.headers["shopify-storefront-private-token"] ??
              options?.privateAccessToken,
            buyerIp:
              request.headers["shopify-storefront-buyer-ip"] ??
              options?.buyerIp,
          }),
      };
    }),
  },
) {}
