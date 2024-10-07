import type { FetchEvent } from "@solidjs/start/server";
import type { I18nLocale } from "./createLocaleMiddleware";
import { createStorefrontApiClient } from "@shopify/storefront-api-client";
import isomorphicFetch from "isomorphic-fetch";

export namespace createStorefrontMiddleware {
  export type Config = {
    useLocaleMiddleware?: boolean;
  };
}

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

export function createStorefrontMiddleware() {
  const client = createStorefrontApiClient({
    storeDomain: import.meta.env.SHOPIFY_PUBLIC_STORE_DOMAIN,
    apiVersion: import.meta.env.SHOPIFY_STOREFRONT_API_VERSION,
    privateAccessToken: import.meta.env.SHOPIFY_PRIVATE_STORFRONT_TOKEN,
    customFetchApi: isomorphicFetch,
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
        return await client.request(query, options);
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
        return await client.request(mutation, options);
      },
    };
  };
}
