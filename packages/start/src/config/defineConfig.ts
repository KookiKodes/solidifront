import type { IsoCode } from "@solidifront/vite-generate-shopify-locales/locales";

import {
  defineConfig as defineSolidConfig,
  type SolidStartInlineConfig,
} from "@solidjs/start/config";

import generateShopifyLocalesPlugin from "@solidifront/vite-generate-shopify-locales";

export namespace defineConfig {
  export type Config = SolidStartInlineConfig & {
    solidifront?: {
      locale?: {
        defaultLocale: IsoCode;
      };
    };
  };
}

export function defineConfig(config: defineConfig.Config = {}) {
  if (config.solidifront?.locale) {
    config.middleware = config.middleware || "./src/middleware.ts";
  }
  return defineSolidConfig({
    ...config,
    vite: {
      plugins: [generateShopifyLocalesPlugin()],
    },
  });
}
