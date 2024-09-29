import defu from "defu";
import path from "path";
import {
  type SolidStartInlineConfig,
  defineConfig as defineSolidConfig,
} from "@solidjs/start/config";

import { Project } from "ts-morph";

import generateShopifyLocalesPlugin from "@solidifront/vite-generate-shopify-locales";
import {
  handleMiddleware,
  createVirtualSolidifrontMiddlewareConfig,
} from "./utils.js";

export namespace defineConfig {
  export type Config = SolidStartInlineConfig & {
    solidifront?: {
      localization?: Omit<generateShopifyLocalesPlugin.Options, "debug"> & {};
    };
  };
}

export function defineConfig(baseConfig: defineConfig.Config = {}) {
  let { vite = {}, ...config } = baseConfig;

  const project = new Project({
    tsConfigFilePath: path.resolve("tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      types: ["./.solidifront/types/middleware.d.ts"],
    },
  });

  const needsLocalization = Reflect.has(
    config.solidifront || {},
    "localization"
  );

  const needsMiddleware = needsLocalization;

  config = defu(config, {
    middleware: needsMiddleware ? "./src/middleware.ts" : undefined,
  } as Omit<SolidStartInlineConfig, "vite">);

  if (needsMiddleware) {
    handleMiddleware(project, config.middleware!);
  }

  const middleware = {
    locale: needsLocalization,
    storefront: false,
    customer: false,
  };

  if (typeof vite === "function") {
    const defaultVite = vite;

    vite = (options) => {
      const viteConfig = defaultVite(options);
      return defu(viteConfig, {
        plugins: [
          createVirtualSolidifrontMiddlewareConfig(project, middleware),
        ],
      });
    };
  } else if (typeof vite === "object") {
    vite.plugins = (vite.plugins || []).concat([
      createVirtualSolidifrontMiddlewareConfig(project, middleware),
    ]);
  }

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
