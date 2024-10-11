import type {
  StorefrontQueries,
  StorefrontMutations,
  ExtractOperationName,
} from "./types";
import { createStorefrontClient } from "@solidifront/storefront-client";

import { getRequestEvent } from "solid-js/web";

export function getStorefrontClient() {
  const event = getRequestEvent();
  if (!event?.locals.storefront) return null;
  return event?.locals!.storefront as ReturnType<
    typeof createStorefrontClient<StorefrontQueries, StorefrontMutations>
  >;
}

export function getOperationName<const Operation extends string>(
  operation: Operation
): ExtractOperationName<Operation> {
  const match = operation.match(
    /(query|mutation)\s+(\w+)\s*(?:\([\s\S]*?\))?\s*{/
  );
  if (!match) {
    throw new Error(`Operation name not found in operation: ${operation}`);
  }
  return match[1] as ExtractOperationName<Operation>;
}
