// THROWAWAY PROTOTYPE — ticket #35.
// The type-level half: does a generated Schema give *usable inference* at
// Shopify's arity and depth, and what does it cost tsc?
//
// Three questions:
//   A. identity-typedness — how does `Type` relate to `Encoded`?
//   B. discriminated narrowing on a __typename literal union
//   C. instantiation depth / compile cost as selection sets get deeper

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildClientSchema, Kind, parse, validate } from "graphql";
import { emitOperation } from "./emit.ts";
import { SchemaIndex } from "./schema-index.ts";

const here = new URL("..", import.meta.url).pathname;
const introspection = JSON.parse(
	readFileSync(join(here, "fixtures/mockshop.introspection.json"), "utf8"),
);
const idx = new SchemaIndex(introspection);
const clientSchema = buildClientSchema(introspection.data);
const tsc = join(here, "node_modules/typescript/bin/tsc");

const work = join(here, ".typeprobe");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

function tsconfig(files: string[]): string {
	return JSON.stringify({
		include: files,
		compilerOptions: {
			lib: ["ESNext"],
			target: "ESNext",
			module: "ESNext",
			moduleResolution: "Bundler",
			strict: true,
			noEmit: true,
			skipLibCheck: true,
			allowImportingTsExtensions: true,
			types: [],
		},
	});
}

type TscResult = {
	ok: boolean;
	output: string;
	instantiations: number;
	types: number;
	checkTimeMs: number;
};

