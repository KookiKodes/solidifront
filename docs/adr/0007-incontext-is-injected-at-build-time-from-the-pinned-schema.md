# `@inContext` is injected at build time, from the pinned schema

Every `@inContext` argument the pinned API version supports is injected into every operation, always, at build time. The argument set is read from the introspected schema rather than written down. Decided in [#14](https://github.com/KookiKodes/solidifront/issues/14).

Values come from `RequestContext` ([#13](https://github.com/KookiKodes/solidifront/issues/13) §3) and are `null` when absent. All injected variables are stripped from the caller's `Variables` type.

## Why this is possible at all, and why Hydrogen cannot do it

Both Hydrogens inject only the `country` and `language` **variables**, gated on a regex over the query text, and neither ever rewrites the document. They structurally cannot: both infer types from the literal source string the developer wrote, so injecting a directive would desynchronise the type from the document that runs.

[ADR-0006](./0006-an-operation-is-a-generated-module-not-a-string.md) removes that constraint. Types are generated from the **transformed** document, so injection and inference agree by construction. This is solidifront's clearest technical lead over both Hydrogens and it is a deliberate keep.

## Why the argument set comes from the schema

Checked against the two introspection JSONs in this repo:

|             | pre-2025-10                                           | unstable               |
| ----------- | ----------------------------------------------------- | ---------------------- |
| locations   | `QUERY`, `MUTATION`                                   | same                   |
| arguments   | `buyer`, `country`, `language`, `preferredLocationId` | **+ `visitorConsent`** |
| nullability | every argument nullable                               | same                   |

Three things follow. The set **varies by API version**, so a hardcoded list is wrong for somebody the moment it is written — a 2025-10-pinned consumer and a 2026-07 one need different sets, and reading the schema serves both with no per-version branching. Every argument is **nullable**, so injection needs no runtime conditionality and no second document for the absent case. And the directive is valid on `QUERY` and `MUTATION` only, so a shorthand `{ … }` operation cannot carry it — which is the same requirement MSW's matcher imposes for a document to be mockable at all, arrived at independently.

## Why everything is injected, not just locale

Restricting injection to Hydrogen's `country`/`language` was considered and rejected.

`visitorConsent` is the argument Shopify uses to suppress identity **server-side** when a visitor declines ([#24](https://github.com/KookiKodes/solidifront/issues/24)). Making it opt-in makes compliance opt-in, on a library whose users will assume the default is correct. `buyer` is the difference between a personalised and an anonymous price. Neither is the sort of thing to leave as a per-document checkbox when the request already knows the answer.

## Why a hand-written `@inContext` is an error

Today's implementation silently replaces an argument the developer wrote (`storefront-client/src/utils/upsertInContextWithLocale.ts:58-68`). That is the wrong default: the premise of the whole mechanism is that the developer never writes the directive, so its presence is a conflict to surface, not a preference to honour.

The same reasoning covers a developer-declared `$country`. The current code _reuses_ the declaration rather than adding one — which, combined with stripping, produces a variable the caller can see in their own document but cannot pass, with nothing in the failure pointing at `@inContext` as the cause. It is a build error with a directed message instead.

## Why the override is on the call, not in the variables

A locale switcher or market preview needs one operation to run against a different market than the request's, and `RequestContext` is per-request so it cannot vary per operation.

```ts
client.query(PRODUCT, { variables, context: { locale: "fr-CA" } });
```

> **Amended by [#16](https://github.com/KookiKodes/solidifront/issues/16).** This example originally read `context: { country: "CA" }` — a _partial_ override, shallow-merged field by field. The locale override is now taken **whole**, because merging a lone `country` over an existing `language` can compose a pair the shop does not offer, and [ADR-0009](./0009-the-locale-table-is-generated-at-build-time.md)'s literal union makes an invalid pair unrepresentable instead of a runtime check. The override also reaches exactly one operation and never propagates — see [ADR-0010](./0010-the-url-is-the-locales-source-of-truth.md).

Merged over `RequestContext`, and deliberately not merged into `variables`: context and variables are different things, one belonging to the request and one to the document, and collapsing them is what produced the `$country` trap above. It also narrows the seam [#21](https://github.com/KookiKodes/solidifront/issues/21) already established rather than opening a second one.

## Why solidifront's own operations are pinned to a floor

Solidifront ships its own operations — cart mutations, `localization`, `publicApiVersions` — and is published before any consumer's version exists. Those are transformed at **publish** time against a declared floor version, not at the consumer's build.

The alternative — shipping raw documents for the consumer's codegen to process — is more uniform and was seriously considered, but it splits solidifront's types in two, floor-typed for its own typechecking and consumer-version-typed for the emitted artifact, and then leans on structural compatibility across a window in which fields can be _removed_. That is the drift [ADR-0005](./0005-the-api-version-type-is-open-and-narrowed-by-codegen.md) exists to prevent.

The cost is a bounded asymmetry: an argument added after the floor does not reach solidifront's own operations until the floor moves. Roughly one argument every 18 months (`buyer` 2024-04, `visitorConsent` 2025-10), fixed by a patch release, and currently free — the supported window is 2025-10 through 2026-07, and a 2025-10 floor already carries all five. ADR-0005's per-version validation is what catches the day it stops being free.

## Consequences

**`InContext`'s provider hooks do not survive.** The three `Effect.serviceOption` lookups per operation at `StorefrontClient.ts:270-300` are replaced by plain `RequestContext` fields, per [#27](https://github.com/KookiKodes/solidifront/issues/27) and #13's rule that a service needing both a resource and per-request configuration is factored wrong.

**One build-time gate covers everything.** The transform must parse and re-print each document anyway, so it also enforces named-and-keyword-form, exactly one operation definition, no hand-written directive, and full validation against the pinned schema. A separate check command would duplicate the parse to re-derive errors this one already has.

**If response caching ever lands, the injected context is part of the cache key.**

**What fills `RequestContext.visitorConsent` is still open** — reading `_tracking_consent` and deciding the pre-choice default is [#18](https://github.com/KookiKodes/solidifront/issues/18)'s, where [#28](https://github.com/KookiKodes/solidifront/issues/28)'s finding that Shopify's own gate fails **open** is the thing to deviate from.
