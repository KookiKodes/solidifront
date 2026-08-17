# codegen-schema — THROWAWAY PROTOTYPE

Answers wayfinder ticket [#35](https://github.com/KookiKodes/solidifront/issues/35).
Not production code. Nothing here is meant to survive; the decisions it produced
are what survive.

**Verdict: yes.** A generated Effect `Schema` expresses a Shopify selection set —
unions, interfaces, `@include`/`@skip`, and depth — and decode is **exact
identity** on every real response captured. [ADR-0006](../../docs/adr/0006-an-operation-is-a-generated-module-not-a-string.md)
§1 stands. The build carries four hard invariants and one genuine loss, below.

## Running it

```
pnpm capture      # introspection + real responses from mock.shop (no credentials)
pnpm gen          # operations/*.graphql -> generated/<Name>.<fallback>.ts
pnpm probe:all    # gen + decode + arity + defer + types
```

Captured output: [`results-35.txt`](./results-35.txt).

`https://mock.shop/api` is a tokenless, credential-free Shopify Storefront API.
Its schema is **newer than the vendored one** in `packages/codegen`
(422 types vs 374; `Node` has 37 implementors, not 33) and it serves `@defer`,
`@include`, `@skip` and `@inContext` — so every fixture here is a primary
source, and CI could re-capture it with no secrets. This also independently
re-confirms [#14](https://github.com/KookiKodes/solidifront/issues/14)'s finding
that `@inContext` carries all five arguments including `visitorConsent`.

## The pieces

| File                  | What it is                                                     |
| --------------------- | -------------------------------------------------------------- |
| `src/schema-index.ts` | introspection-JSON lookup; the branded-scalar list             |
| `src/emit.ts`         | **the generator** — selection set -> `Schema` source, plus the document rewrite that injects `__typename` |
| `src/capture.ts`      | pulls introspection and real responses off mock.shop           |
| `src/probe-decode.ts` | decodes real responses; checks identity; error quality         |
| `src/probe-arity.ts`  | decode cost vs union arity, 2 -> 128 members                    |
| `src/probe-defer.ts`  | the real multipart `@defer` stream                             |
| `src/probe-types.ts`  | `tsc` assertions: identity-typedness, narrowing, depth         |

`operations/*.graphql` are eight documents picked to hit the risk cases, each
validated against the real schema before generation (so the probe measures a
design, not a typo).

## What it found

### 1. It works, and decode is exact identity

All eight operations decode their real captured responses with **zero drift** —
`Search` (3-member union, heterogeneous real data), `Menu` (7 members, including
a real `null`), `NodeById` (**37 members**), `CartCreate` (the `BaseCartLine`
interface wrapping a nested `Merchandise` union), `DeepCollection` (selection
depth 12), `FragmentComposition` (name-composed fragments), `ProductConditional`
(`@include`/`@skip`).

### 2. Four invariants the generator must hold

1. **`__typename` must be a required `Schema.Literal` in every member.** Effect 4
   builds a sentinel index over union members (`SchemaAST.getIndex`): one
   required literal key shared by all members buys a `Map` dispatch. Measured
   ns/op for the worst-case member:

   | union shape | n=2 | n=16 | n=37 | n=128 |
   | --- | --- | --- | --- | --- |
   | required `Schema.Literal` (what codegen emits) | 3640 | 1522 | **1452** | **1401** |
   | `optionalKey` `__typename` — sentinel lost | 3239 | 13134 | **28133** | **99756** |
   | no `__typename` — structural only | 2840 | 13311 | 31027 | 106607 |

   Flat vs linear. Losing the sentinel costs **19× at 37 members, 71× at 128**.
   `NullOr(Union(...))` — every nullable abstract field — keeps the fast path.

2. **The generated schema must declare exactly the transformed document's
   selection set.** `Schema.Struct` **silently drops** keys the wire carries but
   the schema does not declare. So a mismatch makes decode-on and decode-off
   return *different values* under the same type — precisely the fork ADR-0006
   exists to prevent. One generator emitting both document and schema is what
   makes this safe, which is an argument *for* "an operation is a generated
   module".

3. **`__typename` must be injected into the document, not just the schema.**
   The developer never writes it. `src/emit.ts`'s `transformDocument` adds it to
   every abstract selection set that has a type condition — and *only* those, or
   invariant 2 breaks.

4. **The fallback for un-selected possible types must be one literal per type.**
   A 37-implementor interface with two inline fragments needs the other 35
   covered. Collapsing them into one member with `Schema.Literals([...35])`
   makes `Schema.toTaggedUnion("__typename")` **throw at module load** —
   `No literal or unique symbol found` — because a literal *union* is not a
   sentinel. Both emissions are in the generator as `expand` and `catchall`:

   | | members | decode (n=37) | `toTaggedUnion` | error on unknown `__typename` |
   | --- | --- | --- | --- | --- |
   | `expand` | 37 | 1432–1539 ns | ✅ | 1863 chars |
   | `catchall` | 3 | 2420–2725 ns | ❌ throws | **73 chars** |

   `catchall` is still constant-time (sentinel narrowing survives, it just loses
   the pure `Map`), 3.2× smaller to emit, and has a far better error — but gives
   up `toTaggedUnion`'s `match`/`guards`/`discriminants`. `expand` is the
   recommended default; the trade is real and belongs in the spec.

### 3. Arity degrades the error message, not the decode

The ticket asked whether unions "degrade at Shopify's arity". Decode does not —
it is flat to 128 members. The **error** does: an unknown `__typename` at 37
members produces a 1863-char single-line `Expected A | B | C | …` wall that never
says *"unknown `__typename`: Wrong"*. It is actionable (the path `["node"]` is
there) but unreadable. Solidifront should format union failures itself rather
than surfacing Effect's default.

Note this is not a try-all-37 fallback: the sentinel index returns *no*
candidates for an unknown tag, so it fails once, not 37 times.

### 4. `@include`/`@skip` are optional keys, and that is exactly right

`Prod["description"]` is `string | undefined` with the key **optional**;
`Prod["title"]` is required `string`. A conditionally-included field is
present-or-absent, never nullable, and a `null` in that position is correctly
**rejected**. Type assertions in `src/probe-types.ts` pin all four facts.

One modelling gap: `@include`/`@skip` also apply to fragment spreads and inline
fragments, where the whole group is present-or-absent *together*. Per-field
`optionalKey` loses that correlation — the schema admits half a group. Sound but
imprecise; correcting it needs a union of two member shapes.

### 5. Depth and recursion are a non-issue

**GraphQL forbids fragment cycles, so a selection set is always a finite tree —
`Schema.suspend` is never needed.** The real question is depth, and it does not
bite: Shopify's type graph *is* cyclic (`Collection` → `Product` →
`Collection`), so `src/probe-types.ts` nests that cycle 12 deep and compiles it.

| cycles | selection depth | structs | `tsc` status | instantiations | check |
| --- | --- | --- | --- | --- | --- |
| 1 | 12 | 12 | ok | 5288 | 160ms |
| 4 | 42 | 42 | ok | 6569 | 210ms |
| 12 | **122** | 122 | **ok** | 9985 | 270ms |

No "excessively deep" error, and cost grows linearly and gently. All 16
generated modules together: 36194 instantiations, 530ms.

### 6. Identity-typedness is asymmetric, and the asymmetry is load-bearing

`Schema.brand` is **runtime-identity** (`"gid://x/1"` in, the same string out,
`typeof "string"`) but it *does* change the type: `Encoded` is exactly `string`,
`Type` is `string & Brand<"ID">`. So for a real selection set `Type ≠ Encoded`.

The consequence ADR-0006 should state outright: a decoded value is assignable
everywhere a wire value is expected, but **not the reverse** — and with decoding
**off in production the value *is* the wire value**, so the brand is a claim
nothing checks at runtime. That is the accepted phantom-type cost of "on in dev,
off in prod", not a bug, but it is the one place the two modes genuinely differ
in type-safety rather than in work done.

### 7. `@defer` does not fit an identity decode, and v1 should not ship it

The ticket suspected this; the captured stream settles it.

`@defer` **unilaterally** flips the response to `multipart/mixed;
boundary=graphql` — regardless of the `Accept` header, and the same document
without the directive returns `application/json`. So the transport shape is a
property of the document, decided at codegen time.

The stream is two chunks:

- **chunk 0** — `{data, extensions, hasNext: true}` with the deferred fields
  **absent**. This decodes cleanly against the operation schema; `optionalKey`
  models it exactly.
- **chunk 1** — `{incremental: [{path: ["product"], label: "slow", data: {…}}], hasNext: false}`.
  Its `data` is the **fragment's** shape at a path, not the operation's. The
  per-operation schema **rejects it** (`Missing key at ["product"]`).

So there is no per-chunk decode without a second schema per deferred label.
**Buffer every chunk, merge each `incremental` at its `path`, decode once when
`hasNext` is false** — that works and is exact identity (probe 3 of
`probe-defer.ts`). But it also defeats the entire point of `@defer`: nothing
renders early.

Recommendation: **v1 does not support `@defer`** — codegen rejects the directive
with a build error. That is a decision, not a gap, and it is consistent with
[#27](https://github.com/KookiKodes/solidifront/issues/27)'s finding that
`deferStream` is not the query default and with
[#20](https://github.com/KookiKodes/solidifront/issues/20)'s async memo having a
single resolution point.

## What was not probed

- **Bundle size** of generated schemas. `NodeById.expand` is 5.2 KB of source
  for one operation with a 37-member union; a real storefront has dozens of
  operations. `catchall` is 3.2× smaller. Nothing here measures the shipped cost,
  and under ADR-0006 these modules ship to the client.
- **`MetafieldReference` (10) / `MetafieldParentResource` (15) with real data** —
  mock.shop returns no metafields. The generator emits them correctly and the
  arity question is settled by `Node` at 37 plus the synthetic sweep to 128, but
  no captured response exercises them.
- **Generator throughput** on a full storefront's operation set, and watch-mode
  incrementality.
- **Fragment masking**, deliberately out of scope for v1 per ADR-0006.
