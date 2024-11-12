import type { ClientOptions } from "../schemas";

import * as Effect from "effect/Effect";

import { BuildShopDomain } from "./BuildShopDomain.js";

export class BuildStorefrontApiUrl extends Effect.Service<BuildStorefrontApiUrl>()(
  "@solidifront/storefront-client/BuildStorefrontApiUrl",
  {
    effect: Effect.gen(function* () {
      const buildShopDomain = yield* BuildShopDomain;
      return ({
        apiVersion,
        storeName,
      }: Pick<ClientOptions["Type"], "apiVersion" | "storeName">) =>
        `${buildShopDomain({ storeName })}/api/${apiVersion}/graphql.json`;
    }),
    dependencies: [BuildShopDomain.Default],
  },
) {}
