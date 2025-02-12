import { StructureKind, type Project } from "ts-morph";
import type { SolidifrontConfig, VitePlugin } from "../types";

import path from "path";
import fs from "fs";

export function solidifrontCodegenSetup(
  project: Project,
  config: SolidifrontConfig["solidifront"],
): VitePlugin {
  const absCodegenDir = path.resolve("./.solidifront"),
    absCodegenPath = path.resolve(absCodegenDir, "codegen.ts");
  if (!fs.existsSync(absCodegenDir)) fs.mkdirSync(absCodegenDir);

  const file = project.createSourceFile(absCodegenPath, "", {
    overwrite: true,
  });

  file.addImportDeclaration({
    kind: StructureKind.ImportDeclaration,
    moduleSpecifier: "@solidifront/start/codegen",
    namedImports: [
      {
        name: "createSolidifrontConfig",
      },
    ],
  });

  file.addExportAssignment({
    expression(writer) {
      writer
        .writeLine("createSolidifrontConfig({")
        .write("generates: {")
        .conditionalNewLine(!!config?.customer || !!config?.storefront)
        .conditionalWrite(!!config?.storefront, "storefront: {")
        .conditionalWriteLine(
          !!config?.storefront && !!config?.storefront?.codegen?.documents,
          () =>
            `documents: ${JSON.stringify(config!.storefront!.codegen!.documents)},`,
        )
        .conditionalWriteLine(
          !!config?.storefront && !!config?.storefront?.codegen?.path,
          () => `path: ${JSON.stringify(config!.storefront!.codegen!.path)},`,
        )
        .conditionalWriteLine(
          !!config?.storefront,
          () => `types: "@solidifront/start/storefront-api-types",`,
        )
        .conditionalWriteLine(
          !!config?.storefront,
          () => `moduleName: "@solidifront/start/storefront",`,
        )
        .conditionalWrite(!!config?.storefront, "},")
        .conditionalNewLine(!!config?.customer)
        .conditionalWrite(!!config?.customer, "customer: {")
        .conditionalWriteLine(
          !!config?.customer && !!config?.customer?.codegen?.documents,
          () =>
            `documents: ${JSON.stringify(config!.customer!.codegen!.documents)},`,
        )
        .conditionalWriteLine(
          !!config?.customer && !!config?.customer?.codegen?.path,
          () => `path: ${JSON.stringify(config!.customer!.codegen!.path)},`,
        )
        .conditionalWriteLine(
          !!config?.customer,
          () => `types: "@solidifront/start/customer-api-types",`,
        )
        .conditionalWriteLine(
          !!config?.customer,
          () => `moduleName: "@solidifront/start/storefront",`,
        )
        .conditionalWrite(!!config?.customer, "}")
        .conditionalNewLine(!!config?.customer || !!config?.storefront)
        .writeLine("}")
        .write("})");
    },
    isExportEquals: false,
  });

  file.formatText({ indentSize: 2 });

  return {
    name: "vite-plugin-solidifront-codegen-setup",
    enforce: "pre",
    config(config) {
      fs.writeFileSync(absCodegenPath, file.getText() || "");
      return config;
    },
    buildStart() {
      fs.writeFileSync(absCodegenPath, file.getText() || "");
    },
  };
}
