import path from "node:path";
import fs from "node:fs/promises";
import { defineConfig } from "tsup";
import { solidPlugin } from "esbuild-plugin-solid";

// import { generateDtsBundle } from "dts-bundle-generator";

const outDir = "dist";
const cjsEntryContent = `module.exports = process.env.NODE_ENV === 'development' ? require('./development/index.cjs') : require('./production/index.cjs');`;
const cjsEntryFile = path.resolve(process.cwd(), outDir, "index.cjs");

const commonConfig = defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  treeshake: true,
  sourcemap: true,
});

export default defineConfig([
  // {
  //   ...commonConfig,
  //   outDir: path.join(outDir, "main", "server"),
  //   minify: true,
  //   dts: true,
  //   esbuildPlugins: [solidPlugin({ solid: { generate: "ssr" } })],
  // },
  {
    ...commonConfig,
    outDir: path.join(outDir, "main"),
    minify: true,
    dts: true,
    esbuildPlugins: [solidPlugin()],
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

      await fs.copyFile(
        path.resolve(
          "..",
          "plugins/vite-generate-shopify-locales/dist/locales",
          "index.d.ts"
        ),
        path.resolve(outDir, "locales.d.ts")
      );
    },
  },
  {
    entry: ["src/config/**/*.ts"],
    format: ["esm"],
    sourcemap: false,
    dts: {
      resolve: ["@solidifront/codegen", "@solidjs/start/config"],
      entry: "src/config/index.ts",
    },
    outDir: path.resolve(outDir, "config"),
    bundle: false,
    minify: false,
  },
  {
    entry: ["src/middleware/**/*.ts"],
    format: ["esm"],
    sourcemap: false,
    dts: {
      resolve: ["@solidifront/codegen", "@solidjs/start/middleware"],
      entry: "src/middleware/index.ts",
    },
    outDir: path.resolve(outDir, "middleware"),
    bundle: false,
    minify: false,
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
