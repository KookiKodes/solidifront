import type {
	createStorefrontClient,
	StorefrontQueries,
	StorefrontMutations,
} from "@solidifront/storefront-client";
import { getRequestEvent } from "solid-js/web";

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
