import type { CodegenConfig } from "@graphql-codegen/cli";
import type { Types } from "@graphql-codegen/plugin-helpers";
import { pluckConfig, preset } from "@shopify/hydrogen-codegen";
import { sfapiDefaultValues, caapiDefaultValues } from "./defaults";
import { combinePath } from "./utils";
import { getSchema } from "./schema";

export namespace createSolidifrontConfig {
  type Generates = {
    path?: string;
    documents?: Types.OperationDocumentGlobPath[];
  };
  export type Options = {
    types?: {
      storefront?: string;
      customer?: string;
    };
    generates?: Omit<
      Record<
        string,
        Types.ConfiguredPlugin[] | Types.ConfiguredOutput | Generates
      >,
      "storefront" | "customer"
    > & {
      customer?: Generates;
      storefront?: Generates;
    };
  };
}

const createGeneratesFromOptions = (
  types?: createSolidifrontConfig.Options["types"],
  generates?: createSolidifrontConfig.Options["generates"]
) => {
  if (!generates) return {};

  let resolvedGenerates = Object.keys(generates).reduce(
    (acc, key) => {
      if (key === "storefront" || key === "customer") return acc;
      acc[key] = generates[key];
      return acc;
    },
    {} as Record<string, Types.ConfiguredPlugin[] | Types.ConfiguredOutput>
  );

  if (generates.storefront) {
    const documents = generates.storefront.documents || [
      "./*.{ts,tsx,js,jsx}",
      "./src/**/*.{ts,tsx,js,jsx}",
      "!./src/graphql/customer-account/*.{ts,tsx,js,jsx}",
    ];
    resolvedGenerates[combinePath(generates.storefront.path, "storefront")] = {
      preset,
      presetConfig: {
        importTypes: {
          namespace: sfapiDefaultValues.namespacedImportName,
          from: types?.storefront || sfapiDefaultValues.importTypesFrom,
        },
        interfaceExtension: sfapiDefaultValues.interfaceExtensionCode,
      },
      schema: getSchema("storefront"),
      documents,
    };
  }

  if (generates.customer) {
    const documents = generates.customer.documents || [
      "./src/graphql/customer-account/*.{ts,tsx,js,jsx}",
    ];
    resolvedGenerates[combinePath(generates.customer.path, "customer")] = {
      preset,
      schema: getSchema("customer-account"),
      presetConfig: {
        importTypes: {
          namespace: caapiDefaultValues.namespacedImportName,
          from: types?.customer || caapiDefaultValues.importTypesFrom,
        },
        interfaceExtension: caapiDefaultValues.interfaceExtensionCode,
      },
      documents,
    };
  }

  return resolvedGenerates;
};

export const createSolidifrontConfig = (
  options?: createSolidifrontConfig.Options
) => {
  const generates = createGeneratesFromOptions(
    options?.types,
    options?.generates
  );

  return {
    overwrite: true,
    pluckConfig,
    generates,
  } as CodegenConfig;
};
