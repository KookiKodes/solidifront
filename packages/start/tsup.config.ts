import fs from "node:fs/promises";
import path from "node:path";
import { generateDtsBundle } from "dts-bundle-generator";
import { defineConfig } from "tsup";
import * as preset from "tsup-preset-solid";

const outDir = "dist";

const preset_options: preset.PresetOptions = {
	entries: [
		{
			entry: "src/localization/index.tsx",
			name: "localization",
			dev_entry: true,
			server_entry: true,
		},
		{
			entry: "src/index.tsx",
		},
	],
	drop_console: false,
	cjs: false,
};

export default defineConfig(async (config) => {
	const watching = !!config.watch;

	const parsed_data = preset.parsePresetOptions(preset_options, watching);

	if (!watching) {
		const package_fields = preset.generatePackageExports(parsed_data);

		console.log(
			`\npackage.json: \n${JSON.stringify(package_fields, null, 2)}\n\n`,
		);
	}

	return [
		...preset.generateTsupOptions(parsed_data),
		{
			entry: ["src/storefront/**/*.ts"],
			format: ["esm"],
			sourcemap: false,
			outDir: path.resolve(outDir, "storefront"),
			dts: {
				entry: [
					"src/storefront/utils.ts",
					"src/storefront/storefront.ts",
					"src/storefront/types.ts",
					"src/storefront/client.ts",
					"src/storefront/hooks.ts",
					"src/storefront/index.ts",
				],
			},
			bundle: false,
			minify: false,
		},
		{
			entry: ["src/config/**/*.ts"],
			format: ["esm"],
			sourcemap: false,
			dts: {
				resolve: ["@solidifront/codegen", "@solidjs/start/config"],
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
			},
			outDir: path.resolve(outDir, "middleware"),
			bundle: false,
			minify: false,
		},
		{
			entry: ["src/codegen/**/*.ts"],
			format: ["esm"],
			sourcemap: false,
			dts: {
				resolve: ["@solidifront/codegen"],
			},
			outDir: path.resolve(outDir, "codegen"),
			bundle: false,
			minify: false,
		},
	];
});
