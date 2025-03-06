import type { FetchEvent } from "@solidjs/start/server";
import type { ValidVersion } from "@solidifront/storefront-client";
import type { I18nLocale } from "./createLocaleMiddleware";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as LogLevel from "effect/LogLevel";
import * as Logger from "effect/Logger";

import * as StorefrontClient from "@solidifront/storefront-client/effect";

const withCountryCode = <Variables extends Record<string, any>>(
  operation: string,
  variables: Variables,
  locale: I18nLocale
) =>
  Effect.gen(function* () {
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
  locale: I18nLocale
) =>
  Effect.gen(function* () {
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
  locale: I18nLocale
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
  config: createStorefrontMiddleware.Config
) {
  let mainLayer = StorefrontClient.Default;
  let minimumLogLevel = LogLevel.None;

  if (import.meta.env.DEV) {
    minimumLogLevel = LogLevel.All;
    mainLayer = Layer.merge(Logger.pretty, mainLayer);
  }

  const operationFactory =
    (operationType: "query" | "mutate") =>
    (event: FetchEvent, operation: string, options?: any) =>
      Effect.gen(function* () {
        const client = yield* StorefrontClient.make({
          storeName: config.storeName,
          apiVersion: config.apiVersion,
          privateAccessToken: config.privateAccessToken,
        });

        const locale = event.locals.locale as I18nLocale;

        if (locale && options) {
          options.variables = yield* withLocaleVariables(
            operation,
            options?.variables ?? {},
            locale
          );
        }

        return yield* client[operationType](operation, options);
      }).pipe(
        Logger.withMinimumLogLevel(minimumLogLevel),
        Effect.provide(mainLayer)
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
