import type { createStorefrontClient } from "@solidifront/storefront-client";
import type { StorefrontQueries, StorefrontMutations } from "./types";

import { getRequestEvent } from "solid-js/web";
import {
  extractOperationName,
  buildShopDomain,
  buildStorefrontApiUrl,
  minifyOperation,
} from "@solidifront/storefront-client/utils";

export function getStorefrontClient<
  GeneratedQueries extends StorefrontQueries = StorefrontQueries,
  GeneratedMutations extends StorefrontMutations = StorefrontMutations,
>() {
  const event = getRequestEvent();
  if (!event?.locals.storefront) return null;
  return event?.locals!.storefront as ReturnType<
    typeof createStorefrontClient<GeneratedQueries, GeneratedMutations>
  >;
}

export {
  extractOperationName,
  buildShopDomain,
  buildStorefrontApiUrl,
  minifyOperation,
};
