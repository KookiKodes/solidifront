import fs from "node:fs/promises";
import path from "node:path";
import { generateDtsBundle } from "dts-bundle-generator";
import { defineConfig } from "tsup";

const outDir = "dist";

const commonConfig = {
	minify: false,
	bundle: false,
	splitting: true,
	clean: true,
	treeshake: true,
	sourcemap: true,
};

export default defineConfig([
	{
		...commonConfig,
		format: "esm",
		entry: ["src/**/*.ts"],
		outDir: `${outDir}/esm`,
		// dts: true,
		async onSuccess() {
			const [indexDts] = generateDtsBundle([
				{
					filePath: path.resolve("./src/index.ts"),
				},
			]);
			const [effectDts] = generateDtsBundle([
				{
					filePath: path.resolve("./src/effect.ts"),
				},
			]);

			await fs.writeFile(path.resolve(outDir, "esm", "index.d.ts"), indexDts);
			await fs.writeFile(path.resolve(outDir, "esm", "effect.d.ts"), effectDts);
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
									contents.replace(/\.js'\);/g, ".cjs');"),
								);
							}),
					);
				},
			},
		],
	},
]);
