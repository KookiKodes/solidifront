import type { createStorefrontClient } from "@solidifront/storefront-client";
import { getRequestEvent } from "solid-js/web";
import type { StorefrontMutations, StorefrontQueries } from "./types";

export { extractOperationName } from "@solidifront/storefront-client/utils";
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
