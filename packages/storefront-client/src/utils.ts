import * as StorefrontOperation from "./services/StorefrontOperation.js";
import * as Effect from "effect/Effect";

export { buildShopDomain, buildStorefrontApiUrl } from "./utils/storefront.js";

export const extractOperationName = <const Operation extends string>(
  operation: Operation,
) => Effect.runSync(StorefrontOperation.extractName(operation));

export const minifyOperation = <const Operation extends string>(
  operation: Operation,
) => Effect.runSync(StorefrontOperation.minify(operation));
