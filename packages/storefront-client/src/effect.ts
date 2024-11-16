import * as TypedStorefrontClient from "./services/TypedStorefrontClient";

export const createStorefrontClientEffect = TypedStorefrontClient.make;
export const layer = TypedStorefrontClient.Default;
