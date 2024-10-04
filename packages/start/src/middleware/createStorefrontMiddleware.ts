import type { FetchEvent } from "@solidjs/start/server";
import type { I18nLocale } from "./createLocaleMiddleware";

import { createGraphqlClient } from "../lib/graphql-client/index.js";

export namespace createStorefrontMiddleware {
  export type Config = {
    useLocaleMiddleware: boolean;
  };
}

function getPrivateTokenHeaders() {}

export function createStorefrontMiddleware({
  useLocaleMiddleware = false,
}: createStorefrontMiddleware.Config) {
  const client = createGraphqlClient({
    url: "",
    retries: 3,
    headers: {
      "X-Shopify-Storefront-Access-Token": "",
      "content-type": "application/json",
    },
  });
  return async (event: FetchEvent) => {
    let locale = event.locals.locale as I18nLocale;
  };
}
