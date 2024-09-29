import type { ViteCustomizableConfig } from "@solidjs/start/config";
import type { SolidifrontConfig } from "../types";

import fs from "fs";
import path from "path";
import {
  Project,
  ModuleDeclarationKind,
  StructureKind,
  StatementStructures,
} from "ts-morph";

export function solidifrontMiddlewareSetup(
  project: Project,
  config: SolidifrontConfig["solidifront"]
): NonNullable<ViteCustomizableConfig["plugins"]>[0] {
  const virtualModuleId = "@solidifront/start/middleware:internal";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;
  const middlewarePath = path.resolve(".solidifront/middleware/virtual.ts");

  const middlewares = {
    locale: config && Reflect.has(config, "localization"),
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
        .conditionalWrite(
          middlewares.locale,
          `createLocaleMiddleware({ countries }),`
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
        modules: StatementStructures[] = [];

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

        modules.push({
          kind: StructureKind.Interface,
          name: "RequestEventLocals",
          isExported: true,
          properties: [
            {
              name: "locale",
              type: "I18nLocale",
            },
          ],
        });
      }

      middlewareDeclarationFile?.addModule({
        name: '"@solidjs/start/server"',
        declarationKind: ModuleDeclarationKind.Module,
        hasDeclareKeyword: true,
        statements: modules,
      });

      middlewareDeclarationFile?.formatText({ indentSize: 2 });
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
