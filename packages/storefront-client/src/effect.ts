import * as TypedStorefrontClient from "./services/TypedStorefrontClient.js";

import type { StorefrontQueries, StorefrontMutations } from "./schemas.js";

export type { StorefrontQueries, StorefrontMutations };

export const make = TypedStorefrontClient.make;
export const layer = TypedStorefrontClient.Default;
