import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Context from "effect/Context";
import * as Redacted from "effect/Redacted";
import * as DefaultClientOptions from "./DefaultClientOptions.js";

import type { RequestOptions } from "../schemas.js";

export interface DefaultHeadersImpl {
	get: () => Effect.Effect<Record<string, string>>;
	combine: (
		options?: Omit<RequestOptions, "variables">,
	) => Effect.Effect<Record<string, string>>;
}

export class DefaultHeaders extends Context.Tag(
	"@solidifront/storefront-client/DefaultHeaders",
)<DefaultHeaders, DefaultHeadersImpl>() { }

export const make = Effect.gen(function*() {
	const defaultClientOptions = yield* DefaultClientOptions.DefaultClientOptions;

	const defaultHeaders: Record<string, string> = {
		accept: "application/json",
		"x-sdk-variant": "solidifront",
		"x-sdk-variant-source": "solid",
	};

	if (defaultClientOptions.contentType) {
		defaultHeaders["content-type"] =
			defaultClientOptions.contentType === "json"
				? "application/json"
				: "application/graphql";
	}

	if (defaultClientOptions.apiVersion) {
		defaultHeaders["x-sdk-version"] = defaultClientOptions.apiVersion;
	}

	if (defaultClientOptions.publicAccessToken) {
		defaultHeaders["x-shopify-storefront-access-token"] =
			defaultClientOptions.publicAccessToken;
	}

	if (
		defaultClientOptions.privateAccessToken &&
		!defaultClientOptions.publicAccessToken
	) {
		defaultHeaders["shopify-storefront-private-token"] = Redacted.value(
			defaultClientOptions.privateAccessToken,
		);
	}

	return DefaultHeaders.of({
		get: () => Effect.succeed(defaultHeaders),
		combine: (options) => {
			const headers = defaultHeaders;

			if (options?.apiVersion) {
				headers["x-sdk-version"] = options.apiVersion;
			}

			if (options?.contentType) {
				headers["content-type"] = options.contentType;
			}

			if (options?.publicAccessToken) {
				headers["x-shopify-storefront-access-token"] =
					options.publicAccessToken;
			}

			if (options?.privateAccessToken && !options.publicAccessToken) {
				headers["shopify-storefront-private-token"] =
					options.privateAccessToken;
			}

			if (options?.buyerIp && options?.privateAccessToken) {
				headers["shopify-storefront-buyer-ip"] = options.buyerIp;
			}

			return Effect.succeed(headers);
		},
	});
});

export const layer = Layer.effect(DefaultHeaders, make);
