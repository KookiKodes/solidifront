import fs from "node:fs";
import path from "node:path";
import {
	type CodeBlockWriter,
	type Project,
	type SourceFile,
	StructureKind,
	VariableDeclarationKind,
	type ObjectLiteralExpression,
	SyntaxKind,
	Node,
} from "ts-morph";
import type { SolidifrontConfig, VitePlugin } from "../types";
import { loadEnv } from "vite";
import {
	ApiType,
	type ShopifyApiProjectOptions,
} from "@shopify/api-codegen-preset";

function ensureImportType(source: SourceFile, specifier: string, name: string) {
	const imp = source
		.getImportDeclarations()
		.find((d) => d.getModuleSpecifierValue() === specifier);
	if (!imp) {
		source.addImportDeclaration({
			isTypeOnly: true,
			namedImports: [name],
			moduleSpecifier: specifier,
		});
		return;
	}
	if (!imp.isTypeOnly()) imp.setIsTypeOnly(true);
	if (!imp.getNamedImports().some((n) => n.getName() === name))
		imp.addNamedImport(name);
}

function ensureImport(source: SourceFile, specifier: string, names: string[]) {
	const imp = source
		.getImportDeclarations()
		.find((d) => d.getModuleSpecifierValue() === specifier);
	if (!imp) {
		source.addImportDeclaration({
			namedImports: names,
			moduleSpecifier: specifier,
		});
		return;
	}
	for (const n of names) {
		if (!imp.getNamedImports().some((ni) => ni.getName() === n))
			imp.addNamedImport(n);
	}
}

function writeShopifyProject(options: ShopifyApiProjectOptions) {
	const apiType = options.apiType;
	const writerType =
		apiType === ApiType.Admin
			? "ApiType.Admin"
			: apiType === ApiType.Storefront
				? "ApiType.Storefront"
				: "ApiType.Customer"; // add others if you support more

	return (writer: CodeBlockWriter) => {
		writer.write("shopifyApiProject("); // <-- wrap
		writer.inlineBlock(() => {
			writer.writeLine(`apiType: ${writerType},`);
			writer.conditionalWriteLine(
				!!options.apiVersion, // <-- guard on apiVersion (bug fix)
				() => `apiVersion: "${options.apiVersion}",`,
			);
			writer.writeLine(`module: "@solidifront/start/storefront",`);
			writer.conditionalWriteLine(
				!!options.documents?.length,
				() => `documents: ${JSON.stringify(options.documents)},`,
			);
			writer.conditionalWriteLine(
				options.declarations !== undefined,
				() => `declarations: ${options.declarations},`,
			);
			writer.conditionalWriteLine(
				options.enumsAsConst !== undefined,
				() => `enumsAsConst: ${options.enumsAsConst},`,
			);
			writer.conditionalWriteLine(
				!!options.outputDir,
				() => `outputDir: "${options.outputDir}",`,
			);
		});
		writer.write(")");
	};
}

function getConfigObject(source: SourceFile): ObjectLiteralExpression {
	const decl =
		source.getVariableDeclarations().find((d) => d.getName() === "config") ??
		source
			.addVariableStatement({
				declarationKind: VariableDeclarationKind.Const,
				declarations: [
					{ name: "config", type: "IGraphQLConfig", initializer: "{}" },
				],
			})
			.getDeclarations()[0];

	// ensure annotation
	if (!decl.getTypeNode()) decl.setType("IGraphQLConfig");

	const init = decl.getInitializer();
	if (Node.isObjectLiteralExpression(init)) return init;

	// if initializer isn't an object, replace it with {}
	decl.setInitializer("{}");
	return decl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
}

function upsertProject(
	projectsObj: ObjectLiteralExpression,
	key: string,
	writer: (w: CodeBlockWriter) => void,
) {
	const existing = projectsObj.getProperty(key);
	if (existing && Node.isPropertyAssignment(existing)) {
		existing.setInitializer(writer);
	} else {
		projectsObj.addPropertyAssignment({ name: key, initializer: writer });
	}
}

