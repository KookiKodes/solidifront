// THROWAWAY PROTOTYPE — ticket #35.
// Captures primary sources from mock.shop: the introspection schema and real
// responses for each operation. mock.shop is a tokenless, credential-free
// Shopify Storefront API, so this needs no secrets and CI could re-run it.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getIntrospectionQuery } from "graphql";

const ENDPOINT = "https://mock.shop/api";
const here = new URL("..", import.meta.url).pathname;

async function gql(
	query: string,
	variables?: Record<string, unknown>,
	headers?: Record<string, string>,
): Promise<{ status: number; body: string; contentType: string }> {
	const res = await fetch(ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify({ query, variables }),
	});
	return {
		status: res.status,
		body: await res.text(),
		contentType: res.headers.get("content-type") ?? "",
	};
}

// 1. Introspection — the canonical query, with deprecated fields included.
const introspection = await gql(
	getIntrospectionQuery({ inputValueDeprecation: true, descriptions: false }),
);
writeFileSync(
	join(here, "fixtures/mockshop.introspection.json"),
	`${JSON.stringify(JSON.parse(introspection.body), null, 2)}\n`,
);
console.log(
	`introspection: ${introspection.status}, ${introspection.body.length} bytes`,
);

// 2. Real responses, keyed to the operations the generator consumes.
const VARIABLES: Record<string, Record<string, unknown>> = {
	Search: { q: "shirt" },
	Menu: { handle: "main-menu" },
	NodeById: { id: "gid://shopify/Product/7982853619734" },
	ProductConditional: {
		handle: "men-t-shirt",
		withDescription: true,
		skipVendor: false,
	},
	DeepCollection: { handle: "men" },
	DeferredProduct: { handle: "men-t-shirt" },
	FragmentComposition: { handle: "men-t-shirt" },
};

// Second variable set for the conditional operation: the other branch.
const EXTRA: Record<string, Record<string, unknown>> = {
	ProductConditional: {
		handle: "men-t-shirt",
		withDescription: false,
		skipVendor: true,
	},
};

// CartCreate needs a live merchandise id, so resolve one first. This also
// exercises the BaseCartLine interface (CartLine / ComponentizableCartLine),
// which is one of the shapes #35 names.
const variant = await gql(
	`{ product(handle: "men-t-shirt") { variants(first: 1) { edges { node { id } } } } }`,
);
const variantId = (
	JSON.parse(variant.body) as {
		data: { product: { variants: { edges: Array<{ node: { id: string } }> } } };
	}
).data.product.variants.edges[0]?.node.id;
VARIABLES.CartCreate = {
	input: { lines: [{ merchandiseId: variantId, quantity: 2 }] },
};
console.log(`resolved merchandise id: ${variantId}`);

const gen = join(here, "generated");
const docs = new Map<string, string>();
for (const f of readdirSync(gen).filter((f) => f.endsWith(".expand.ts"))) {
	const src = readFileSync(join(gen, f), "utf8");
	const m = src.match(/export const document = (".*?");\n/s);
	if (!m) continue;
	docs.set(f.replace(".expand.ts", ""), JSON.parse(m[1] as string));
}

for (const [name, doc] of docs) {
	const vars = VARIABLES[name];
	if (!vars) {
		console.log(`- ${name}: skipped (no variables; needs a mutation input)`);
		continue;
	}
	const r = await gql(doc, vars);
	const json = r.contentType.includes("application/json");
	writeFileSync(
		join(here, `fixtures/${name}.response.${json ? "json" : "txt"}`),
		`${r.body}\n`,
	);
	const errs = json
		? ((JSON.parse(r.body) as { errors?: unknown[] }).errors ?? null)
		: null;
	console.log(
		`- ${name}: ${r.status} ${r.contentType}${errs ? ` ERRORS ${JSON.stringify(errs).slice(0, 200)}` : ""}`,
	);

	const extra = EXTRA[name];
	if (extra) {
		const r2 = await gql(doc, extra);
		writeFileSync(
			join(here, `fixtures/${name}.response.alt.json`),
			`${r2.body}\n`,
		);
		console.log(`- ${name} (alt vars): ${r2.status}`);
	}
}

// 3. @defer — ask for it two ways to see what the server actually does.
const deferDoc = docs.get("DeferredProduct");
if (deferDoc) {
	const plain = await gql(deferDoc, { handle: "men-t-shirt" });
	writeFileSync(
		join(here, "fixtures/defer.plain.txt"),
		`${plain.status} ${plain.contentType}\n${plain.body}\n`,
	);
	const multipart = await gql(
		deferDoc,
		{ handle: "men-t-shirt" },
		{ Accept: "multipart/mixed, application/json" },
	);
	writeFileSync(
		join(here, "fixtures/defer.multipart.txt"),
		`${multipart.status} ${multipart.contentType}\n${multipart.body}\n`,
	);
	console.log(`- defer plain: ${plain.status} ${plain.contentType}`);
	console.log(
		`- defer multipart: ${multipart.status} ${multipart.contentType}`,
	);

	// The same document with @defer stripped — the control.
	const stripped = deferDoc.replace(/ @defer\(label: "slow"\)/, "");
	const ctrl = await gql(stripped, { handle: "men-t-shirt" });
	writeFileSync(
		join(here, "fixtures/defer.control.txt"),
		`${ctrl.status} ${ctrl.contentType}\n${ctrl.body}\n`,
	);
	console.log(
		`- defer control (no directive): ${ctrl.status} ${ctrl.contentType}`,
	);
}
