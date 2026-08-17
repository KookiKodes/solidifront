// THROWAWAY PROTOTYPE — ticket #35.
// Decodes real mock.shop responses against the generated schemas and checks the
// three claims ADR-0006 rests on:
//   1. the schema decodes a real Shopify selection set at all
//   2. decode is *identity* — output deep-equals input
//   3. a wrong __typename produces a usable error, at Shopify's arity

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, Schema } from "effect";

const here = new URL("..", import.meta.url).pathname;

const OPS = [
	"Search",
	"Menu",
	"NodeById",
	"DeepCollection",
	"FragmentComposition",
	"ProductConditional",
	"CartCreate",
] as const;

type Row = Record<string, unknown>;
const rows: Row[] = [];

function readResponse(name: string, suffix = ""): unknown | null {
	const p = join(here, `fixtures/${name}.response${suffix}.json`);
	if (!existsSync(p)) return null;
	return JSON.parse(readFileSync(p, "utf8"));
}

/** Structural identity: does decode give back exactly what went in? */
function deepEqual(a: unknown, b: unknown, path = "$"): string | null {
	if (a === b) return null;
	if (a === null || b === null)
		return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
	if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array mismatch`;
	if (typeof a !== "object" || typeof b !== "object")
		return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length)
			return `${path}: length ${a.length} !== ${b.length}`;
		for (let i = 0; i < a.length; i++) {
			const r = deepEqual(a[i], b[i], `${path}[${i}]`);
			if (r) return r;
		}
		return null;
	}
	const ak = Object.keys(a as object).sort();
	const bk = Object.keys(b as object).sort();
	if (ak.join(",") !== bk.join(",")) return `${path}: keys [${ak}] !== [${bk}]`;
	for (const k of ak) {
		const r = deepEqual(
			(a as Record<string, unknown>)[k],
			(b as Record<string, unknown>)[k],
			`${path}.${k}`,
		);
		if (r) return r;
	}
	return null;
}

for (const name of OPS) {
	for (const fallback of ["expand", "catchall"] as const) {
		const modPath = join(here, `generated/${name}.${fallback}.ts`);
		let schema: Schema.Codec<unknown, unknown>;
		try {
			const mod = await import(modPath);
			schema = mod[`${name}Schema`];
		} catch (e) {
			rows.push({
				op: name,
				fallback,
				decodes: "MODULE THREW",
				identity: "-",
				detail: String((e as Error).message).slice(0, 90),
			});
			continue;
		}

		const res = readResponse(name) as { data?: unknown } | null;
		if (!res?.data) {
			rows.push({
				op: name,
				fallback,
				decodes: "no fixture",
				identity: "-",
				detail: "",
			});
			continue;
		}

		const decode = Schema.decodeUnknownEffect(schema);
		const exit = Effect.runSyncExit(decode(res.data));

		if (exit._tag === "Failure") {
			rows.push({
				op: name,
				fallback,
				decodes: "FAIL",
				identity: "-",
				detail: String(exit.cause).replace(/\s+/g, " ").slice(0, 120),
			});
			continue;
		}

		const drift = deepEqual(res.data, exit.value);
		rows.push({
			op: name,
			fallback,
			decodes: "ok",
			identity: drift ? "DRIFT" : "exact",
			detail: drift ?? "",
		});
	}
}

console.log("\n=== 1+2. decode real responses, and check identity ===");
console.table(rows);

// ---------------------------------------------------------------------------
// 3. Error quality on a wrong __typename, at 3-member and 37-member arity.
// ---------------------------------------------------------------------------
console.log("\n=== 3. error on an unknown __typename ===");

for (const [name, fallback, mangle] of [
	["Search", "expand", "Wrong"],
	["NodeById", "expand", "Wrong"],
	["NodeById", "catchall", "Wrong"],
] as const) {
	const mod = await import(
		join(here, `generated/${name}.${fallback}.ts`)
	).catch(() => null);
	if (!mod) {
		console.log(`${name}.${fallback}: module threw, skipped`);
		continue;
	}
	const res = readResponse(name) as { data: unknown };
	const bad = JSON.parse(JSON.stringify(res.data));
	// Replace the first __typename we can find with a name not in the schema.
	let patched = false;
	const walk = (v: unknown): void => {
		if (patched || v === null || typeof v !== "object") return;
		if (Array.isArray(v)) {
			for (const x of v) walk(x);
			return;
		}
		const o = v as Record<string, unknown>;
		if (typeof o.__typename === "string") {
			o.__typename = mangle;
			patched = true;
			return;
		}
		for (const k of Object.keys(o)) walk(o[k]);
	};
	walk(bad);

	const exit = Effect.runSyncExit(
		Schema.decodeUnknownEffect(
			mod[`${name}Schema`] as Schema.Codec<unknown, unknown>,
		)(bad),
	);
	const msg =
		exit._tag === "Failure"
			? String(exit.cause)
			: "!! DECODED ANYWAY (no error)";
	console.log(`\n--- ${name}.${fallback} (patched=${patched}) ---`);
	console.log(msg.split("\n").slice(0, 14).join("\n"));
	console.log(
		`[error length: ${msg.length} chars, ${msg.split("\n").length} lines]`,
	);
}

// ---------------------------------------------------------------------------
// 4. Does Struct drop keys the wire carries but the schema does not declare?
// ---------------------------------------------------------------------------
console.log("\n=== 4. excess wire keys ===");
const S = Schema.Struct({ id: Schema.String });
const withExcess = { id: "x", extra: 1, __typename: "Product" };
const out = Effect.runSyncExit(Schema.decodeUnknownEffect(S)(withExcess));
console.log(
	out._tag === "Success"
		? `decoded to ${JSON.stringify(out.value)} — excess keys ${
				Object.keys(out.value as object).length === 1 ? "DROPPED" : "kept"
			}`
		: `rejected: ${String(out.cause).replace(/\s+/g, " ").slice(0, 120)}`,
);

// ---------------------------------------------------------------------------
// 5. Is Schema.brand identity at runtime?
// ---------------------------------------------------------------------------
console.log("\n=== 5. branded scalar is runtime-identity ===");
const Branded = Schema.String.pipe(Schema.brand("ID"));
const b = Effect.runSyncExit(Schema.decodeUnknownEffect(Branded)("gid://x/1"));
console.log(
	b._tag === "Success"
		? `"gid://x/1" -> ${JSON.stringify(b.value)} (typeof ${typeof b.value})`
		: `rejected: ${String(b.cause).slice(0, 200)}`,
);
