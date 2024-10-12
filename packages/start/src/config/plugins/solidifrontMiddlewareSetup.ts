import type { SolidifrontConfig, VitePlugin } from "../types";

import fs from "fs";
import path from "path";

import {
  Project,
  ModuleDeclarationKind,
  StructureKind,
  StatementStructures,
  PropertySignatureStructure,
  OptionalKind,
} from "ts-morph";
import { loadEnv } from "vite";

export function solidifrontMiddlewareSetup(
  project: Project,
  config: SolidifrontConfig["solidifront"]
): VitePlugin {
  const env = loadEnv("all", process.cwd(), "SHOPIFY_");
  const virtualModuleId = "@solidifront/start/middleware:internal";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;
  const middlewarePath = path.resolve(".solidifront/middleware/virtual.ts");

  const middlewares = {
    locale: config && Reflect.has(config, "localization"),
    storefront: config && Reflect.has(config, "storefront"),
    // customer: config && Reflect.has(config, "customer"),
  };

  project.createSourceFile(middlewarePath, {}, { overwrite: true });

  const virtualMiddlewareFile = project.getSourceFile(middlewarePath);

  if (middlewares.locale && virtualMiddlewareFile) {
    virtualMiddlewareFile.addImportDeclarations([
      {
        moduleSpecifier: "@solidifront/start/middleware",
        namedImports: [
          {
            name: "createLocaleMiddleware",
          },
        ],
      },
      {
        moduleSpecifier: "@solidifront/start/locales",
        namedImports: [
          {
            name: "countries",
          },
        ],
      },
    ]);
  }

  if (middlewares.storefront && virtualMiddlewareFile) {
    virtualMiddlewareFile.addImportDeclarations([
      {
        moduleSpecifier: "@solidifront/start/middleware",
        namedImports: [
          {
            name: "createStorefrontMiddleware",
          },
        ],
      },
    ]);
  }

  virtualMiddlewareFile?.addFunction({
    name: "createSolidifrontMiddleware",
    isExported: true,
    kind: StructureKind.Function,
  });

  virtualMiddlewareFile
    ?.getFunction("createSolidifrontMiddleware")
    ?.setBodyText((writer) => {
      writer
        .write("return [")
        .conditionalWriteLine(
          middlewares.locale,
          `createLocaleMiddleware({ countries }),`
        )
        .conditionalWriteLine(
          middlewares.storefront,
          `createStorefrontMiddleware({ storeDomain: "${env.SHOPIFY_PUBLIC_STORE_DOMAIN}", apiVersion: "${env.SHOPIFY_PUBLIC_STOREFRONT_VERSION}", privateAccessToken: "${env.SHOPIFY_PRIVATE_STOREFRONT_TOKEN}" }),`
        )
        .write("];");
    });

  virtualMiddlewareFile?.formatText({ indentSize: 2 });

  const middlewarePluginFileText = virtualMiddlewareFile?.getText();

  return {
    name: "vite-plugin-solidifront-middleware-setup",
    enforce: "pre",
    buildStart() {
      const middlewareTypesPath = path.resolve(".solidifront/types"),
        middlewareDeclarationFilePath = path.resolve(
          middlewareTypesPath,
          "middleware.d.ts"
        ),
        modules: StatementStructures[] = [],
        properties: OptionalKind<PropertySignatureStructure>[] = [],
        tsConfigFileName = "tsconfig.json",
        tsConfigPath = path.resolve(tsConfigFileName),
        relativeTypesPath = "./.solidifront/types/middleware.d.ts";

      if (!fs.existsSync(middlewareDeclarationFilePath))
        fs.mkdirSync(middlewareTypesPath, { recursive: true });

      project.createSourceFile(
        middlewareDeclarationFilePath,
        {},
        { overwrite: true }
      );

      const middlewareDeclarationFile = project.getSourceFile(
        middlewareDeclarationFilePath
      );

      if (middlewares.locale && middlewareDeclarationFile) {
        middlewareDeclarationFile.addImportDeclaration({
          moduleSpecifier: "@solidifront/start/middleware",
          namedImports: [
            {
              name: "I18nLocale",
              isTypeOnly: true,
            },
          ],
        });

        properties.push({
          name: "locale",
          type: "I18nLocale",
        });
      }

      if (middlewares.storefront && middlewareDeclarationFile) {
        middlewareDeclarationFile.addImportDeclaration({
          moduleSpecifier: "@solidifront/start/storefront",
          namedImports: [
            {
              name: "createStorefrontClient",
            },
          ],
        });

        properties.push({
          name: "storefront",
          type: "ReturnType<typeof createStorefrontClient>",
        });
      }

      if (middlewares.storefront || middlewares.locale) {
        modules.push({
          kind: StructureKind.Interface,
          name: "RequestEventLocals",
          isExported: true,
          properties,
        });
      }

      middlewareDeclarationFile?.addModule({
        name: '"@solidjs/start/server"',
        declarationKind: ModuleDeclarationKind.Module,
        hasDeclareKeyword: true,
        statements: modules,
      });

      middlewareDeclarationFile?.formatText({ indentSize: 2 });

      if (fs.existsSync(tsConfigPath)) {
        const tsConfigFileContent = JSON.parse(
          fs.readFileSync(tsConfigFileName, "utf-8")
        );
        if (
          !tsConfigFileContent?.compilerOptions?.types?.includes(
            relativeTypesPath
          )
        ) {
          fs.writeFileSync(
            tsConfigPath,
            JSON.stringify(
              {
                ...tsConfigFileContent,
                compilerOptions: {
                  ...tsConfigFileContent.compilerOptions,
                  types: [
                    ...(tsConfigFileContent?.compilerOptions?.types || []),
                    relativeTypesPath,
                  ],
                },
              },
              null,
              2
            )
          );
        }
      }

      fs.writeFileSync(
        middlewareDeclarationFilePath,
        middlewareDeclarationFile?.getText() || ""
      );
    },
    resolveId(id) {
      if (id !== virtualModuleId) return;
      return resolvedVirtualModuleId;
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        return middlewarePluginFileText;
      }
    },
  };
}
