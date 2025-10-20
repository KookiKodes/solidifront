import type { IGraphQLConfig } from "graphql-config";
import { shopifyApiProject, ApiType } from "@shopify/api-codegen-preset";

const config: IGraphQLConfig = {
    projects: {
        storefront: shopifyApiProject({
                apiType: ApiType.Storefront,
                apiVersion: "unstable",
                module: "@solidifront/start/storefront",
            })
    },
};

export default config;
