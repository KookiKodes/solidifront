import type { ValidVersion } from "@solidifront/storefront-client";
import {
	StorefrontClient,
	InContext,
} from "@solidifront/storefront-client/effect";
import type { FetchEvent } from "@solidjs/start/server";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as LogLevel from "effect/LogLevel";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { Runtime } from "./Runtime.js";
import { getCookie } from "vinxi/http";

export namespace createStorefrontMiddleware {
	export interface Config {
		storeName: string;
		apiVersion: ValidVersion;
		privateAccessToken: string;
	}
}

export function createStorefrontMiddleware(
	config: createStorefrontMiddleware.Config,
) {
	let mainLayer = Layer.mergeAll(
		StorefrontClient.layer({
			storeName: config.storeName,
			apiVersion: config.apiVersion,
			privateAccessToken: config.privateAccessToken,
		}),
		Layer.succeed(
			InContext.InContext,
			InContext.of({
				getLocale: () =>
					Effect.sync(() => {
						const localeCookie = getCookie("locale");
						if (!localeCookie) return null;
						const [language, country] = localeCookie.split("-");
						return {
							language: language?.toUpperCase() || undefined,
							country: country?.toUpperCase() || undefined,
						};
					}),
			}),
		),
	);
	let minimumLogLevel = LogLevel.Error;

	if (import.meta.env.DEV) {
		minimumLogLevel = LogLevel.All;
		mainLayer = mainLayer.pipe(Layer.provide(Logger.pretty));
	}

	const extendedRuntime = ManagedRuntime.make(
		mainLayer.pipe(Layer.provide(Logger.minimumLogLevel(minimumLogLevel))),
		Runtime.memoMap,
	);

	const operationFactory =
		(operationType: "query" | "mutate") => (operation: string, options?: any) =>
			Effect.gen(function*() {
				const client = yield* StorefrontClient.StorefrontClient;
				return yield* client[operationType](operation, options);
			});

	const queryEffect = operationFactory("query"),
		mutateEffect = operationFactory("mutate");

	return async (event: FetchEvent) => {
		event.locals.storefront = {
			query: (query: string, options?: any) =>
				extendedRuntime.runPromise(queryEffect(query, options)),
			mutate: (mutation: string, options?: any) =>
				extendedRuntime.runPromise(mutateEffect(mutation, options)),
		};
	};
}
