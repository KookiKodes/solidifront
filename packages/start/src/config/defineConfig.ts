import defu from "defu";
import {
  type SolidStartInlineConfig,
  // type ViteCustomizableConfig,
  defineConfig as defineSolidConfig,
} from "@solidjs/start/config";

import generateShopifyLocalesPlugin from "@solidifront/vite-generate-shopify-locales";

export namespace defineConfig {
  export type Config = SolidStartInlineConfig & {
    solidifront?: {
      localization?: Omit<generateShopifyLocalesPlugin.Options, "debug"> & {};
    };
  };
}

export async function defineConfig(baseConfig: defineConfig.Config = {}) {
  let { vite = {}, ...config } = baseConfig;

  const needsLocalization = Reflect.has(
    config.solidifront || {},
    "localization"
  );

  const needsMiddleware = needsLocalization;

  config = defu(config, {
    middleware: needsMiddleware ? "./src/middleware.ts" : undefined,
  } as Omit<SolidStartInlineConfig, "vite">);

  if (needsLocalization) {
    if (typeof vite === "function") {
      const defaultVite = vite;

      vite = (options) => {
        const viteConfig = defaultVite(options);
        return defu(viteConfig, {
          plugins: [
            generateShopifyLocalesPlugin({
              defaultLocale:
                config.solidifront?.localization?.defaultLocale ?? undefined,
              debug: process.env.NODE_ENV === "development",
              namespace: "@solidifront/start/locales",
            }),
          ],
        });
      };
    } else if (typeof vite === "object") {
      vite.plugins = (vite.plugins || []).concat([
        generateShopifyLocalesPlugin({
          defaultLocale:
            config.solidifront?.localization?.defaultLocale ?? undefined,
          debug: process.env.NODE_ENV === "development",
          namespace: "@solidifront/start/locales",
        }),
      ]);
    }
  }

  return defineSolidConfig({
    ...config,
    vite,
  });
}
