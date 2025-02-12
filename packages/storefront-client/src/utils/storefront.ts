import type { ClientOptions } from "../schemas";

export const buildShopDomain = ({
  storeName,
}: Pick<ClientOptions["Type"], "storeName">) =>
  `https://${storeName}.myshopify.com`;

export const buildStorefrontApiUrl = ({
  apiVersion,
  storeName,
}: Pick<ClientOptions["Type"], "apiVersion" | "storeName">) =>
  `${buildShopDomain({ storeName })}/api/${apiVersion}/graphql.json`;
