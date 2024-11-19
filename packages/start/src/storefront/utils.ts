import type { createStorefrontClient } from "@solidifront/storefront-client";
import type { StorefrontQueries, StorefrontMutations } from "./types";

import { getRequestEvent } from "solid-js/web";

export {
  extractOperationName,
  buildShopDomain,
  buildStorefrontApiUrl,
  minifyOperation,
} from "@solidifront/storefront-client/utils";

export function getStorefrontClient() {
  const event = getRequestEvent();
  if (!event?.locals.storefront) return null;
  return event?.locals!.storefront as ReturnType<
    typeof createStorefrontClient<StorefrontQueries, StorefrontMutations>
  >;
}
