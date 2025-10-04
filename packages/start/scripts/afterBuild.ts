import fs from "node:fs/promises";
import path from "node:path";

const outDir = "dist";

const solidifrontCodegen = path.resolve("..", "codegen");
const virtualTypesFile = "virtual.d.ts",
	virtualTypes = path.resolve(virtualTypesFile);
console.log(solidifrontCodegen);
await fs.copyFile(virtualTypes, path.resolve(outDir, virtualTypesFile));
console.log("\n", "Virtual File types copied from virtual.d.ts", "\n");
const sfSchemaFile = "storefront.schema.json";
const sfTypeFile = "storefront-api-types.d.ts";
await fs.copyFile(
	path.join(solidifrontCodegen, sfSchemaFile),
	path.resolve(outDir, sfSchemaFile),
);
await fs.copyFile(
	path.join(solidifrontCodegen, "types", sfTypeFile),
	path.resolve(outDir, sfTypeFile),
);
console.log(
	"\n",
	"Storefront API types copied from @solidifront/codegen",
	"\n",
);
const caSchemaFile = "customer-account.schema.json";
const caTypeFile = "customer-account-api-types.d.ts";
await fs.copyFile(
	path.join(solidifrontCodegen, caSchemaFile),
	path.resolve(outDir, caSchemaFile),
);
await fs.copyFile(
	path.join(solidifrontCodegen, "types", caTypeFile),
	path.resolve(outDir, caTypeFile),
);

console.log("\n", "Customer API types copied from @solidifront/codegen", "\n");

await fs.copyFile(
	path.resolve(
		"..",
		"plugins/vite-plugin-generate-shopify-locales/dist/locales",
		"index.d.ts",
	),
	path.resolve(outDir, "locales.d.ts"),
);

let content = await fs.readFile(path.resolve(outDir, "locales.d.ts"), "utf-8");

content = content.replace("vite-plugin-generate-shopify-locales", "start");

await fs.writeFile(path.resolve(outDir, "locales.d.ts"), content);

console.log(
	"\n",
	"Locale types copied from @solidifront/vite-plugin-generate-shopify-locales",
	"\n",
);
