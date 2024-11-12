import type { HttpClientRequest } from "@effect/platform";

import * as Effect from "effect/Effect";

export type MakePublicHeadersBuilderOptions = {
  publicAccessToken?: string;
};

export class MakePublicHeadersBuilder extends Effect.Service<MakePublicHeadersBuilder>()(
  "@solidifront/storefront-client/MakePublicHeadersBuilder",
  {
    effect: Effect.gen(function* () {
      const make = (options?: MakePublicHeadersBuilderOptions) => ({
        "X-Shopify-Storefront-Access-Token": options?.publicAccessToken,
      });
      return {
        make,
        makeFallback: (
          request: HttpClientRequest.HttpClientRequest,
          options?: MakePublicHeadersBuilderOptions,
        ) =>
          make({
            publicAccessToken:
              request.headers["x-shopify-storefront-access-token"] ??
              options?.publicAccessToken,
          }),
      };
    }),
  },
) {}
