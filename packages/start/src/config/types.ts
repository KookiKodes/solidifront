import type {
  SolidStartInlineConfig,
  ViteCustomizableConfig,
} from "@solidjs/start/config";
import type generateShopifyLocalesPlugin from "@solidifront/vite-plugin-generate-shopify-locales";
import type { createSolidifrontConfig } from "@solidifront/codegen";
import type { PluginOption } from "vite";

export type SolidifrontConfig = SolidStartInlineConfig & {
  solidifront?: {
    localization?: Omit<
      generateShopifyLocalesPlugin.Options,
      "debug" | "namespace"
    > & {};
    storefront?: {
      codegen?: NonNullable<
        createSolidifrontConfig.Options["generates"]
      >["storefront"];
    };
    customer?: {
      codegen?: NonNullable<
        createSolidifrontConfig.Options["generates"]
      >["customer"];
    };
  };
};

export type VitePlugin = NonNullable<ViteCustomizableConfig["plugins"]>[0];
