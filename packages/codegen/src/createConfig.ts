// import type { CodegenConfig } from "@graphql-codegen/cli";
import type { Types } from "@graphql-codegen/plugin-helpers";
import { pluckConfig, preset } from "@shopify/hydrogen-codegen";
import { caapiDefaultValues, sfapiDefaultValues } from "./defaults";
import { getSchema } from "./schema";
import { combinePath } from "./utils";

export namespace createSolidifrontConfig {
	type Generates = {
		path?: string;
		documents?: Types.OperationDocumentGlobPath[];
	};

	// Define the types for ConfiguredPlugin and ConfiguredOutput
	// (Replace these with the actual types from your `Types` namespace)
	type ConfiguredPlugin = {};
	type ConfiguredOutput = {};

	// Define the index signature for general properties
	type GeneralProperties = {
		[key: string]: ConfiguredPlugin[] | ConfiguredOutput | Generates;
	};

	// Define the specific properties `storefront` and `customer`
	interface SpecificProperties {
		storefront?: Generates & {
			types?: string;
			moduleName?: string;
		};
		customer?: Generates & {
			types?: string;
			moduleName?: string;
		};
	}

	// Merge the general and specific properties
	type ExtendedGenerates = GeneralProperties & SpecificProperties;

	// Use the ExtendedGenerates type in your main type definition
	export type Options = {
		generates?: ExtendedGenerates;
	};
}

const createGeneratesFromOptions = (
	generates?: createSolidifrontConfig.Options["generates"],
) => {
	if (!generates) return {};

	const resolvedGenerates = Object.keys(generates).reduce(
		(acc, key) => {
			if (key === "storefront" || key === "customer") return acc;
			acc[key] = generates[key];
			return acc;
		},
		{} as Record<string, Types.ConfiguredPlugin[] | Types.ConfiguredOutput>,
	);

	if (generates.storefront) {
		const defaults = sfapiDefaultValues(generates.storefront.moduleName);
		const documents = generates.storefront.documents || [
			"./*.{ts,tsx,js,jsx}",
			"./src/**/*.{ts,tsx,js,jsx}",
			"!./src/graphql/customer-account/*.{ts,tsx,js,jsx}",
		];
		resolvedGenerates[combinePath(generates.storefront.path, "storefront")] = {
			preset,
			presetConfig: {
				importTypes: {
					namespace: defaults.namespacedImportName,
					from: generates.storefront.types || defaults.importTypesFrom,
				},
				interfaceExtension: defaults.interfaceExtensionCode,
			},
			schema: getSchema("storefront"),
			documents,
		};
	}

	if (generates.customer) {
		const documents = generates.customer.documents || [
			"./src/graphql/customer-account/*.{ts,tsx,js,jsx}",
		];
		const defaults = caapiDefaultValues(generates.customer.moduleName);
		resolvedGenerates[combinePath(generates.customer.path, "customer")] = {
			preset,
			schema: getSchema("customer-account"),
			presetConfig: {
				importTypes: {
					namespace: defaults.namespacedImportName,
					from: generates?.customer?.types || defaults.importTypesFrom,
				},
				interfaceExtension: defaults.interfaceExtensionCode,
			},
			documents,
		};
	}

	return resolvedGenerates;
};

export const createSolidifrontConfig = (
	options?: createSolidifrontConfig.Options,
) => {
	const generates = createGeneratesFromOptions(options?.generates);

	return {
		overwrite: true,
		pluckConfig,
		generates,
	};
};
