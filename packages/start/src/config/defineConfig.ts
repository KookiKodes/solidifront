import type { SolidifrontConfig } from "./types";

import defu from "defu";
import path from "path";
import {
  type SolidStartInlineConfig,
  defineConfig as defineSolidConfig,
} from "@solidjs/start/config";

import { Project } from "ts-morph";

import generateShopifyLocalesPlugin from "@solidifront/vite-generate-shopify-locales";
import { handleMiddleware } from "./utils.js";
import { solidifrontMiddlewareSetup } from "./plugins/index.js";

export namespace defineConfig {
  export type Config = SolidifrontConfig;
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

  if (typeof vite === "function") {
    const defaultVite = vite;

    vite = (options) => {
      const viteConfig = defaultVite(options);
      return defu(viteConfig, {
        plugins: [solidifrontMiddlewareSetup(project, config.solidifront)],
      });
    };
  } else if (typeof vite === "object") {
    vite.plugins = (vite.plugins || []).concat([
      solidifrontMiddlewareSetup(project, config.solidifront),
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
