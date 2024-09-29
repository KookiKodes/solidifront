import type { SolidStartInlineConfig } from "@solidjs/start/config";
import type generateShopifyLocalesPlugin from "@solidifront/vite-generate-shopify-locales";

export type SolidifrontConfig = SolidStartInlineConfig & {
  solidifront?: {
    localization?: Omit<
      generateShopifyLocalesPlugin.Options,
      "debug" | "namespace"
    > & {
      redirectRoute?: string;
    };
  };
};
