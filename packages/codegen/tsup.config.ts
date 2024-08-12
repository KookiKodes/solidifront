import path from "node:path";
import fs from "node:fs/promises";
import { defineConfig } from "tsup";
import { generateDtsBundle } from "dts-bundle-generator";

const outDir = "dist";

const commonConfig = {
  minify: false,
  bundle: false,
  splitting: true,
  treeshake: true,
  sourcemap: true,
};

export default defineConfig([
  {
    ...commonConfig,
    format: "esm",
    entry: ["src/**/*.ts"],
    outDir: `${outDir}/esm`,
    dts: false,
    async onSuccess() {
      const schemaFile = "dist/esm/schema.js";
      const content = await fs.readFile(schemaFile, "utf8");
      // Uncomment createRequire for ESM:
      await fs.writeFile(schemaFile, content.replace(/\/\/!/g, ""));

      const typesPath = path.resolve(".", "types");
      const sfTypeFile = "storefront-api-types.d.ts";

      await fs.copyFile(
        path.resolve(typesPath, sfTypeFile),
        path.resolve(outDir, sfTypeFile)
      );

      const caTypeFile = "customer-account-api-types.d.ts";

      await fs.copyFile(
        path.resolve(typesPath, caTypeFile),
        path.resolve(outDir, caTypeFile)
      );

      const [dts] = generateDtsBundle([
        {
          filePath: "./src/index.ts",
          libraries: {
            inlinedLibraries: ["@shopify/graphql-codegen", "type-fest"],
          },
          output: { noBanner: true },
        },
      ]);
      await fs.writeFile("dist/esm/index.d.ts", dts);
    },
  },
  {
    ...commonConfig,
    format: "cjs",
    dts: false,
    entry: ["src/**/*.ts"],
    outDir: `${outDir}/cjs`,
    plugins: [
      {
        name: "replace-require-extension",
        async buildEnd({ writtenFiles }) {
          await Promise.all(
            writtenFiles
              .filter(({ name }) => name.endsWith(".cjs"))
              .map(async ({ name }) => {
                const filepath = path.resolve(".", name);
                const contents = await fs.readFile(filepath, "utf8");

                await fs.writeFile(
                  filepath,
                  contents.replace(/\.js'\);/g, ".cjs');")
                );
              })
          );
        },
      },
    ],
  },
]);
