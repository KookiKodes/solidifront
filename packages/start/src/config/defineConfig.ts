import generateShopifyLocalesPlugin from "@solidifront/vite-plugin-generate-shopify-locales";
import {
	defineConfig as defineSolidConfig,
	type SolidStartInlineConfig,
} from "@solidjs/start/config";
import defu from "defu";
import path from "node:path";
import { Project } from "ts-morph";
import codegen from "vite-plugin-graphql-codegen";
import {
	solidifrontCodegenSetup,
	solidifrontEnvSetup,
	solidifrontMiddlewareSetup,
} from "./plugins/index.js";
import type { SolidifrontConfig, VitePlugin } from "./types";
import { handleMiddleware } from "./utils.js";
import { attachPlugins } from "./viteHelpers/index.js";

export namespace defineConfig {
	export type Config = SolidifrontConfig;
}

export function defineConfig(baseConfig: defineConfig.Config = {}) {
	let { vite = {}, ...config } = baseConfig;

	const project = new Project({
		tsConfigFilePath: path.resolve("tsconfig.json"),
		skipAddingFilesFromTsConfig: true,
		skipFileDependencyResolution: true,
		skipLoadingLibFiles: true,
		compilerOptions: {
			types: ["./.solidifront/types/middleware.d.ts"],
		},
	});

	const needsLocalization = Reflect.has(
		config.solidifront || {},
		"localization",
	);

	const needsStorefront = Reflect.has(config.solidifront || {}, "storefront");
	const needsCustomer = Reflect.has(config.solidifront || {}, "customer");

	const needsMiddleware = needsLocalization || needsStorefront;
	const needsCodegen = needsStorefront || needsCustomer;

	config = defu(config, {
		middleware: needsMiddleware ? "./src/middleware.ts" : undefined,
	} as Omit<SolidStartInlineConfig, "vite">);

	if (needsMiddleware && config.middleware) {
		handleMiddleware(project, config.middleware);
	}

	vite = attachPlugins(vite, [
		solidifrontEnvSetup(project, config.solidifront),
		solidifrontCodegenSetup(project, config.solidifront),
		solidifrontMiddlewareSetup(project, config.solidifront),
	]);

	if (needsLocalization) {
		vite = attachPlugins(vite, [
			generateShopifyLocalesPlugin({
				defaultLocale:
					config.solidifront?.localization?.defaultLocale ?? undefined,
				debug: process.env.NODE_ENV === "development",
				namespace: "@solidifront/start/locales",
			}) as VitePlugin,
		]);
	}

	if (needsCodegen) {
		vite = attachPlugins(vite, [
			codegen({
				configFilePathOverride: path.resolve(".graphqlrc.ts"),
				throwOnStart: false,
			}) as VitePlugin,
		]);
	}

	return defineSolidConfig({
		...config,
		vite,
	});
}
