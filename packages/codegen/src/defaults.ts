import type { PresetConfig } from "@shopify/graphql-codegen";

const QUERIES_PLACEHOLDER = "%queries%";
const MUTATIONS_PLACEHOLDER = "%mutations%";

const sfapiDefaultInterfaceExtensionCode = `
declare module '@solidifront/start/storefront' {
  interface StorefrontQueries extends ${QUERIES_PLACEHOLDER} {}
  interface StorefrontMutations extends ${MUTATIONS_PLACEHOLDER} {}
}`;

const caapiDefaultInterfaceExtensionCode = `
declare module '@solidifront/start/storefront' {
  interface CustomerAccountQueries extends ${QUERIES_PLACEHOLDER} {}
  interface CustomerAccountMutations extends ${MUTATIONS_PLACEHOLDER} {}
}`;

function replacePlaceholders(
  code: string,
  queryType: string,
  mutationType: string
) {
  return code
    .replace(QUERIES_PLACEHOLDER, queryType)
    .replace(MUTATIONS_PLACEHOLDER, mutationType);
}

type DefaultValues = {
  importTypesFrom: string;
  namespacedImportName: string;
  interfaceExtensionCode: NonNullable<PresetConfig["interfaceExtension"]>;
};

export const sfapiDefaultValues: DefaultValues = {
  importTypesFrom: "@solidifront/codegen/storefront-api-types",
  namespacedImportName: "StorefrontAPI",
  interfaceExtensionCode: ({ queryType, mutationType }) =>
    replacePlaceholders(
      sfapiDefaultInterfaceExtensionCode,
      queryType,
      mutationType
    ),
};

export const caapiDefaultValues: DefaultValues = {
  importTypesFrom: "@solidifront/codegen/customer-account-api-types",
  namespacedImportName: "CustomerAccountAPI",
  interfaceExtensionCode: ({ queryType, mutationType }) =>
    replacePlaceholders(
      caapiDefaultInterfaceExtensionCode,
      queryType,
      mutationType
    ),
};
