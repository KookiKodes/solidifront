// THROWAWAY PROTOTYPE — ticket #35.
// Selection set -> Effect Schema source text. The whole point of the probe.

import {
	type DocumentNode,
	type FragmentDefinitionNode,
	Kind,
	type OperationDefinitionNode,
	print,
	type SelectionSetNode,
	visit,
} from "graphql";
import {
	namedOf,
	parseTypeRef,
	type SchemaIndex,
	scalarExpr,
	type Wrap,
} from "./schema-index.ts";

export type Fallback = "expand" | "catchall";

export type EmitOptions = {
	/** How to cover possible types the developer wrote no inline fragment for. */
	readonly fallback: Fallback;
	/** Emit `.pipe(Schema.toTaggedUnion("__typename"))` on abstract selections. */
	readonly taggedUnion: boolean;
};

export type Stats = {
	maxDepth: number;
	structs: number;
	unions: number;
	unionMembers: number[];
	optionalKeys: number;
	deferredFragments: number;
	typenameInjections: number;
};

type Bucket = Map<string, { expr: string; optional: boolean }>;

const CONDITIONAL = new Set(["include", "skip"]);

function isConditional(node: {
	directives?: ReadonlyArray<{ name: { value: string } }>;
}): boolean {
	return (node.directives ?? []).some((d) => CONDITIONAL.has(d.name.value));
}

function isDeferred(node: {
	directives?: ReadonlyArray<{ name: { value: string } }>;
}): boolean {
	return (node.directives ?? []).some((d) => d.name.value === "defer");
}

export function emitOperation(
	idx: SchemaIndex,
	doc: DocumentNode,
	op: OperationDefinitionNode,
	opts: EmitOptions,
): { expr: string; stats: Stats } {
	const fragments = new Map<string, FragmentDefinitionNode>();
	for (const def of doc.definitions) {
		if (def.kind === Kind.FRAGMENT_DEFINITION)
			fragments.set(def.name.value, def);
	}
	const stats: Stats = {
		maxDepth: 0,
		structs: 0,
		unions: 0,
		unionMembers: [],
		optionalKeys: 0,
		deferredFragments: 0,
		typenameInjections: 0,
	};
	const rootType =
		op.operation === "mutation" ? (idx.mutationRoot as string) : idx.queryRoot;
	const expr = emitSelectionSet(
		idx,
		rootType,
		op.selectionSet,
		fragments,
		opts,
		stats,
		1,
		false,
	);
	return { expr, stats };
}

function emitSelectionSet(
	idx: SchemaIndex,
	parentType: string,
	selSet: SelectionSetNode,
	fragments: Map<string, FragmentDefinitionNode>,
	opts: EmitOptions,
	stats: Stats,
	depth: number,
	inheritedOptional: boolean,
): string {
	stats.maxDepth = Math.max(stats.maxDepth, depth);

	const common: Bucket = new Map();
	const byType = new Map<string, Bucket>();

	collect(
		idx,
		parentType,
		selSet,
		fragments,
		opts,
		stats,
		depth,
		inheritedOptional,
		common,
		byType,
		null,
	);

	// Concrete type, or an abstract type with no type conditions: one struct.
	if (!idx.isAbstract(parentType) || byType.size === 0) {
		stats.structs++;
		return struct(common);
	}

	// Abstract type with type conditions: a union discriminated on __typename.
	const possible = idx.possibleTypes(parentType);
	const named = [...byType.keys()];
	// A type condition may name an interface; expand it to the concrete types it covers.
	const coversOf = new Map<string, string[]>();
	for (const n of named) {
		coversOf.set(
			n,
			idx.isAbstract(n)
				? idx.possibleTypes(n).filter((p) => possible.includes(p))
				: [n],
		);
	}
	const explicit = possible.filter((p) =>
		named.some((n) => (coversOf.get(n) as string[]).includes(p)),
	);
	const rest = possible.filter((p) => !explicit.includes(p));

	const members: string[] = [];
	for (const pt of explicit) {
		const fields: Bucket = new Map(common);
		for (const n of named) {
			if (!(coversOf.get(n) as string[]).includes(pt)) continue;
			for (const [k, v] of byType.get(n) as Bucket) fields.set(k, v);
		}
		fields.set("__typename", {
			expr: `Schema.Literal("${pt}")`,
			optional: false,
		});
		stats.typenameInjections++;
		members.push(struct(fields));
	}

	if (rest.length > 0) {
		if (opts.fallback === "expand") {
			for (const pt of rest) {
				const fields: Bucket = new Map(common);
				fields.set("__typename", {
					expr: `Schema.Literal("${pt}")`,
					optional: false,
				});
				stats.typenameInjections++;
				members.push(struct(fields));
			}
		} else {
			const fields: Bucket = new Map(common);
			fields.set("__typename", {
				expr: `Schema.Literals([${rest.map((r) => `"${r}"`).join(", ")}])`,
				optional: false,
			});
			members.push(struct(fields));
		}
	}

	stats.unions++;
	stats.unionMembers.push(members.length);
	stats.structs += members.length;
	const union = `Schema.Union([\n${members.map((m) => indent(m)).join(",\n")}\n])`;
	return opts.taggedUnion
		? `${union}.pipe(Schema.toTaggedUnion("__typename"))`
		: union;
}

