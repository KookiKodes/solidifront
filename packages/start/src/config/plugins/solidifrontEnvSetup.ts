import type { SolidifrontConfig, VitePlugin } from "../types";

import { z } from "zod";
import { generateErrorMessage } from "zod-error";
import { loadEnv } from "vite";
import {
  PropertySignatureStructure,
  StructureKind,
  type Project,
} from "ts-morph";

import fs from "fs";
import path from "path";

const VALID_VERSIONS = [
  "2024-01",
  "2024-04",
  "2024-07",
  "2024-10",
  "2025-01",
  "unstable",
] as const;

const BASE_SCHEMA = z.object({});

const LOCALIZATION_SCHEMA = BASE_SCHEMA.extend({
  SHOPIFY_PUBLIC_STORE_DOMAIN: z
    .string({ message: "env 'SHOPIFY_PUBLIC_STORE_DOMAIN' is required" })
    .endsWith(
      ".myshopify.com",
      "env 'SHOPIFY_PUBLIC_STORE_DOMAIN' should end with'.myshopify.com'"
    ),
  SHOPIFY_PUBLIC_STOREFRONT_VERSION: z.enum(VALID_VERSIONS, {
    message:
      "env 'SHOPIFY_PUBLIC_STOREFRONT_VERSION' should be one of: " +
      VALID_VERSIONS.join(", "),
  }),
  SHOPIFY_PUBLIC_STOREFRONT_TOKEN: z.string({
    message: "env 'SHOPIFY_PUBLIC_STOREFRONT_TOKEN' is required",
  }),
});

const STOREFRONT_SCHEMA = LOCALIZATION_SCHEMA.extend({
  SHOPIFY_PRIVATE_STOREFRONT_TOKEN: z
    .string({
      message: "env 'SHOPIFY_PRIVATE_STOREFRONT_TOKEN' is required",
    })
    .startsWith("shpat", {
      message:
        "env 'SHOPIFY_PRIVATE_STOREFRONT_TOKEN' should start with 'shpat'",
    }),
});

const ALL_PROPERTY_KEYS = Object.keys(STOREFRONT_SCHEMA.shape);

type Schemas =
  | typeof BASE_SCHEMA
  | typeof LOCALIZATION_SCHEMA
  | typeof STOREFRONT_SCHEMA;

export function solidifrontEnvSetup(
  project: Project,
  config: SolidifrontConfig["solidifront"]
): VitePlugin {
  const needsLocalization = Reflect.has(config || {}, "localization"),
    needsStorefront = Reflect.has(config || {}, "storefront"),
    // needsCustomer = Reflect.has(config || {}, "customer"),
    absGlobalsPath = path.resolve("./src/global.d.ts");

  let envSchema: Schemas = BASE_SCHEMA;

  if (needsLocalization) {
    envSchema = envSchema.extend(LOCALIZATION_SCHEMA.shape);
  }

  if (needsStorefront) {
    envSchema = envSchema.extend(STOREFRONT_SCHEMA.shape);
  }

  return {
    name: "vite-plugin-solidifront-codegen-setup",
    enforce: "pre",
    config(viteConfig) {
      const env = loadEnv("all", process.cwd(), "SHOPIFY_");
      const result = envSchema.safeParse(env);
      if (!result.success) {
        throw new Error(generateErrorMessage(result.error.issues), {
          cause: result.error,
        });
      }

      if (!fs.existsSync(absGlobalsPath)) {
        project.createSourceFile(
          absGlobalsPath,
          `/// <reference types="@solidjs/start/env" />`,
          { overwrite: true }
        );
      } else {
        project.createSourceFile(
          absGlobalsPath,
          fs.readFileSync(absGlobalsPath, { encoding: "utf-8" }),
          { overwrite: true }
        );
      }

      const globalFile = project.getSourceFile(absGlobalsPath);

      const processEnvProperties: PropertySignatureStructure[] = [],
        metaEnvProperties: PropertySignatureStructure[] = [];

      const validKeys = Object.keys(result.data);

      validKeys.forEach((key) => {
        if (key.startsWith("SHOPIFY_PUBLIC_")) {
          metaEnvProperties.push({
            kind: StructureKind.PropertySignature,
            name: key,
            type: "string",
          });
        }
        processEnvProperties.push({
          kind: StructureKind.PropertySignature,
          name: key,
          type: "string",
        });
      });

      if (globalFile?.getInterface("ImportMetaEnv")) {
        const importMeta = globalFile?.getInterface("ImportMetaEnv")!;
        ALL_PROPERTY_KEYS.forEach((key) => {
          importMeta.getProperty(key)?.remove();
        });
        metaEnvProperties.forEach((property) => {
          importMeta.addProperty(property);
        });
      } else {
        globalFile?.addInterface({
          name: "ImportMetaEnv",
          properties: metaEnvProperties,
        });
      }

      if (globalFile?.getModule("NodeJS")?.getInterface("ProcessEnv")) {
        const processEnv = globalFile
          ?.getModule("NodeJS")
          ?.getInterface("ProcessEnv")!;
        ALL_PROPERTY_KEYS.forEach((key) => {
          processEnv.getProperty(key)?.remove();
        });
        processEnvProperties.forEach((property) => {
          processEnv.addProperty(property);
        });
      } else {
        globalFile?.addModule({
          name: "NodeJS",
          hasDeclareKeyword: true,
          statements: [
            {
              kind: StructureKind.Interface,
              name: "ProcessEnv",
              properties: processEnvProperties,
            },
          ],
        });
      }

      globalFile?.formatText({ indentSize: 2 });

      fs.writeFileSync(absGlobalsPath, globalFile?.getFullText() || "");

      return {
        envPrefix: "SHOPIFY_PUBLIC_",
      };
    },
  };
}
