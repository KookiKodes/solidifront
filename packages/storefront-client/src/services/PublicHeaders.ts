import type { HttpClientRequest } from "@effect/platform";

export type Options = {
	publicAccessToken?: string;
};

export const make = (options?: Options) => ({
	"X-Shopify-Storefront-Access-Token": options?.publicAccessToken,
});

export const makeFallback = (
	request: HttpClientRequest.HttpClientRequest,
	options?: Options,
) =>
	make({
		publicAccessToken:
			request.headers["x-shopify-storefront-access-token"] ??
			options?.publicAccessToken,
	});
