# The API version type is open, and narrowed by codegen

The consumer pins the Storefront API version; it is **required**, with no default. The type solidifront **publishes** is open, and codegen narrows it in the consumer's project through an augmented registry interface — so no release of solidifront can ever forbid a version Shopify serves. Decided in [#12](https://github.com/KookiKodes/solidifront/issues/12).

```ts
// published by @solidifront/core — open, locks nobody out
export interface ApiVersionRegistry {}
export type ApiVersion = [keyof ApiVersionRegistry] extends [never]
  ? `${number}-${number}` | "unstable"
  : keyof ApiVersionRegistry;

// generated into .solidifront/ — narrows the same type in the consumer's project
declare module "@solidifront/core" {
  interface ApiVersionRegistry {
    "2025-10": true;
    "2026-01": true;
    "2026-04": true;
    "2026-07": true;
    "2026-10": true;
    unstable: true;
  }
}
```

`ValidVersion` becomes `ApiVersion`. `LatestVersion` is deleted: there is no default for it to supply.

## Why not a closed union

A closed union is the obvious answer, and it is the bug this decision exists to remove — [`schemas.ts:45-78`](../../packages/storefront-client/src/schemas.ts) hard-coded nine literals ending at `2025-10` and defaulted to `2025-04`, past end-of-support, and `ClientOptions` is annotated `onExcessProperty: "error"` so a consumer literally **cannot** pass `2026-07`.

Generating that union instead of hand-writing it does not fix it. It changes who updates the list, not what happens between updates: ship `"2025-10" | … | "2026-07"`, and in January a consumer on that release cannot type `2027-01` — and a consumer who never upgrades never can. The failure is structural in _shipping a closed set in a package that releases on its own schedule_, so the fix has to be that the published set is not closed.

Registry augmentation is already this codebase's idiom for exactly this problem — `interface StorefrontQueries extends CodegenOperations {}` at `schemas.ts:13` is the same shape for generated operations. Verified under `--strict`, both directions:

```
t.ts(9,7):  error TS2322: Type '"not-a-version"' is not assignable to type 'keyof ApiVersionRegistry'.   ← open fallback rejects malformed
t2.ts(6,7): error TS2322: Type '"2025-01"'      is not assignable to type 'keyof ApiVersionRegistry'.   ← narrowed set rejects unsupported
```

The cost is a window, not a hole: on a cold clone before the first `dev`, a well-formed-but-unsupported version is caught by the build rather than the editor.

## Why required, with no default

Because the version determines the consumer's **generated types**, not just a URL segment. A defaulted version means a routine solidifront release changes their types with no diff in their repo — code stops compiling, or worse keeps compiling against fields that moved.

Hydrogen defaults (`STOREFRONT_API_VERSION = "2026-04"`) and gets away with it only because it welds types to the _bundled_ schema and lets `apiVersion` drift independently — the trap recorded at `docs/research/shopify-domain.md:254`, where a version bump silently desyncs the two and the desync is documented as an escape hatch. Deriving the consumer's types from the consumer's version is what makes that trap impossible, and it is also what makes a default unsafe.

Note that `@shopify/storefront-api-client` — often cited the other way — also has no default: `apiVersion` is a required plain `string`, validation is a `console.warn`, and its supported set is computed from the **system clock**, never the network.

The ergonomics are paid for rather than argued away: `create-solidifront` writes today's latest at init, and the nightly canary says when to bump.

## Why the fallback never guesses

When the supported-set query fails, codegen **skips augmentation** and leaves the open type. It does not fall back to a cached list, and it does not fall back to the clock arithmetic Shopify's own client uses.

A guessed set that is one release stale produces a type error on a version that works — reintroducing the exact lockout the open type exists to prevent, through the error path. Skipping costs autocomplete and nothing else.

For the same reason the build does not fail on it. The registry is ergonomics; the schema fetch is correctness. Only the latter stops a build.

## Why `supported` never reaches the type

Every handle `publicApiVersions` returns enters the registry, including `unstable` and the release candidate, both of which report `supported: false`. The flag drives a build-time **warning**.

The type answers "does Shopify know this version." The warning answers "should you be on it." Collapsing them into the type would make previewing an unreleased version — a first-class Shopify affordance — impossible to express, while gaining nothing the warning does not already say.

## Why the version is not an environment variable

`SHOPIFY_PUBLIC_STOREFRONT_VERSION` is deleted; the version is a `solidifront()` plugin option.

Environment variables exist for values that legitimately differ between dev, staging and production. An API version that differs across environments is a bug, not a feature — and this one was never secret (it was already `SHOPIFY_PUBLIC_`). It is a pinned dependency, closer to a package version than to a store token.

Mechanically it is forced anyway: codegen needs the version to fetch a schema, which happens before any layer or typed-env value exists, and [ADR-0004](./0004-generated-modules-export-a-layer-not-a-runtime.md) puts layers _only_ in the config module.

## Consequences

**Fall-forward is now detected rather than assumed.** `x-shopify-api-version` echoes the version Shopify actually served — requesting `2025-04` returns `200` with `2025-10`. Mismatches warn always, deduped once per process, loud in dev; never an error, because taking a storefront down over version drift is worse than serving it. The ticket, `current-state-audit.md` §3 and `docs/research/README.md` all describe this as _silent_; it never was.

**Shipped operations must be portable across the supported window.** That is the price of letting consumers choose. L2 commits one introspection JSON per supported version and validates every shipped operation against all of them; when an operation cannot be portable, solidifront **raises its floor rather than branching the operation**, because per-version branches are a combinatorial maintenance trap and there is no back-compat constraint.

**One undocumented endpoint is load-bearing for CI.** Consumers introspect their own store tokenlessly, falling back to `shopify.dev/storefront-graphql-direct-proxy/{version}` — semi-public, no stability page. CI has no store, so it depends on the proxy outright. **Unverified:** whether a development store's password page blocks tokenless introspection. It is the exact store type a consumer builds against on day one.

**One pin governs both APIs.** The Customer Account API version is **welded** to this one — there is no second knob. This reverses what this ADR originally recorded: the claim that CAAPI had "no direct proxy, no tokenless introspection, no version enumeration", and was therefore pinned by solidifront rather than the consumer, was decided by exclusion and **all three premises were false**. Shopify serves a tokenless CAAPI introspection service, and every Storefront-expressible version has a CAAPI counterpart, so welding never dangles. See [ADR-0013](./0013-the-customer-account-schema-comes-from-the-consumers-own-app.md) and [#34](https://github.com/KookiKodes/solidifront/issues/34).

**A retired pin is a build error, and the registry is the only detector.** `publicApiVersions` omits retired versions entirely rather than flagging them — `2025-07` retired on 2026-07-16 and is simply absent, while every version present with `supported: false` is *pre-release*. So the classification is **positional, not flag-based**: absent, or below the supported minimum, means retired and **fails the build**, naming the oldest accessible version; above the supported maximum means pre-release and takes the warning above. This matters because fall-forward is *undetectable* on the CAAPI schema path (ADR-0013), so the registry is the only thing standing between a retired pin and a silently wrong type set.

**#27's passthrough is unaffected.** It matches every version `SFAPI_RE` does, deliberately wider than the pinned one, because Shopify's own CDN scripts pick the version they call.
