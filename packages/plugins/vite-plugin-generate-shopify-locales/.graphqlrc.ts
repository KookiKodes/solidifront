import type { IGraphQLConfig } from "graphql-config";
import { shopifyApiProject, ApiType } from "@shopify/api-codegen-preset"

const config: IGraphQLConfig = {
	projects: {
		default: shopifyApiProject({
			apiType: ApiType.Storefront,
			apiVersion: "unstable",
			documents: ["src/utils/getShopLocalization.ts"],
			module: "@solidifront/storefront-client"
		})
	}
}

export default config;
