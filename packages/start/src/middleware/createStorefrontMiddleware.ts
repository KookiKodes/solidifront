import type { FetchEvent } from "@solidjs/start/server";
import type { I18nLocale } from "./createLocaleMiddleware";

import { createStorefrontClient } from "@solidifront/storefront-client";

function withCountryCode<Variables extends Record<string, any>>(
  operation: string,
  variables: Variables,
  locale: I18nLocale
) {
  if (!variables.country && /\$country/.test(operation)) {
    return {
      ...variables,
      country: locale.country,
    };
  }

  return variables;
}

function withLanguageCode<Variables extends Record<string, any>>(
  operation: string,
  variables: Variables,
  locale: I18nLocale
) {
  if (!variables.language && /\$language/.test(operation)) {
    return {
      ...variables,
      language: locale.language,
    };
  }

  return variables;
}

function withLocaleVariables<V extends Record<string, any>>(
  operation: string,
  variables: V,
  locale: I18nLocale
) {
  return {
    ...variables,
    ...withCountryCode(operation, variables, locale),
    ...withLanguageCode(operation, variables, locale),
  };
}

export namespace createStorefrontMiddleware {
  export interface Config {
    storeDomain: string;
    apiVersion: string;
    privateAccessToken: string;
  }
}

export function createStorefrontMiddleware(
  config: createStorefrontMiddleware.Config
) {
  const client = createStorefrontClient({
    storeDomain: config.storeDomain,
    apiVersion: config.apiVersion,
    privateAccessToken: config.privateAccessToken,
  });

  return async (event: FetchEvent) => {
    event.locals.storefront = {
      async query(query: string, options?: any) {
        const locale = event.locals.locale as I18nLocale;
        if (locale && options) {
          options.variables = withLocaleVariables(
            query,
            options?.variables ?? {},
            locale
          );
        }
        return await client.query(query, options);
      },
      async mutate(mutation: string, options?: any) {
        const locale = event.locals.locale as I18nLocale;
        if (locale && options) {
          options.variables = withLocaleVariables(
            mutation,
            options?.variables ?? {},
            locale
          );
        }
        return await client.mutate(mutation, options);
      },
    };
  };
}
