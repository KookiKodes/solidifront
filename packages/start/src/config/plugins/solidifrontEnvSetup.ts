import fs from "node:fs";
import path from "node:path";
import { validVersions } from "@solidifront/storefront-client";
import {
	type Project,
	type PropertySignatureStructure,
	StructureKind,
} from "ts-morph";
import { loadEnv } from "vite";
import type { SolidifrontConfig, VitePlugin } from "../types";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Logger from "effect/Logger";

const VALID_VERSIONS = validVersions;

const BASE_FIELDS = {} as const;

const LOCALIZATION_FIELDS = {
	SHOPIFY_PUBLIC_STORE_NAME: Schema.NonEmptyString.annotations({
		message: () => "env 'SHOPIFY_PUBLIC_STORE_NAME' is required",
	}),
	SHOPIFY_PUBLIC_STOREFRONT_VERSION: Schema.Literal(
		...VALID_VERSIONS,
	).annotations({
		message: () =>
			`env 'SHOPIFY_PUBLIC_STOREFRONT_VERSION' should be one of: ${VALID_VERSIONS.join(", ")}`,
	}),
	SHOPIFY_PUBLIC_STOREFRONT_TOKEN: Schema.NonEmptyString.annotations({
		message: () => "env 'SHOPIFY_PUBLIC_STOREFRONT_TOKEN' is required",
	}),
} as const;

const STOREFRONT_FIELDS = {
	SHOPIFY_PRIVATE_STOREFRONT_TOKEN: Schema.NonEmptyString.annotations({
		message: () => "env 'SHOPIFY_PRIVATE_STOREFRONT_TOKEN' is required",
	}).pipe(
		Schema.startsWith("shpat", {
			message: () =>
				"env 'SHOPIFY_PRIVATE_STOREFRONT_TOKEN' should start with 'shpat'",
		}),
	),
} as const;

type Fields = Record<
	string,
	| (typeof STOREFRONT_FIELDS)[keyof typeof STOREFRONT_FIELDS]
	| (typeof LOCALIZATION_FIELDS)[keyof typeof LOCALIZATION_FIELDS]
>;

function mergeFields<const T extends readonly Fields[]>(...parts: T): Fields {
	return Object.assign({}, ...parts);
}

const ALL_PROPERTY_KEYS = Object.keys(
	mergeFields(BASE_FIELDS, LOCALIZATION_FIELDS, STOREFRONT_FIELDS),
);

export function solidifrontEnvSetup(
	project: Project,
	config: SolidifrontConfig["solidifront"],
): VitePlugin {
	const needsLocalization = Reflect.has(config || {}, "localization"),
		needsStorefront = Reflect.has(config || {}, "storefront"),
		// needsCustomer = Reflect.has(config || {}, "customer"),
		absGlobalsPath = path.resolve("./src/global.d.ts");
	const envFields = mergeFields(
		BASE_FIELDS,
		needsLocalization ? LOCALIZATION_FIELDS : {},
		needsStorefront ? { ...LOCALIZATION_FIELDS, ...STOREFRONT_FIELDS } : {},
	);

	const envSchema = Schema.Struct(envFields);

	return {
		name: "vite-plugin-solidifront-codegen-setup",
		enforce: "pre",
		config() {
			const env = loadEnv("all", process.cwd(), "SHOPIFY_");
			const result = Effect.runSync(
				Schema.decodeUnknown(envSchema)(env).pipe(
					Effect.tapError((error) => Effect.logError(error.message)),
					Effect.provide(Logger.pretty),
				),
			);

			if (!fs.existsSync(absGlobalsPath)) {
				project.createSourceFile(
					absGlobalsPath,
					`/// <reference types="@solidjs/start/env" />`,
					{ overwrite: true },
				);
			} else {
				project.createSourceFile(
					absGlobalsPath,
					fs.readFileSync(absGlobalsPath, { encoding: "utf-8" }),
					{ overwrite: true },
				);
			}

			const globalFile = project.getSourceFile(absGlobalsPath);

			const processEnvProperties: PropertySignatureStructure[] = [],
				metaEnvProperties: PropertySignatureStructure[] = [];

			const validKeys = Object.keys(result);

			validKeys.forEach((key) => {
				if (key.startsWith("SHOPIFY_PUBLIC_")) {
					metaEnvProperties.push({
						kind: StructureKind.PropertySignature,
						name: key,
						type: "string",
					});
				}
				processEnvProperties.push({
					kind: StructureKind.PropertySignature,
					name: key,
					type: "string",
				});
			});

			if (globalFile?.getInterface("ImportMetaEnv")) {
				const importMeta = globalFile?.getInterface("ImportMetaEnv")!;
				ALL_PROPERTY_KEYS.forEach((key) => {
					importMeta.getProperty(key)?.remove();
				});
				metaEnvProperties.forEach((property) => {
					importMeta.addProperty(property);
				});
			} else {
				globalFile?.addInterface({
					name: "ImportMetaEnv",
					properties: metaEnvProperties,
				});
			}

			if (globalFile?.getModule("NodeJS")?.getInterface("ProcessEnv")) {
				const processEnv = globalFile
					?.getModule("NodeJS")
					?.getInterface("ProcessEnv")!;
				ALL_PROPERTY_KEYS.forEach((key) => {
					processEnv.getProperty(key)?.remove();
				});
				processEnvProperties.forEach((property) => {
					processEnv.addProperty(property);
				});
			} else {
				globalFile?.addModule({
					name: "NodeJS",
					hasDeclareKeyword: true,
					statements: [
						{
							kind: StructureKind.Interface,
							name: "ProcessEnv",
							properties: processEnvProperties,
						},
					],
				});
			}

			globalFile?.formatText({ indentSize: 2 });

			project.saveSync();

			return {
				envPrefix: "SHOPIFY_PUBLIC_",
			};
		},
	};
}
