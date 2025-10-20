import type { ValidVersion } from "@solidifront/storefront-client";
import * as StorefrontClient from "@solidifront/storefront-client/effect";
import type { FetchEvent } from "@solidjs/start/server";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as LogLevel from "effect/LogLevel";
import type { I18nLocale } from "./createLocaleMiddleware";

const withCountryCode = <Variables extends Record<string, any>>(
	operation: string,
	variables: Variables,
	locale: I18nLocale,
) =>
	Effect.sync(() => {
		if (!variables.country && /\$country/.test(operation)) {
			return {
				...variables,
				country: locale.country,
			};
		}

		return variables;
	});

const withLanguageCode = <Variables extends Record<string, any>>(
	operation: string,
	variables: Variables,
	locale: I18nLocale,
) =>
	Effect.sync(() => {
		if (!variables.language && /\$language/.test(operation)) {
			return {
				...variables,
				language: locale.language,
			};
		}

		return variables;
	});

const withLocaleVariables = <V extends Record<string, any>>(
	operation: string,
	variables: V,
	locale: I18nLocale,
) =>
	Effect.gen(function* () {
		(variables = yield* withCountryCode(operation, variables, locale)),
			(variables = yield* withLanguageCode(operation, variables, locale));

		return variables;
	});

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
	let mainLayer = StorefrontClient.layer({
		storeName: config.storeName,
		apiVersion: config.apiVersion,
		privateAccessToken: config.privateAccessToken,
	});
	let minimumLogLevel = LogLevel.Error;

	if (import.meta.env.DEV) {
		minimumLogLevel = LogLevel.All;
		mainLayer = mainLayer.pipe(Layer.provide(Logger.pretty));
	}

	const operationFactory =
		(operationType: "query" | "mutate") =>
			(event: FetchEvent, operation: string, options?: any) =>
				Effect.gen(function* () {
					const client = yield* StorefrontClient.StorefrontClient;

					const locale = event.locals.locale as I18nLocale;

					if (locale && options) {
						options.variables = yield* withLocaleVariables(
							operation,
							options?.variables ?? {},
							locale,
						);
					}

					return yield* client[operationType](operation, options);
				}).pipe(
					Effect.provide(
						mainLayer.pipe(
							Layer.provide(Logger.minimumLogLevel(minimumLogLevel)),
						),
					),
				);

	const queryEffect = operationFactory("query"),
		mutateEffect = operationFactory("mutate");

	return async (event: FetchEvent) => {
		event.locals.storefront = {
			query: (query: string, options?: any) =>
				Effect.runPromise(queryEffect(event, query, options)),
			mutate: (mutation: string, options?: any) =>
				Effect.runPromise(mutateEffect(event, mutation, options)),
		};
	};
}
