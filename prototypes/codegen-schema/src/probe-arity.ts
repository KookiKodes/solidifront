// THROWAWAY PROTOTYPE — ticket #35.
// "Does it degrade at Shopify's arity?" — measured, not assumed.
//
// Effect 4 builds a sentinel index over union members (SchemaAST.getIndex): if
// exactly one required literal key is shared by every member, dispatch is a Map
// lookup. This probe checks that the fast path (a) exists, (b) survives the
// shapes a GraphQL codegen actually emits, and (c) where it breaks.

import { Effect, Schema } from "effect";

const ARITIES = [2, 4, 8, 16, 37, 64, 128];
const ITERATIONS = 20_000;

type Variant = {
	readonly name: string;
	readonly build: (n: number) => Schema.Codec<any, any>;
	/** Which member the sample value targets — worst case for try-in-order. */
	readonly note: string;
};

function member(i: number, typenameSchema?: Schema.Codec<any, any>) {
	return Schema.Struct({
		__typename: typenameSchema ?? Schema.Literal(`T${i}`),
		id: Schema.String,
		[`f${i}`]: Schema.String,
	});
}

const VARIANTS: Variant[] = [
	{
		name: "literal __typename (what codegen emits)",
		note: "required Schema.Literal per member",
		build: (n) =>
			Schema.Union(Array.from({ length: n }, (_, i) => member(i))) as any,
	},
	{
		name: "NullOr(Union(...)) — a nullable abstract field",
		note: "the shape every nullable union field takes",
		build: (n) =>
			Schema.NullOr(
				Schema.Union(Array.from({ length: n }, (_, i) => member(i))),
			) as any,
	},
	{
		name: "optionalKey __typename — sentinel LOST",
		note: "what happens if __typename is conditional",
		build: (n) =>
			Schema.Union(
				Array.from({ length: n }, (_, i) =>
					Schema.Struct({
						__typename: Schema.optionalKey(Schema.Literal(`T${i}`)),
						id: Schema.String,
						[`f${i}`]: Schema.String,
					}),
				),
			) as any,
	},
	{
		name: "no __typename at all — structural only",
		note: "the naive emission, for contrast",
		build: (n) =>
			Schema.Union(
				Array.from({ length: n }, (_, i) =>
					Schema.Struct({ id: Schema.String, [`f${i}`]: Schema.String }),
				),
			) as any,
	},
];

function sample(n: number, withTypename: boolean): Record<string, unknown> {
	const last = n - 1;
	const v: Record<string, unknown> = { id: "gid://x/1", [`f${last}`]: "v" };
	if (withTypename) v.__typename = `T${last}`;
	return v;
}

function timeDecode(
	schema: Schema.Codec<any, any>,
	value: unknown,
): { nsPerOp: number; ok: boolean } {
	const decode = Schema.decodeUnknownSync(schema);
	// warm up
	let ok = true;
	try {
		for (let i = 0; i < 500; i++) decode(value);
	} catch {
		ok = false;
	}
	if (!ok) return { nsPerOp: Number.NaN, ok };
	const t0 = process.hrtime.bigint();
	for (let i = 0; i < ITERATIONS; i++) decode(value);
	const t1 = process.hrtime.bigint();
	return { nsPerOp: Number(t1 - t0) / ITERATIONS, ok };
}

console.log(
	`\n=== decode cost vs union arity (worst-case member: the last) ===\n${ITERATIONS} iterations, ns/op`,
);

const table: Record<string, Record<string, string>> = {};
for (const variant of VARIANTS) {
	const row: Record<string, string> = {};
	for (const n of ARITIES) {
		const withTypename = !variant.name.startsWith("no __typename");
		let schema: Schema.Codec<any, any>;
		try {
			schema = variant.build(n);
		} catch (e) {
			row[`n=${n}`] = `BUILD THREW: ${(e as Error).message.slice(0, 30)}`;
			continue;
		}
		const { nsPerOp, ok } = timeDecode(schema, sample(n, withTypename));
		row[`n=${n}`] = ok ? nsPerOp.toFixed(0) : "DECODE FAILED";
	}
	table[variant.name] = row;
}
console.table(table);

