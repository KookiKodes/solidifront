import fs from "fs";
import path from "path";
import { Project, StructureKind } from "ts-morph";

export function handleMiddleware(project: Project, middlewarePath: string) {
  const absMiddlewarePath = path.resolve(middlewarePath);
  if (fs.existsSync(absMiddlewarePath)) return;
  project
    .createSourceFile(
      absMiddlewarePath,
      {
        statements: [
          {
            kind: StructureKind.ImportDeclaration,
            moduleSpecifier: "@solidifront/start/middleware",
            namedImports: [
              {
                name: "createMiddleware",
              },
            ],
          },
          {
            kind: StructureKind.ExportAssignment,
            expression: (writer) => {
              writer
                .writeLine("createMiddleware({")
                .indent(2)
                .write("onRequest: []")
                .newLine()
                .write("})");
            },
            isExportEquals: false,
          },
        ],
      },
      { overwrite: true }
    )
    .formatText({ indentSize: 2 });

  fs.writeFileSync(
    absMiddlewarePath,
    project.getSourceFile(absMiddlewarePath)?.getText() || ""
  );
}
