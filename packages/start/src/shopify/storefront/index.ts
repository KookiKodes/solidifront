import type { StorefrontOperations } from "@shopify/storefront-api-client";

import { cache } from "@solidjs/router";
import { getShopifyContext, getLocale } from "~/server/context";

function withLocaleVariables<Query extends keyof StorefrontOperations>(
  locale: I18nLocale,
  variables?: Omit<
    StorefrontOperations[Query]["variables"],
    "language" | "country"
  >
) {
  return {
    ...variables,
    country: locale.country,
    language: locale.language,
  };
}

const storefront = {
  query: <Query extends keyof StorefrontOperations>(
    queryString: Query,
    variables?: Omit<
      StorefrontOperations[Query]["variables"],
      "language" | "country"
    >
  ) => {
    return cache(
      async (
        queryString: Query,
        variables?: Omit<
          StorefrontOperations[Query]["variables"],
          "language" | "country"
        >
      ) => {
        "use server";
        const shopify = getShopifyContext();
        const locale = getLocale();
        // @ts-expect-error
        return shopify.storefront.request(queryString, {
          variables: withLocaleVariables(locale, variables),
        });
      },
      queryString.toString()
    )(queryString, variables);
  },
};

export default storefront;
