import {
  createStorefrontClient,
  type StorefrontMutations,
  type StorefrontQueries,
} from "@solidifront/storefront-client";

import { getRequestEvent } from "solid-js/web";

export function getStorefrontClient() {
  const event = getRequestEvent();
  if (!event?.locals.storefront) return null;
  return event?.locals!.storefront as ReturnType<
    typeof createStorefrontClient<StorefrontQueries, StorefrontMutations>
  >;
}
