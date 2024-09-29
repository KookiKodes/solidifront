import type { ViteCustomizableConfig } from "@solidjs/start/config";
import fs from "fs";
import path from "path";
import { Project, ModuleDeclarationKind, StructureKind } from "ts-morph";

export function handleMiddleware(middlewarePath: string) {
  const absMiddlewarePath = path.resolve(middlewarePath);
  if (fs.existsSync(absMiddlewarePath)) return;
  const middleware = `
    import { createMiddleware } from "@solidifront/start/middleware";

    export default createMiddleware({
        onRequest: []
    });
   `;
  fs.writeFileSync(absMiddlewarePath, middleware);
}

export function createVirtualSolidifrontMiddlewareConfig(middlewares: {
  locale: boolean;
  storefront: boolean;
  customer: boolean;
}): NonNullable<ViteCustomizableConfig["plugins"]>[0] {
  const virtualModuleId = "@solidifront/start/middleware:internal";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;

  const project = new Project({
    tsConfigFilePath: path.resolve("tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      types: ["./.solidifront/types/middleware.d.ts"],
    },
  });

  const middlewarePath = path.resolve(".solidifront/middleware/virtual.ts");

  project.createSourceFile(middlewarePath, {}, { overwrite: true });

  const middlewareFile = project.getSourceFile(middlewarePath);

  if (middlewares.locale && middlewareFile) {
    middlewareFile.addImportDeclarations([
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

  middlewareFile?.addFunction({
    name: "createSolidifrontMiddleware",
    isExported: true,
    kind: StructureKind.Function,
  });

  const funcDef = middlewareFile?.getFunction("createSolidifrontMiddleware");

  funcDef?.setBodyText((writer) => {
    writer
      .write("return [")
      .conditionalWrite(
        middlewares.locale,
        `createLocaleMiddleware({ countries, redirectRoute: "/" })`
      )
      .write("];");
  });

  middlewareFile?.formatText({ indentSize: 2 });

  return {
    name: "vite-plugin-solidifront-middleware-setup",
    enforce: "pre",
    buildStart() {
      const middlewareTypesPath = path.resolve(".solidifront/types"),
        middlewareDeclarationFilePath = path.resolve(
          middlewareTypesPath,
          "middleware.d.ts"
        );

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

        middlewareDeclarationFile.addModule({
          name: '"@solidjs/start/server"',
          declarationKind: ModuleDeclarationKind.Module,
          hasDeclareKeyword: true,
          statements: [
            {
              kind: StructureKind.Interface,
              name: "RequestEventLocals",
              isExported: true,
              properties: [
                {
                  name: "locale",
                  type: "I18nLocale",
                },
              ],
            },
          ],
        });
      }

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
        return middlewareFile?.getText();
      }
    },
  };
}
