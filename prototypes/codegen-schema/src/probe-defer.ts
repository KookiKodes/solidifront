// THROWAWAY PROTOTYPE — ticket #35.
// @defer. The ticket asked whether an identity decode of "the whole payload"
// has any moment to run. Answered against a real captured mock.shop stream.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { DeferredProductSchema } from "../generated/DeferredProduct.expand.ts";

const here = new URL("..", import.meta.url).pathname;

const raw = readFileSync(join(here, "fixtures/defer.plain.txt"), "utf8");
const control = readFileSync(join(here, "fixtures/defer.control.txt"), "utf8");

console.log("=== what the server does ===");
console.log(`  with    @defer: ${raw.split("\n")[0]}`);
console.log(`  without @defer: ${control.split("\n")[0]}`);

// Parse the multipart/mixed body into its JSON chunks.
const body = raw.slice(raw.indexOf("\n") + 1);
const chunks = body
	.split("--graphql")
	.map((part) => {
		const i = part.indexOf("{");
		return i === -1 ? null : part.slice(i).trim();
	})
	.filter((s): s is string => s !== null && s.startsWith("{"))
	.map((s) => JSON.parse(s) as Record<string, unknown>);

console.log(`\n=== ${chunks.length} chunks ===`);
for (const [i, c] of chunks.entries()) {
	console.log(
		`  chunk ${i}: keys=[${Object.keys(c).join(", ")}] hasNext=${c.hasNext}`,
	);
}

const decode = Schema.decodeUnknownEffect(DeferredProductSchema);

console.log(
	"\n=== decoding chunk 0 (the initial payload) against the operation schema ===",
);
const first = chunks[0] as { data: unknown };
console.log(`  wire: ${JSON.stringify(first.data)}`);
const e0 = Effect.runSyncExit(decode(first.data));
if (e0._tag === "Success") {
	console.log(`  ✅ decodes: ${JSON.stringify(e0.value)}`);
	console.log(
		`     the @defer'd keys are ABSENT, and optionalKey models exactly that`,
	);
} else {
	console.log(`  ❌ ${String(e0.cause).replace(/\s+/g, " ").slice(0, 200)}`);
}

console.log(
	"\n=== decoding chunk 1 (the incremental payload) against the same schema ===",
);
const second = chunks[1] as {
	incremental: Array<{ path: string[]; label: string; data: unknown }>;
};
console.log(`  wire: ${JSON.stringify(second).slice(0, 220)}`);
const inc = second.incremental[0] as {
	path: string[];
	label: string;
	data: unknown;
};
const e1 = Effect.runSyncExit(decode(inc.data));
console.log(
	e1._tag === "Success"
		? `  ⚠️  "decoded" to ${JSON.stringify(e1.value)} — every operation-level key was dropped as excess`
		: `  ❌ rejected: ${String(e1.cause).replace(/\s+/g, " ").slice(0, 200)}`,
);
console.log(
	`     the incremental chunk's \`data\` is the FRAGMENT's shape at path [${inc.path.join(", ")}],\n     not the operation's — so a per-operation schema cannot decode it.`,
);

console.log("\n=== decode after merging every chunk ===");
// Merge incremental payloads into the initial one at their `path`.
const merged = structuredClone(first.data) as Record<string, unknown>;
for (const c of chunks.slice(1)) {
	for (const part of (c.incremental ?? []) as Array<{
		path: (string | number)[];
		data: Record<string, unknown>;
	}>) {
		let target: Record<string, unknown> = merged;
		for (const seg of part.path)
			target = target[seg as string] as Record<string, unknown>;
		Object.assign(target, part.data);
	}
}
console.log(`  merged wire: ${JSON.stringify(merged).slice(0, 200)}`);
const e2 = Effect.runSyncExit(decode(merged));
if (e2._tag === "Success") {
	const identical = JSON.stringify(e2.value) === JSON.stringify(merged);
	console.log(`  ✅ decodes, identity=${identical ? "exact" : "DRIFT"}`);
} else {
	console.log(`  ❌ ${String(e2.cause).replace(/\s+/g, " ").slice(0, 200)}`);
}

console.log("\n=== is the deferred field distinguishable from a null one? ===");
const missing = { product: { id: "gid://x/1", title: "t" } };
const nulled = {
	product: {
		id: "gid://x/1",
		title: "t",
		description: null,
		productType: null,
	},
};
for (const [label, v] of [
	["absent (deferred)", missing],
	["null", nulled],
] as const) {
	const e = Effect.runSyncExit(decode(v));
	console.log(
		`  ${label.padEnd(18)}: ${e._tag === "Success" ? `ok ${JSON.stringify(e.value)}` : `rejected (${String(e.cause).replace(/\s+/g, " ").slice(0, 90)})`}`,
	);
}