function collect(
	idx: SchemaIndex,
	parentType: string,
	selSet: SelectionSetNode,
	fragments: Map<string, FragmentDefinitionNode>,
	opts: EmitOptions,
	stats: Stats,
	depth: number,
	inheritedOptional: boolean,
	common: Bucket,
	byType: Map<string, Bucket>,
	/** `null` = the shared bucket; a type name = that type condition's bucket. */
	bucketOwner: string | null,
): void {
	const target =
		bucketOwner === null
			? common
			: (byType.get(bucketOwner) ?? setGet(byType, bucketOwner));

	for (const sel of selSet.selections) {
		if (sel.kind === Kind.FIELD) {
			const optional = inheritedOptional || isConditional(sel);
			if (optional) stats.optionalKeys++;
			const alias = sel.alias?.value ?? sel.name.value;
			const f = idx.field(parentType, sel.name.value);
			const wrap = parseTypeRef(f.type);
			const leaf = namedOf(wrap);
			const inner = sel.selectionSet
				? emitSelectionSet(
						idx,
						leaf,
						sel.selectionSet,
						fragments,
						opts,
						stats,
						depth + 1,
						false,
					)
				: leafExpr(idx, leaf);
			target.set(alias, { expr: render(wrap, inner), optional });
			continue;
		}

		if (sel.kind === Kind.INLINE_FRAGMENT) {
			const cond = sel.typeCondition?.name.value ?? parentType;
			if (isDeferred(sel)) stats.deferredFragments++;
			const optional =
				inheritedOptional || isConditional(sel) || isDeferred(sel);
			collect(
				idx,
				cond,
				sel.selectionSet,
				fragments,
				opts,
				stats,
				depth,
				optional,
				common,
				byType,
				// An unconditional inline fragment, or one re-stating the parent
				// type, contributes to every member.
				cond === parentType ? bucketOwner : cond,
			);
			continue;
		}

		// Fragment spread — composed by name, never interpolated (ADR-0006).
		const frag = fragments.get(sel.name.value);
		if (!frag) throw new Error(`unknown fragment ${sel.name.value}`);
		const cond = frag.typeCondition.name.value;
		if (isDeferred(sel)) stats.deferredFragments++;
		const optional = inheritedOptional || isConditional(sel) || isDeferred(sel);
		const sameLevel = cond === parentType || !idx.isAbstract(parentType);
		collect(
			idx,
			cond,
			frag.selectionSet,
			fragments,
			opts,
			stats,
			depth,
			optional,
			common,
			byType,
			sameLevel ? bucketOwner : cond,
		);
	}
}

function setGet(m: Map<string, Bucket>, k: string): Bucket {
	const b: Bucket = new Map();
	m.set(k, b);
	return b;
}