console.log("\n=== toTaggedUnion at arity ===");
for (const n of [2, 37, 128]) {
	try {
		const u = Schema.Union(Array.from({ length: n }, (_, i) => member(i))).pipe(
			Schema.toTaggedUnion("__typename"),
		) as any;
		const t0 = process.hrtime.bigint();
		const s = Schema.Union(Array.from({ length: n }, (_, i) => member(i))).pipe(
			Schema.toTaggedUnion("__typename"),
		);
		const t1 = process.hrtime.bigint();
		console.log(
			`n=${n}: built ok, ${u.discriminants.length} discriminants, ${
				Object.keys(u.guards).length
			} guards, construction ${Number(t1 - t0) / 1e6}ms (${s.discriminants.length})`,
		);
	} catch (e) {
		console.log(`n=${n}: THREW ${(e as Error).message}`);
	}
}

console.log(
	"\n=== toTaggedUnion with a Literals() catch-all member (the `catchall` emission) ===",
);
try {
	Schema.Union([
		member(0),
		member(1),
		Schema.Struct({
			__typename: Schema.Literals(["T2", "T3", "T4"]),
			id: Schema.String,
		}),
	]).pipe(Schema.toTaggedUnion("__typename"));
	console.log("built ok");
} catch (e) {
	console.log(`THREW: ${(e as Error).message}`);
}

console.log(
	"\n=== expand vs catchall: cost of the two fallback emissions at n=37 ===",
);
{
	const EXPLICIT = 2;
	const n = 37;
	const expand = Schema.Union(Array.from({ length: n }, (_, i) => member(i)));
	const catchall = Schema.Union([
		...Array.from({ length: EXPLICIT }, (_, i) => member(i)),
		Schema.Struct({
			__typename: Schema.Literals(
				Array.from({ length: n - EXPLICIT }, (_, i) => `T${i + EXPLICIT}`),
			),
			id: Schema.String,
		}),
	]);
	// A value hitting the catch-all bucket — the common case for an interface
	// the developer wrote only two inline fragments on.
	const inRest = { __typename: `T${n - 1}`, id: "x" };
	const inExplicit = { __typename: "T0", id: "x", f0: "v" };
	console.log(
		`  expand, hits explicit member : ${timeDecode(expand, inExplicit).nsPerOp.toFixed(0)} ns/op`,
	);
	console.log(
		`  expand, hits generated member: ${timeDecode(expand, { __typename: `T${n - 1}`, id: "x", [`f${n - 1}`]: "v" }).nsPerOp.toFixed(0)} ns/op`,
	);
	console.log(
		`  catchall, hits explicit      : ${timeDecode(catchall, inExplicit).nsPerOp.toFixed(0)} ns/op`,
	);
	console.log(
		`  catchall, hits Literals bucket: ${timeDecode(catchall, inRest).nsPerOp.toFixed(0)} ns/op`,
	);
}

console.log(
	"\n=== plain Union (no toTaggedUnion) with a Literals() catch-all ===",
);
{
	const u = Schema.Union([
		member(0),
		member(1),
		Schema.Struct({
			__typename: Schema.Literals(["T2", "T3", "T4"]),
			id: Schema.String,
		}),
	]);
	for (const t of ["T1", "T3", "Nope"]) {
		const v: Record<string, unknown> = { __typename: t, id: "x" };
		if (t === "T1") v.f1 = "v";
		const exit = Effect.runSyncExit(Schema.decodeUnknownEffect(u)(v));
		console.log(
			`  __typename=${t}: ${
				exit._tag === "Success"
					? `ok ${JSON.stringify(exit.value)}`
					: `fail (${String(exit.cause).replace(/\s+/g, " ").length} chars)`
			}`,
		);
	}
}
