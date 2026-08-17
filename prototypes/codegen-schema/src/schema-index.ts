// THROWAWAY PROTOTYPE — ticket #35. Introspection-JSON lookup helpers.

export type TypeRef = {
	kind: string;
	name: string | null;
	ofType: TypeRef | null;
};

export type IntrospField = {
	name: string;
	type: TypeRef;
	args?: ReadonlyArray<{ name: string; type: TypeRef }>;
};

export type IntrospType = {
	kind: "OBJECT" | "INTERFACE" | "UNION" | "ENUM" | "SCALAR" | "INPUT_OBJECT";
	name: string;
	fields: ReadonlyArray<IntrospField> | null;
	possibleTypes: ReadonlyArray<{ name: string }> | null;
	interfaces: ReadonlyArray<{ name: string }> | null;
	enumValues: ReadonlyArray<{ name: string }> | null;
};

/** A GraphQL type reference, unwrapped into a nullability/list spine. */
export type Wrap =
	| { k: "nonNull"; of: Wrap }
	| { k: "list"; of: Wrap }
	| { k: "named"; name: string };

export function parseTypeRef(ref: TypeRef): Wrap {
	if (ref.kind === "NON_NULL")
		return { k: "nonNull", of: parseTypeRef(ref.ofType as TypeRef) };
	if (ref.kind === "LIST")
		return { k: "list", of: parseTypeRef(ref.ofType as TypeRef) };
	return { k: "named", name: ref.name as string };
}

export function namedOf(w: Wrap): string {
	return w.k === "named" ? w.name : namedOf(w.of);
}

export class SchemaIndex {
	readonly types: Map<string, IntrospType>;
	readonly queryRoot: string;
	readonly mutationRoot: string | null;

	constructor(introspection: unknown) {
		const root = introspection as {
			data?: { __schema?: unknown };
			__schema?: unknown;
		};
		const s = (root.data?.__schema ?? root.__schema) as {
			types: ReadonlyArray<IntrospType>;
			queryType: { name: string };
			mutationType: { name: string } | null;
		};
		this.types = new Map(s.types.map((t) => [t.name, t]));
		this.queryRoot = s.queryType.name;
		this.mutationRoot = s.mutationType?.name ?? null;
	}

	type(name: string): IntrospType {
		const t = this.types.get(name);
		if (!t) throw new Error(`unknown type ${name}`);
		return t;
	}

	field(typeName: string, fieldName: string): IntrospField {
		if (fieldName === "__typename")
			return {
				name: "__typename",
				type: {
					kind: "NON_NULL",
					name: null,
					ofType: { kind: "SCALAR", name: "String", ofType: null },
				},
			};
		const t = this.type(typeName);
		const f = t.fields?.find((x) => x.name === fieldName);
		if (!f) throw new Error(`unknown field ${typeName}.${fieldName}`);
		return f;
	}

	isAbstract(name: string): boolean {
		const k = this.type(name).kind;
		return k === "UNION" || k === "INTERFACE";
	}

	possibleTypes(name: string): ReadonlyArray<string> {
		const t = this.type(name);
		if (!this.isAbstract(name)) return [name];
		return (t.possibleTypes ?? []).map((p) => p.name);
	}
}

/** Shopify custom scalars become branded strings (ADR-0006). */
export const BRANDED_SCALARS = new Set([
	"Color",
	"DateTime",
	"Decimal",
	"HTML",
	"ID",
	"ISO8601DateTime",
	"JSON",
	"URL",
	"UnsignedInt64",
]);

export function scalarExpr(name: string): string {
	switch (name) {
		case "String":
			return "Schema.String";
		case "Boolean":
			return "Schema.Boolean";
		case "Int":
		case "Float":
			return "Schema.Number";
		default:
			if (BRANDED_SCALARS.has(name))
				return `Schema.String.pipe(Schema.brand("${name}"))`;
			// Unknown custom scalar — JSON-ish. Keep it wide rather than guessing.
			return "Schema.Unknown";
	}
}
