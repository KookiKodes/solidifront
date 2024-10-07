import type { FetchEvent } from "@solidjs/start/server";
import type { I18nLocale } from "./createLocaleMiddleware";
import { withLocaleVariables } from "../lib/storefront-client/utils";
import { createStorefrontClient } from "../lib/storefront-client";

export namespace createStorefrontMiddleware {
  export type Config = {
    useLocaleMiddleware?: boolean;
  };
}

export function createStorefrontMiddleware({
  useLocaleMiddleware = false,
}: createStorefrontMiddleware.Config) {
  const client = createStorefrontClient({
    storeDomain: import.meta.env.SHOPIFY_PUBLIC_STORE_DOMAIN,
    apiVersion: import.meta.env.SHOPIFY_STOREFRONT_API_VERSION,
    privateAccessToken: import.meta.env.SHOPIFY_PRIVATE_STORFRONT_TOKEN,
    publicAccessToken: import.meta.env.SHOPIFY_PUBLIC_STORFRONT_TOKEN,
  });

  return async (event: FetchEvent) => {
    if (!useLocaleMiddleware) return (event.locals.storefront = client);
    event.locals.storefront = {
      async query<RawGqlString extends string>(
        query: RawGqlString,
        options?: {
          variables: any;
        }
      ) {
        const locale = event.locals.locale as I18nLocale;
        if (locale && options) {
          options.variables = withLocaleVariables(
            query,
            options?.variables ?? {},
            locale
          );
        }
        return await client.query<RawGqlString>(query, options);
      },
      async mutation<RawGqlString extends string>(
        mutation: RawGqlString,
        options?: {
          variables: any;
        }
      ) {
        const locale = event.locals.locale as I18nLocale;
        if (locale && options) {
          options.variables = withLocaleVariables(
            mutation,
            options?.variables ?? {},
            locale
          );
        }
        return await client.mutation<RawGqlString>(mutation, options);
      },
    };
  };
}