function runTsc(dir: string, files: string[]): TscResult {
	writeFileSync(join(dir, "tsconfig.json"), tsconfig(files));
	let out: string;
	let ok = true;
	try {
		out = execFileSync(
			process.execPath,
			[tsc, "-p", join(dir, "tsconfig.json"), "--extendedDiagnostics"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		);
	} catch (e) {
		ok = false;
		const err = e as { stdout?: string; stderr?: string };
		out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
	}
	const num = (label: string) =>
		Number(out.match(new RegExp(`${label}:\\s+([\\d.]+)`))?.[1] ?? 0);
	return {
		ok,
		output: out,
		instantiations: num("Instantiations"),
		types: num("Types"),
		checkTimeMs: num("Check time") * 1000,
	};
}

// ---------------------------------------------------------------------------
// A + B. Identity-typedness and narrowing, on the real generated schemas.
// ---------------------------------------------------------------------------
const assertions = `import { Schema } from "effect";
import type { SearchSchema } from "../../generated/Search.expand.ts";
import type { NodeByIdSchema } from "../../generated/NodeById.expand.ts";
import type { ProductConditionalSchema } from "../../generated/ProductConditional.expand.ts";

type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
	? true
	: false;
declare function expectTrue<T extends true>(): void;
declare function expectFalse<T extends false>(): void;

// Guard: if module resolution silently fails these become \`any\` and every
// assertion below passes vacuously. Prove the types are real first.
expectFalse<Eq<typeof SearchSchema.Type, any>>();
expectFalse<Eq<typeof NodeByIdSchema.Type, any>>();

type SearchT = typeof SearchSchema.Type;
type SearchE = typeof SearchSchema.Encoded;

// A0. What does Schema.brand actually do to Type vs Encoded?
const Branded = Schema.String.pipe(Schema.brand("ID"));
type BT = typeof Branded.Type;
type BE = typeof Branded.Encoded;
expectFalse<Eq<BT, BE>>();
expectTrue<Eq<BE, string>>();
declare const bt: BT;
const btAsString: string = bt;
void btAsString;
declare const plain: string;
// @ts-expect-error a plain string is not assignable to a branded string
const plainAsBranded: BT = plain;
void plainAsBranded;

// A1. So Type and Encoded are NOT identical for a real Shopify selection set:
//     every \`id\`/custom scalar is branded. ADR-0006's accepted asymmetry.
expectFalse<Eq<SearchT, SearchE>>();

// A2. A decoded value is usable everywhere a wire value is expected.
declare const decoded: SearchT;
const asWire: SearchE = decoded;
void asWire;

// A3. The reverse does not hold. With decoding OFF in production the value IS
//     the wire value, so the branded type is a claim nothing checks.
declare const raw: SearchE;
// @ts-expect-error branded ID is not assignable from plain string
const asDecoded: SearchT = raw;
void asDecoded;

// B1. Narrowing on the injected __typename literal.
type NodeField = NonNullable<typeof NodeByIdSchema.Type["node"]>;
function narrow(n: NodeField): string {
	if (n.__typename === "Product") return n.title + n.vendor;
	if (n.__typename === "Collection") return n.title + n.description;
	// Every other member carries only the interface fields.
	return n.id;
}
void narrow;

// B2. A field present on only one member is unreachable without narrowing.
declare const n2: NodeField;
// @ts-expect-error vendor exists only on the Product member
void n2.vendor;

// B3. The union is exhaustive over the schema's possible types: 37 members.
type Names = NodeField["__typename"];
expectTrue<Eq<Extract<Names, "Product">, "Product">>();
expectTrue<Eq<Extract<Names, "NotAShopifyType">, never>>();

// C1. @include/@skip produce optional keys, not nullable ones.
type Prod = NonNullable<typeof ProductConditionalSchema.Type["product"]>;
// An optional key: {} is assignable to the single-key Pick.
expectTrue<Eq<{} extends Pick<Prod, "description"> ? true : false, true>>();
// A required key: {} is not.
expectTrue<Eq<{} extends Pick<Prod, "title"> ? true : false, false>>();
// And the optional field's value type is not widened with null.
expectTrue<Eq<Prod["description"], string | undefined>>();
expectTrue<Eq<Prod["title"], string>>();
`;

mkdirSync(join(work, "a"), { recursive: true });
writeFileSync(join(work, "a/assertions.ts"), assertions);
const resA = runTsc(join(work, "a"), ["assertions.ts"]);
console.log("\n=== A+B. identity-typedness, narrowing, optional keys ===");
console.log(resA.ok ? "✅ all type assertions hold" : "❌ assertions FAILED");
if (!resA.ok) {
	console.log(
		resA.output
			.split("\n")
			.filter((l) => l.includes("error"))
			.slice(0, 25)
			.join("\n"),
	);
}
console.log(
	`   instantiations=${resA.instantiations} types=${resA.types} check=${resA.checkTimeMs.toFixed(0)}ms`,
);

// ---------------------------------------------------------------------------
// C. Depth. Shopify's type graph is cyclic (Collection -> Product ->
//    Collection), so a selection set can be nested arbitrarily deep even though
//    GraphQL forbids fragment cycles. This is where TS's instantiation depth
//    limit would bite, if anywhere.
// ---------------------------------------------------------------------------
function deepDocument(cycles: number): string {
	// One cycle: collections -> edges -> node(Collection) -> products -> edges ->
	// node(Product) -> variants -> edges -> node(ProductVariant) -> product
	let inner = "id\n\t\t\t\t\t\t\t\t\t\ttitle";
	for (let i = 0; i < cycles; i++) {
		inner = `id
			title
			products(first: 1) {
				edges {
					node {
						id
						variants(first: 1) {
							edges {
								node {
									id
									product {
										collections(first: 1) {
											edges {
												node {
													${inner}
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}`;
	}
	return `query Deep($handle: String!) {\n\tcollection(handle: $handle) {\n\t\t${inner}\n\t}\n}`;
}

console.log("\n=== C. depth: selection-set nesting vs tsc ===");
const depthRows: Array<Record<string, unknown>> = [];
for (const cycles of [1, 2, 4, 8, 12]) {
	const src = deepDocument(cycles);
	const doc = parse(src);
	const errs = validate(clientSchema, doc);
	if (errs.length) {
		depthRows.push({
			cycles,
			status: `INVALID: ${errs[0]?.message.slice(0, 40)}`,
		});
		continue;
	}
	const op = doc.definitions.find((d) => d.kind === Kind.OPERATION_DEFINITION);
	const { expr, stats } = emitOperation(idx, doc, op as never, {
		fallback: "expand",
		taggedUnion: true,
	});
	const dir = join(work, `d${cycles}`);
	mkdirSync(dir, { recursive: true });
	const file = `// generated
import { Schema } from "effect";
export const S = ${expr};
export type T = typeof S.Type;
// force full instantiation of the inferred type
declare const v: T;
export const probe: string | null | undefined = v.collection?.id;
`;
	writeFileSync(join(dir, "deep.ts"), file);
	const r = runTsc(dir, ["deep.ts"]);
	const deepErr = r.output.includes("excessively deep")
		? "EXCESSIVELY DEEP"
		: r.ok
			? "ok"
			: "error";
	depthRows.push({
		cycles,
		selectionDepth: stats.maxDepth,
		structs: stats.structs,
		bytes: file.length,
		status: deepErr,
		instantiations: r.instantiations,
		types: r.types,
		checkMs: r.checkTimeMs.toFixed(0),
	});
	if (!r.ok && !r.output.includes("excessively deep")) {
		console.log(
			`  cycles=${cycles} errors:\n${r.output
				.split("\n")
				.filter((l) => l.includes("error"))
				.slice(0, 4)
				.join("\n")}`,
		);
	}
}
console.table(depthRows);

// ---------------------------------------------------------------------------
// D. Arity: a realistic operation set, compiled together.
// ---------------------------------------------------------------------------
console.log("\n=== D. a realistic operation set, compiled together ===");
const all = runTsc(join(work, "a"), ["../../generated/*.ts"]);
console.log(
	`  all ${8 * 2} generated modules: ${all.ok ? "ok" : "ERRORS"} instantiations=${all.instantiations} types=${all.types} check=${all.checkTimeMs.toFixed(0)}ms`,
);
if (!all.ok) {
	console.log(
		all.output
			.split("\n")
			.filter((l) => l.includes("error"))
			.slice(0, 10)
			.join("\n"),
	);
}
