import * as Effect from "effect/Effect";
import * as StorefrontOperation from "./services/StorefrontOperation.js";

export { buildShopDomain, buildStorefrontApiUrl } from "./utils/storefront.js";

export const extractOperationName = <const Operation extends string>(
	operation: Operation,
) => Effect.runSync(StorefrontOperation.extractName(operation));

export const minifyOperation = <const Operation extends string>(
	operation: Operation,
) => Effect.runSync(StorefrontOperation.minify(operation));
