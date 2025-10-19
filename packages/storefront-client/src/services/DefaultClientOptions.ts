import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { ClientOptions } from "../schemas.js";

type DefaultClientOptionsType = ClientOptions["Type"];

export interface DefaultClientOptionsImpl extends DefaultClientOptionsType { }

export class DefaultClientOptions extends Context.Tag(
	"@solidifront/storefront-client/DefaultClientOptions",
)<DefaultClientOptions, DefaultClientOptionsImpl>() { }

export const make = Effect.fnUntraced(function*(options: unknown) {
	const clientOptions = yield* Schema.decodeUnknown(ClientOptions)(options);
	return DefaultClientOptions.of(clientOptions);
});

export const layer = (options: ClientOptions["Encoded"]) =>
	Layer.effect(DefaultClientOptions, make(options));

export const fromEnv = Layer.effect(
	DefaultClientOptions,
	Effect.gen(function*() {
		const privateAccessToken = yield* Config.string(
			"SHOPIFY_PRIVATE_STOREFRONT_TOKEN",
		);
		const publicAccessToken = yield* Config.string(
			"SHOPIFY_PUBLIC_STOREFRONT_TOKEN",
		);
		const apiVersion = yield* Config.string(
			"SHOPIFY_PUBLIC_STOREFRONT_VERSION",
		);
		const storeName = yield* Config.string("SHOPIFY_PUBLIC_STORE_NAME");
		return yield* make({
			privateAccessToken,
			publicAccessToken,
			apiVersion,
			storeName,
		});
	}),
);
