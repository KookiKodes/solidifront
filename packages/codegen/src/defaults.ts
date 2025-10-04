import type { PresetConfig } from "@shopify/graphql-codegen";

const QUERIES_PLACEHOLDER = "%queries%";
const MUTATIONS_PLACEHOLDER = "%mutations%";

const sfapiDefaultInterfaceExtensionCode = (moduleName: string) => `
declare module '${moduleName}' {
  interface StorefrontQueries extends ${QUERIES_PLACEHOLDER} {}
  interface StorefrontMutations extends ${MUTATIONS_PLACEHOLDER} {}
}`;

const caapiDefaultInterfaceExtensionCode = (moduleName: string) => `
declare module '${moduleName}' {
  interface CustomerAccountQueries extends ${QUERIES_PLACEHOLDER} {}
  interface CustomerAccountMutations extends ${MUTATIONS_PLACEHOLDER} {}
}`;

function replacePlaceholders(
	code: string,
	queryType: string,
	mutationType: string,
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

export const sfapiDefaultValues = (
	moduleName: string = "@solidifront/storefront-client",
): DefaultValues => ({
	importTypesFrom: "@solidifront/codegen/storefront-api-types",
	namespacedImportName: "StorefrontAPI",
	interfaceExtensionCode: ({ queryType, mutationType }) =>
		replacePlaceholders(
			sfapiDefaultInterfaceExtensionCode(moduleName),
			queryType,
			mutationType,
		),
});

export const caapiDefaultValues = (
	moduleName: string = "@solidifront/storefront-client",
): DefaultValues => ({
	importTypesFrom: "@solidifront/codegen/customer-account-api-types",
	namespacedImportName: "CustomerAccountAPI",
	interfaceExtensionCode: ({ queryType, mutationType }) =>
		replacePlaceholders(
			caapiDefaultInterfaceExtensionCode(moduleName),
			queryType,
			mutationType,
		),
});
