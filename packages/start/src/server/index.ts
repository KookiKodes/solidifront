import { createMiddleware } from "@solidjs/start/middleware";
import { createShopifyContext } from "./middleware/shopify";
import { createLocaleContext } from "./middleware/locale";
import { createEnvContext } from "./middleware/env";

export default createMiddleware({
  onRequest: [createEnvContext, createLocaleContext, createShopifyContext],
});
