import type { SolidifrontConfig, VitePlugin } from "../types";

import fs from "fs";
import path from "path";

const MODULE_IMPORT_MAP = {
  localization: "@solidifront/start/localization",
  storefront: "@solidifront/start/storefront",
} as const;

const MODULE_IMPORT_ERRORS_MAP = {
  [MODULE_IMPORT_MAP.localization]:
    "Missing localization module, can be added through 'app.config.ts'",
  [MODULE_IMPORT_MAP.storefront]:
    "Missing storefront module, can be added through 'app.config.ts'",
};

export function solidifrontMiddlewareSetup(
  config: SolidifrontConfig["solidifront"]
): VitePlugin {
  const allImports = Object.values(MODULE_IMPORT_MAP);
  const validImports = (
    Object.keys(MODULE_IMPORT_MAP) as Array<keyof typeof MODULE_IMPORT_MAP>
  ).reduce((importNames: string[], moduleKey) => {
    if (config && Reflect.has(config, moduleKey))
      importNames.push(MODULE_IMPORT_MAP[moduleKey]);
    return importNames;
  }, []);

  return {
    name: "vite-plugin-solidifront-packages",
    enforce: "pre",
    transform(code) {
        
    }
  };
}
