import path from "node:path";
import fs from "node:fs/promises";
import { defineConfig } from "tsup";

const outDir = "dist";
const cjsEntryContent = `module.exports = process.env.NODE_ENV === 'development' ? require('./development/index.cjs') : require('./production/index.cjs');`;
const cjsEntryFile = path.resolve(process.cwd(), outDir, "index.cjs");

const commonConfig = defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  treeshake: true,
  sourcemap: true,
});

export default defineConfig([
  {
    ...commonConfig,
    env: { NODE_ENV: "development" },
    outDir: path.resolve(outDir, "development"),
  },
  {
    ...commonConfig,
    env: { NODE_ENV: "production" },
    dts: { resolve: ["@solidifront/codegen"] },
    outDir: path.join(outDir, "production"),
    minify: true,
    onSuccess: async () => {
      await fs.writeFile(cjsEntryFile, cjsEntryContent, "utf-8");
      const solidifrontCodegen = path.resolve("..", "codegen");
      const sfSchemaFile = "storefront.schema.json";
      const sfTypeFile = "storefront-api-types.d.ts";
      await fs.copyFile(
        path.resolve(solidifrontCodegen, sfSchemaFile),
        path.resolve(outDir, sfSchemaFile)
      );
      await fs.copyFile(
        path.resolve(solidifrontCodegen, "types", sfTypeFile),
        path.resolve(outDir, sfTypeFile)
      );
      console.log(
        "\n",
        "Storefront API types copied from @solidifront/codegen",
        "\n"
      );
      const caSchemaFile = "customer-account.schema.json";
      const caTypeFile = "customer-account-api-types.d.ts";
      await fs.copyFile(
        path.resolve(solidifrontCodegen, caSchemaFile),
        path.resolve(outDir, caSchemaFile)
      );
      await fs.copyFile(
        path.resolve(solidifrontCodegen, "types", caTypeFile),
        path.resolve(outDir, caTypeFile)
      );
      console.log(
        "\n",
        "Customer API types copied from @solidifront/codegen",
        "\n"
      );
    },
  },
  //   {
  //     entry: [
  //       "src/vite/**/*.ts",
  //       "!src/vite/**/*.test.ts",
  //       "!src/vite/virtual-routes/**/*",
  //     ],
  //     outDir: "dist/vite",
  //     format: "esm",
  //     minify: false,
  //     bundle: false,
  //     sourcemap: false,
  //     dts: true,
  //   },
]);
