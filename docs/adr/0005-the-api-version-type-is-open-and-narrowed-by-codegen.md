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

## Why the version list stays on `publicApiVersions`

`shopify.dev/api-versions.json` is a keyless first-party document giving `stable`, `rc` and `available` for 27 Shopify surfaces at once — including `customer`. It looks like a strictly better source and is not, because two of its three apparent advantages do not survive measurement. Decided in [#46](https://github.com/KookiKodes/solidifront/issues/46).

**Keyless and store-free is not a differentiator.** `publicApiVersions` answers tokenlessly on two independent routes — `mock.shop/api` and `shopify.dev/storefront-graphql-direct-proxy/{version}` — returning identical lists. The proxy is already a hard CI dependency (see Consequences), so nothing new is required for a credential-free read.

**Flag-based versus positional is not a differentiator.** `ApiVersion.supported` is a per-version boolean, used above, and `displayName` additionally renders `(Latest)` and `(Release candidate)`. [#34](https://github.com/KookiKodes/solidifront/issues/34) was not reasoning from absent flags. What it lacked — and what nothing supplies — is a _retirement_ flag.

**No source detects retirement.** `api-versions.json`'s `available` omits retired versions exactly as `publicApiVersions` does, and so does `@shopify/dev-mcp`'s bundled `dist/data/supported-versions-schema.json`. Absence is the only hard signal on every candidate, so the positional rule below is source-independent.

What is left is a contract asymmetry running the other way: `publicApiVersions` is a documented GraphQL field carrying GraphQL's own deprecation machinery, against a docs-site asset serving `cache-control: public, max-age=60`, with no versioned URL, no stability page, and no reference in Shopify's own vendored tooling. The Storefront list therefore stays where it is, and `api-versions.json` earns exactly one job — the one `publicApiVersions` structurally cannot do (see Consequences).

**dev-mcp's catalog loses on liveness.** It is a publish-time snapshot that _legitimately_ disagrees with live: [ADR-0014](./0014-the-customer-account-schema-is-a-committed-standard-tier-fixture.md) records that it carries `unstable` and the release candidate ahead of stable. Reading versions from the same tarball that supplies the CAAPI schema would couple version truth to schema release cadence.

## Why the version is not an environment variable

`SHOPIFY_PUBLIC_STOREFRONT_VERSION` is deleted; the version is a `solidifront()` plugin option.

Environment variables exist for values that legitimately differ between dev, staging and production. An API version that differs across environments is a bug, not a feature — and this one was never secret (it was already `SHOPIFY_PUBLIC_`). It is a pinned dependency, closer to a package version than to a store token.

Mechanically it is forced anyway: codegen needs the version to fetch a schema, which happens before any layer or typed-env value exists, and [ADR-0004](./0004-generated-modules-export-a-layer-not-a-runtime.md) puts layers _only_ in the config module.

## Consequences

**Fall-forward is now detected rather than assumed.** `x-shopify-api-version` echoes the version Shopify actually served — requesting `2025-04` returns `200` with `2025-10`. Mismatches warn always, deduped once per process, loud in dev; never an error, because taking a storefront down over version drift is worse than serving it. The ticket, `current-state-audit.md` §3 and `docs/research/README.md` all describe this as _silent_; it never was.

**Shipped operations must be portable across the supported window.** That is the price of letting consumers choose. L2 commits one introspection JSON per supported version and validates every shipped operation against all of them; when an operation cannot be portable, solidifront **raises its floor rather than branching the operation**, because per-version branches are a combinatorial maintenance trap and there is no back-compat constraint. The same pass gates the **documented** surface: [ADR-0016](./0016-solidifront-ships-only-what-shopify-documents.md) has L2 assert that no shipped operation references a privately-documented field or type, read off the extended introspection that fixture already carries. That check exists because a field with no reference page is outside the deprecation machinery this ADR relies on — it can be withdrawn between two supported versions with no signal that arrives before the build breaks.

**Two live routes are load-bearing for CI, not one.** Consumers introspect their own store tokenlessly, falling back to `shopify.dev/storefront-graphql-direct-proxy/{version}` — semi-public, no stability page. CI has no store, so it depends on a live route outright. This ADR previously recorded that as _one undocumented endpoint_; [#48](https://github.com/KookiKodes/solidifront/issues/48) corrects it on two counts. `mock.shop/api/{version}/graphql.json` is **versioned**, not a single-version demo, and byte-identical to the proxy at all six supported versions (`sha256 b3ecef99…`, 983,502 B), so it is a second route rather than a toy — commit both hashes and the choice becomes availability, not content. And the proxy's failure mode is a typed `400 {"error":"Invalid API version"}` for `2025-07`, `2027-01` and `latest` alike, so [#44](https://github.com/KookiKodes/solidifront/issues/44)'s `404`-rot argument does not transfer to it. Honest count: three sources, two live-identical, one immutable. **Unverified:** whether a development store's password page blocks tokenless introspection. It is the exact store type a consumer builds against on day one.

**One pin governs both APIs.** The Customer Account API version is **welded** to this one — there is no second knob. This reverses what this ADR originally recorded: the claim that CAAPI had "no direct proxy, no tokenless introspection, no version enumeration", and was therefore pinned by solidifront rather than the consumer, was decided by exclusion and **all three premises were false**. Every Storefront-expressible version has a CAAPI counterpart, so welding never dangles. (The tokenless CAAPI _introspection service_ this bullet also cited is since retired — [#42](https://github.com/KookiKodes/solidifront/issues/42) found it refuses a consumer's client id and [#44](https://github.com/KookiKodes/solidifront/issues/44) replaced the route outright. The version half is what survives, and it is now checked nightly rather than asserted — below.) See [ADR-0013](./0013-the-customer-account-schema-comes-from-the-consumers-own-app.md) and [#34](https://github.com/KookiKodes/solidifront/issues/34).

**A retired pin is a build error, and classification is positional over a flag that is ambiguous by design.** `publicApiVersions` omits retired versions entirely rather than flagging them — `2025-07` retired on 2026-07-16 and is simply absent. This ADR previously added that _"every version present with `supported: false` is pre-release."_ **That is false**, and Shopify's own field description says so: _"Unsupported API versions include unstable, release candidate, **and end-of-life versions that are marked as unsupported**."_ Three cases, not two; today's list happens to contain no end-of-life entry, so the old sentence held by luck rather than by rule. Position is what disambiguates them — so the classification stands, on firmer ground than it was recorded on. Three tiers:

- **absent, or below the supported minimum** → retired. **Fails the build**, naming the oldest accessible version.
- **present, below stable, `supported: false`** → end-of-life-marked. **Warns**: retiring, bump now. This is the only signal in the system that arrives _before_ a build breaks, and it exists only because the flag is ambiguous.
- **above stable** → pre-release. Takes the warning above.

`unstable` is a fixed literal handle and never date-shaped, so the release candidate is identifiable as the date-shaped `supported: false` entry and stable as `max{handle : supported}`. No `displayName` is parsed anywhere: it is documented as "the human-readable name", which makes it the one part of the response a Shopify copy edit could break silently. Amended in [#46](https://github.com/KookiKodes/solidifront/issues/46).

This matters because fall-forward is _undetectable_ on the CAAPI schema path ([ADR-0014](./0014-the-customer-account-schema-is-a-committed-standard-tier-fixture.md)), so the registry is the only thing standing between a retired pin and a silently wrong type set.

**#27's passthrough is unaffected.** It matches every version `SFAPI_RE` does, deliberately wider than the pinned one, because Shopify's own CDN scripts pick the version they call.

**The weld is verified nightly, by the only source that can.** The Customer Account schema has **no `publicApiVersions` query and no `ApiVersion` type at all** — its `QueryRoot` is `company`, `companyLocation`, `customer`, `draftOrder`, `extensionApiTokens`, `order`, `orderDetailsPageOrder`, `shop`, `uiExtensionMetafields`, `uiExtensionSessionToken`. There is no GraphQL route to CAAPI versions, which is the hole welding was invented to cross, and `shopify.dev/api-versions.json` is the only keyless live source carrying both lists. It therefore enters as a **canary input and never a codegen input**: the nightly asserts `storefront.available ≡ customer.available`, `stable` and `rc` agreeing across both, and `storefront.available` against `publicApiVersions` — that last check being the only thing that would ever reveal the asset drifting from the source this ADR trusts. Keeping it off the correctness path is this ADR's own "the registry is ergonomics, the schema fetch is correctness" split applied to a source with no stability contract. [ADR-0014](./0014-the-customer-account-schema-is-a-committed-standard-tier-fixture.md) and [ADR-0015](./0015-the-customer-account-access-token-is-the-buyer-identity-credential.md) already cite this file as evidence for welding; it is now the mechanism. See [#46](https://github.com/KookiKodes/solidifront/issues/46).

**A canary that fails open is not a canary.** A `404`, a failed shape assertion, or a `null` `available` — the document's own shape admits one, `"app-home": {"stable": null, "rc": null, "available": null}` — opens an issue naming the **canary itself** as broken. Fail-open is right for a build and wrong here, because a silent-forever nightly is worse than no nightly at all: the map would go on recording the weld as verified.

**One nightly job, two observers.** The version-set canary merges with [ADR-0014](./0014-the-customer-account-schema-is-a-committed-standard-tier-fixture.md)'s CAAPI tier-drift check, which needs a version list to know which versions to walk — the list this canary already fetches. Independent jobs would duplicate that question and could answer it differently. ADR-0014's common-cause-separation argument is about the **data sources** being independent, which this preserves; sharing a scheduler is not common cause.

**Drift over time is measured against the fixture sets, not a snapshot.** Membership drift is a set difference between the live lists and the two committed fixture sets — the Storefront introspection JSONs above and ADR-0014's CAAPI fixtures — both of which are keyed to the supported version list already, so a fixture set and a version list that disagree _is_ the bug. Shape drift is an asserted document schema (`stable: string | null`, `rc: string | null`, `available: string[] | null`); a parse failure is the alarm. **Not** a committed copy of `api-versions.json`: its diff is noisy by construction, since `stable` and `rc` move every quarter across 27 unrelated surfaces, so it would alarm on `pos-ui-extensions` shipping a release.

**An arrival PR extends both fixture sets.** The canary's PR-for-the-mechanical half now owns the Storefront introspection JSON _and_ the CAAPI standard-tier fixture for the new version, plus the contract-test matrix, self-verifying against both. Welding is the point: a repo state where one fixture set carries a version the other does not is precisely the dangling weld the canary above exists to detect. ADR-0014 records that the dev-mcp tarball carries `unstable` and the release candidate ahead of stable, so the CAAPI half is effectively always ready by the time a version goes stable; if it ever is not, the PR fails to open and that is issue-worthy judgment, not grounds to split the mechanism.

**`changelog.json` is dead, and no replacement is sought.** `shopify.dev/docs/api/{storefront,customer,admin-graphql}/changelog.json` all return `404` — Hydrogen's own maintainer runbook still instructs a `curl` against it. Finding a replacement is **out of scope**: the per-version schema diff already specified above is strictly better evidence for what the canary asks, because it names the fields _solidifront's own operations_ touch where a changelog names everything Shopify shipped. Recorded so nobody re-derives the `404`.