function ensureProjectsObject(
	source: SourceFile,
	configObj: ObjectLiteralExpression,
): { projects: ObjectLiteralExpression; movedFromTopLevel: boolean } {
	// 1) If projects already exists and is an object, just return it.
	const existingProjectsProp = configObj.getProperty("projects");
	if (existingProjectsProp && Node.isPropertyAssignment(existingProjectsProp)) {
		const asObj = existingProjectsProp.getInitializerIfKind(
			SyntaxKind.ObjectLiteralExpression,
		);
		if (asObj) return { projects: asObj, movedFromTopLevel: false };
	}

	// 2) Gather top-level members to migrate
	let singleShopifySpreadCallText: string | undefined;
	const defaultProjectMembers: string[] = [];

	for (const p of configObj.getProperties()) {
		if (Node.isSpreadAssignment(p)) {
			const call = p.getExpressionIfKind(SyntaxKind.CallExpression);
			if (call && call.getExpression().getText() === "shopifyApiProject") {
				singleShopifySpreadCallText = call.getText();
				continue;
			}
		}
		defaultProjectMembers.push(p.getText());
	}

	// 3) Rewrite config object with a projects block
	configObj.replaceWithText((w) => {
		w.block(() => {
			w.write("projects: ");
			w.inlineBlock(() => {
				if (singleShopifySpreadCallText) {
					w.write(`default: ${singleShopifySpreadCallText}`);
				} else if (defaultProjectMembers.length > 0) {
					w.write("default: ");
					w.inlineBlock(() => {
						defaultProjectMembers.forEach((t, i) => {
							w.write(t);
							if (i < defaultProjectMembers.length - 1) w.write(",");
							w.writeLine("");
						});
					});
				}
			});
			w.writeLine(",");
		});
	});

	// 4) IMPORTANT: reacquire fresh nodes after the replace
	const freshConfigObj = source
		.getVariableDeclarationOrThrow("config")
		.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);

	const projectsProp = freshConfigObj.getPropertyOrThrow("projects");
	if (!Node.isPropertyAssignment(projectsProp)) {
		throw new Error("projects is not a property assignment after rewrite");
	}

	const projectsObj = projectsProp.getInitializerIfKindOrThrow(
		SyntaxKind.ObjectLiteralExpression,
	);

	return { projects: projectsObj, movedFromTopLevel: true };
}

function saveCodegenFile(
	project: Project,
	config: SolidifrontConfig["solidifront"],
	env: Record<string, string>,
): void {
	const absCodegenPath = path.resolve(".graphqlrc.ts");
	const file =
		project.getSourceFile(absCodegenPath) ??
		project.addSourceFileAtPathIfExists(absCodegenPath) ??
		project.createSourceFile(absCodegenPath, "", { overwrite: true });

	ensureImportType(file, "graphql-config", "IGraphQLConfig");
	ensureImport(file, "@shopify/api-codegen-preset", [
		"shopifyApiProject",
		"ApiType",
	]);

	const configObj = getConfigObject(file);
	const { projects } = ensureProjectsObject(file, configObj);

	if (config?.storefront) {
		upsertProject(
			projects,
			"storefront",
			writeShopifyProject({
				apiType: ApiType.Storefront,
				apiVersion: env.SHOPIFY_PUBLIC_STOREFRONT_VERSION,
				...(config.storefront.codegen || {}),
			}),
		);
	}

	// remove any prior export assignments (both default and export-equals)
	file.getExportAssignments().forEach((ea) => {
		ea.remove();
	});

	// add exactly one default export
	file.addExportAssignment({
		isExportEquals: false, // <-- force `export default`
		expression: "config",
	});

	project.saveSync();
}

export function solidifrontCodegenSetup(
	project: Project,
	_config: SolidifrontConfig["solidifront"],
): VitePlugin {
	const env = loadEnv("all", process.cwd(), "SHOPIFY_");
	return {
		name: "vite-plugin-solidifront-codegen-setup",
		enforce: "pre",
		config(config) {
			saveCodegenFile(project, _config, env);
			return config;
		},
		buildStart() {
			saveCodegenFile(project, _config, env);
		},
	};
}