function leafExpr(idx: SchemaIndex, name: string): string {
	const t = idx.type(name);
	if (t.kind === "ENUM")
		return `Schema.Literals([${(t.enumValues ?? [])
			.map((v) => `"${v.name}"`)
			.join(", ")}])`;
	return scalarExpr(name);
}

/** Apply the nullability/list spine. GraphQL is nullable by default. */
function render(w: Wrap, inner: string): string {
	if (w.k === "nonNull") return renderInner(w.of, inner);
	return `Schema.NullOr(${renderInner(w, inner)})`;
}

function renderInner(w: Wrap, inner: string): string {
	if (w.k === "list") return `Schema.Array(${render(w.of, inner)})`;
	if (w.k === "nonNull") return renderInner(w.of, inner);
	return inner;
}

function struct(fields: Bucket): string {
	if (fields.size === 0) return "Schema.Struct({})";
	const lines = [...fields].map(([k, v]) => {
		const expr = v.optional ? `Schema.optionalKey(${v.expr})` : v.expr;
		return indent(`${JSON.stringify(k)}: ${expr}`);
	});
	return `Schema.Struct({\n${lines.join(",\n")}\n})`;
}

function indent(s: string): string {
	return s
		.split("\n")
		.map((l) => `\t${l}`)
		.join("\n");
}

/**
 * The document actually sent. `__typename` is injected into every selection set
 * on an abstract type, because the sentinel index needs a required literal.
 */
export function transformDocument(
	idx: SchemaIndex,
	doc: DocumentNode,
	op: OperationDefinitionNode,
): string {
	const typeStack: string[] = [];
	const fragTypes = new Map<string, string>();
	for (const def of doc.definitions) {
		if (def.kind === Kind.FRAGMENT_DEFINITION)
			fragTypes.set(def.name.value, def.typeCondition.name.value);
	}

	const out = visit(doc, {
		OperationDefinition: {
			enter: (n) => {
				typeStack.push(
					n.operation === "mutation"
						? (idx.mutationRoot as string)
						: idx.queryRoot,
				);
			},
			leave: () => void typeStack.pop(),
		},
		FragmentDefinition: {
			enter: (n) => void typeStack.push(n.typeCondition.name.value),
			leave: () => void typeStack.pop(),
		},
		InlineFragment: {
			enter: (n) =>
				void typeStack.push(n.typeCondition?.name.value ?? current(typeStack)),
			leave: () => void typeStack.pop(),
		},
		Field: {
			enter: (n) => {
				const parent = current(typeStack);
				if (n.name.value === "__typename") {
					typeStack.push("String");
					return;
				}
				const f = idx.field(parent, n.name.value);
				typeStack.push(namedOf(parseTypeRef(f.type)));
			},
			leave: () => void typeStack.pop(),
		},
		SelectionSet: {
			leave: (n) => {
				// typeStack's head is the type this selection set belongs to.
				const owner = current(typeStack);
				if (!owner || !idx.types.has(owner)) return undefined;
				if (!idx.isAbstract(owner)) return undefined;
				const has = n.selections.some(
					(s) => s.kind === Kind.FIELD && s.name.value === "__typename",
				);
				if (has) return undefined;
				// Only where the emitter builds a union — i.e. there is a type
				// condition to discriminate. Otherwise the wire would carry a key
				// the schema does not declare.
				const discriminating = n.selections.some(
					(s) =>
						(s.kind === Kind.INLINE_FRAGMENT && s.typeCondition) ||
						(s.kind === Kind.FRAGMENT_SPREAD &&
							fragTypes.get(s.name.value) !== undefined &&
							fragTypes.get(s.name.value) !== owner),
				);
				if (!discriminating) return undefined;
				return {
					...n,
					selections: [
						{
							kind: Kind.FIELD,
							name: { kind: Kind.NAME, value: "__typename" },
						},
						...n.selections,
					],
				};
			},
		},
	});

	const wanted = out.definitions.filter(
		(d) =>
			d.kind !== Kind.OPERATION_DEFINITION || d.name?.value === op.name?.value,
	);
	return print({ ...out, definitions: wanted });
}

function current(stack: string[]): string {
	return stack[stack.length - 1] as string;
}
