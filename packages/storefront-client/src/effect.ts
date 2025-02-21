import * as TypedStorefrontClient from "./services/TypedStorefrontClient.js";

import { type StorefrontQueries, type StorefrontMutations } from "./schemas";

export type { StorefrontQueries, StorefrontMutations };

export const make = TypedStorefrontClient.make;
export const layer = TypedStorefrontClient.Default;
