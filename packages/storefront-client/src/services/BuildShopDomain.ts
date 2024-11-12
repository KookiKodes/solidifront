import type { ClientOptions } from "../schemas";
import * as Effect from "effect/Effect";

export class BuildShopDomain extends Effect.Service<BuildShopDomain>()(
  "@solidifront/storefront-client/BuildShopDomain",
  {
    effect: Effect.gen(function* () {
      return ({ storeName }: Pick<ClientOptions["Type"], "storeName">) =>
        `https://${storeName}.myshopify.com`;
    }),
  },
) {}
