# An operation is a generated module, not a string

The developer writes a document inline. Codegen emits, per document, a **module** holding the transformed document, an Effect `Schema`, and its types — and the storefront client accepts only that module's branded export. Decided in [#14](https://github.com/KookiKodes/solidifront/issues/14).

```ts
// what the developer writes — inline, co-located
const PRODUCT = graphql(`
  query Product($handle: String!) {
    product(handle: $handle) {
      title
    }
  }
`);

// what codegen emits into .solidifront/, and what the Vite transform rewrites the call site to import
export const ProductOperation: Operation<
  ProductResult,
  ProductVariables,
  "query",
  "storefront"
>;
```

The overload set codegen generates is keyed on the exact literal, with a catch-all returning a branded `UnknownOperation` the client refuses.

## Why not a raw string

Because a runtime artifact is needed regardless. Type generation emits an Effect `Schema` per operation, so _something_ has to carry it, and a string cannot.

The schema is **identity-typed**: its `Type` is structurally the wire shape, so decoding is pure validation and can be on in dev and off in production without forking the type. That is the constraint that makes the whole design hold together, and it is why custom scalars (`Decimal`, `DateTime`, `URL`, `HTML`, `JSON`, `UnsignedInt64`) become **branded strings** rather than decoded values. The moment a decode transforms — `DateTime` → `DateTime.Utc`, `Decimal` → `BigDecimal` — the type diverges between the two modes and the flag becomes a lie. Real conversions are opt-in combinators the consumer reaches for explicitly.

Branded strings are also strictly better than Hydrogen's `defaultScalarType: "string"`, at no runtime cost.

## Why not a type-level resolver

Hydrogen preview infers types by parsing the literal _type_ with a 480-line type-level GraphQL executor. Two independent reasons not to follow it.

It produces no runtime representation at all, so it cannot satisfy the `Schema` requirement above without a second parallel mechanism. And it **does not typecheck under plain `tsc`** — which is why preview must also ship a `gql check` CLI that shells out with a temporary tsconfig. That is a second source of truth for exactly the invariants [ADR-0007](./0007-incontext-is-injected-at-build-time-from-the-pinned-schema.md) consolidates into one build-time gate.

## Why the document still lives inline

A `.graphql`-file-only surface was seriously considered, on the grounds that a file has no literal key to desynchronise. That argument does not survive contact with the detail: the fallback is ours to pick, and an unmatched literal yields a branded `UnknownOperation` the client refuses — a loud failure at the use site, not Hydrogen classic's `any`.

So what actually had to die was the string-as-runtime-value, not inline authoring. Inline keeps co-location, keeps every Shopify snippet copy-pasteable, and keeps the migration story from either Hydrogen honest. `.graphql` files remain an accepted secondary codegen input, imported through the `#graphql/*` specifier.

## Why fragments compose by name

A fragment is its own `graphql()` call; an operation references `...ProductFields` and codegen resolves it from its document store. No interpolation.

Interpolation would force the overload key to be the fully-expanded string, computed as a template-literal type. TypeScript enforces a hard length cap on those and degrades on deep nesting, and the key would become sensitive to fragment order and duplication — a formatting change silently rewriting the identity of a document. Name-based composition keeps the key exactly what the developer typed, and duplicate fragment names collide at build time instead of last-one-wins.

## Why fragment masking is off, for now

Masking — a component may read only the fields its own fragment declares — is **off in v1**, deliberately.

It catches a real bug: a component quietly depending on a field a _different_ component requested, which breaks in the browser when that other fragment changes. Against that, it costs an unmask call in every component, a masked type threaded through the async memo of [#20](https://github.com/KookiKodes/solidifront/issues/20), and one more concept before a developer's first query works. The payoff scales with the number of components sharing an operation, and a first storefront has few.

**This is the decision in this ADR most likely to be regretted.** Turning masking on later changes every consumer component, so it is cheap now and costs a major version afterwards. It is recorded here as a considered trade-off rather than an omission, so that reversing it is a decision and not a discovery.

## Why the operation carries its kind

Codegen parses the document anyway, so the kind is free to carry — and the client keeps **`query` and `mutate`** rather than collapsing to one `execute`.

The two genuinely diverge: a mutation must not be blindly retried, and caching options apply to only one of them. That belongs in the signature rather than in a runtime branch. The operation also carries its **API**, so a Customer Account document passed to the storefront client fails at compile time — where Hydrogen preview manages only a runtime throw.

## Consequences

**Codegen is the only thing that can mint an operation.** The client's parameter type is a branded object, not a string, so a hand-rolled document is a compile error and the build-time gate has no bypass.

**`tsc` must see `.solidifront/`.** Generated modules land there, gitignored, reached through a Node `imports` subpath. On a cold clone before the first `dev`, typechecking fails **loudly** — never `any` — which is the same window [ADR-0005](./0005-the-api-version-type-is-open-and-narrowed-by-codegen.md) already accepted for the version registry.

**One assumption is load-bearing and unproven.** No codegen plugin emits Effect `Schema` for a _selection set_; the community validation-schema plugin covers input types only. Unions and interfaces discriminated on `__typename`, and `@include`/`@skip` conditionality, are where it could fail — [#35](https://github.com/KookiKodes/solidifront/issues/35). If it does, this ADR's first section is what gives way.
