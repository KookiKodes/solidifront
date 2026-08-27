# The Customer Account schema is a committed standard-tier fixture

Solidifront commits one Customer Account API introspection fixture **per supported API version**, at the **standard privilege tier**, and serves it as the consumer's schema. The fixture is extracted from **Shopify's published `@shopify/dev-mcp` tarball** — keyless, first-party, immutable per release. CAAPI codegen is **unconditional**. Decided in [#43](https://github.com/KookiKodes/solidifront/issues/43), with the source settled in [#44](https://github.com/KookiKodes/solidifront/issues/44); supersedes [ADR-0013](./0013-the-customer-account-schema-comes-from-the-consumers-own-app.md).

The consumer supplies no credential and registers nothing for typegen. Their `customerAccountApiClientId` remains what [ADR-0012](./0012-customer-authentication-is-a-requirement-not-an-argument.md) makes it — the OAuth `client_id` for sign-in — and has no role in schema sourcing.

## Why the consumer's own id cannot supply the schema

Two identifiers, opposite sides of Shopify's product line, disjoint namespaces:

|                       | Headless channel                                    | app API key                            |
| --------------------- | --------------------------------------------------- | -------------------------------------- |
| Where it comes from   | Headless sales-channel app, in the merchant's admin | Partner/Dev Dashboard → Authentication |
| Shape                 | `shp_<uuid>`                                        | 32 hex                                 |
| Scoped to             | one shop                                            | an app, across all shops               |
| Introspection service | **refused, `404`**                                  | **accepted, `200`**                    |

The service is an _app-developer_ tool — the same key also introspects the **Admin** schema, which a storefront credential has no business doing. Shopify ships no storefront-developer equivalent. Verified in [#42](https://github.com/KookiKodes/solidifront/issues/42) against a live id then serving `hydrogen.shop`'s login, with and without the `shp_` prefix.

## Why the standard tier, and why that is not a shortfall

The schema varies by an opaque **privilege tier**, not by declared scopes: every public app returns one byte-identical **372**-type payload regardless of its `access_scopes`, while Hydrogen's first-party key returns **493**, a strict superset ([#42](https://github.com/KookiKodes/solidifront/issues/42)). There is no route from solidifront to the 493.

That ceiling **coincides with the API Shopify documents**, and [#44](https://github.com/KookiKodes/solidifront/issues/44) both corrected the grounds for saying so and strengthened them.

#43 argued it from Shopify's first-party validator, which at `2026-07` rejects a marker from every cluster of the 121-type delta — `paymentInstruments` and `availableWalletPaymentConfigs` (wallets), `uiExtensionMetafields` (extension surface), `taxInvoices` and `lineItemContainers` (order presentation depth) — while accepting the shared controls: `storeCreditAccounts`, `subscriptionContracts`, `addresses`, `orders.lineItems`, core profile. All five were confirmed present in a live 493 introspection, so it is a tier boundary and not a naming error.

**That argument was circular, and is retired.** The validator is `shopify-dev-mcp`, and #44 established it answers out of the very 372-type standard-tier file this ADR now commits. Validator and schema were one artifact consulted twice, not two witnesses agreeing.

The conclusion stands on independent evidence instead: **Shopify's rendered reference documentation is itself standard tier.** `shopify.dev/docs/api/customer/<version>/full-index.md` contains zero of the five marker types at `2025-10`, `2026-01`, `2026-07` and `unstable` — a different artifact from a different pipeline than the schema file. So "a developer working from Shopify's documentation cannot reach a gated field" is now a property of the documentation, not an inference from a tool that reads the same bytes.

#42's framing — "a permanent type-coverage ceiling on a destination pillar that Hydrogen does not have" — is therefore **corrected**: Hydrogen ships types for fields Shopify does not document, which is a different thing from solidifront falling short. See **Schema tier** in `CONTEXT.md`.

## Why not Hydrogen's committed schema file

`references/hydrogen/packages/hydrogen/src/graphql/generated/customer-account.schema.json` exists on `preview`, needs no key, and is the intuitive answer. It has **485 types** — neither tier, because it is the first-party tier already drifting behind its own key's live 493.

Rejected on three counts at once. It describes fields Shopify's published schema refuses, which is false _acceptance_ — types promising fields the runtime may reject, surfacing in production rather than at compile time, and strictly worse than the false-rejection failure [#43](https://github.com/KookiKodes/solidifront/issues/43) was raised to avoid. It reinstates the Hydrogen dependency the "own the core" constraint forbids, as a vendored artifact — which is how it got in last time. And it re-creates the staleness ADR-0013 exists to end: `packages/codegen/copy-files.json` vendored this same file by URL with no automation, pinned at 2025-10-04, 392 types against 478 live, still describing `Checkout` and `AppliedGiftCard`.

Filtering 485 down to the standard tier is circular — it requires knowing which 372 are standard, which requires the standard-tier introspection.

## Where the fixture comes from: no key at all

Shopify publishes the standard-tier schema, as a versioned artifact inside a first-party npm tarball rather than at an HTTP schema route:

```
https://registry.npmjs.org/@shopify/dev-mcp/-/dev-mcp-<version>.tgz
  → package/dist/data/customer_<api-version>.json.gz
```

Six API versions ship gzipped in the package — `2025-10, 2026-01, 2026-04, 2026-07, 2026-10, unstable` — as introspection JSON. Extraction is one command with no Node, no `npm install`, no auth and no MCP client, pulling a ~95 KB member out of a 13 MB stream:

```bash
curl -sS "$(npm view @shopify/dev-mcp dist.tarball)" \
  | tar xz --wildcards "package/dist/data/customer_2026-07.json.gz"
```

`2026-07` is **372 types**, matching #42's live standard-tier introspection exactly, and none of the five first-party markers appear at **any** of the six versions. `buildClientSchema` accepts the files, so either the introspection JSON or generated SDL can be committed. The `isProtected` / `protectedSubject` annotations on 38 fields are protected-customer-data PII flags, not tiering — `accessRestricted` is `false` throughout.

Do not run the MCP server in CI to get this. `dist/index.js` is stdio-MCP only and its `./tools` export needs a ~16 MB dependency tree; schema validation never touches the network, which is exactly why the bare data file suffices.

**This retires the borrowed app API key** ADR-0014 originally specified, and with it the app-side dependency. #42 found three borrowed keys already dead, and the introspection endpoint cannot distinguish "deleted app" from "never existed" — an unfixable diagnostic. An npm tarball is immutable and permanently resolvable, so a pinned version cannot rot into an ambiguous `404`. It also dissolves the dilemma that made the key uncomfortable: borrowing a third party's identifier, versus registering a solidifront app for a once-per-version chore. Neither is needed.

**Hydrogen's schema remains forbidden** on unchanged grounds, now measured twice: `packages/hydrogen-react/customer-account.schema.json`, published on npm as well as committed, is **484 types on `main`** against #43's 485 on `preview` — it moves — with all five first-party markers present. Shopify's own runbook regenerates it only at quarterly majors.

**Requiring the consumer to supply an app key** stays rejected, now trivially: the source needs no key from anyone.

**The remaining exposure is release cadence, and it does not bind.** The fixture now depends on Shopify continuing to bundle schemas at this path. `shopify.dev/api-versions.json` reports `customer.available` as exactly the six versions dev-mcp ships, and dev-mcp carries `unstable` and the RC _ahead_ of stable — so a version's schema is in the package months before that version becomes supported.

## Why codegen is unconditional

ADR-0013 gated CAAPI codegen on customer-auth configuration for one stated reason: _"A storefront without login must not need a Customer Account app registered in order to build."_ No consumer registers anything now, so the reason is void rather than weakened.

The gate it aligned with survives independently and is stronger: [ADR-0012](./0012-customer-authentication-is-a-requirement-not-an-argument.md) makes an authenticated customer a requirement in the `R` channel, so calling a CAAPI operation without a session is already a compile error. Conditionality's only remaining effect is _worse_ diagnostics — an unconfigured consumer would get a missing-module error instead of a directed requirement error.

Gating on the presence of CAAPI _documents_ was also rejected: codegen would have to see the documents before deciding whether to generate the schema those documents are checked against, which re-creates ADR-0013's inverted stub from the opposite direction. The build-time and bundle cost to a login-less storefront is real but unmeasured, and belongs to [#36](https://github.com/KookiKodes/solidifront/issues/36) as evidence rather than to a pre-emptive branch.

## Why supported versions only

Fixtures cover the **supported** set. A pre-release pin fails CAAPI codegen with a directed error naming the newest version that has a fixture; the Storefront side continues to work, since ADR-0005 has the consumer introspect their own store live.

Pre-release schemas move under measurement — `2026-10` was 478 types for ADR-0013's probes and 486 later — so a committed pre-release fixture would mean a routine solidifront release silently changes a consumer's generated CAAPI types with no diff in their repo. That is precisely the hazard ADR-0005's no-default rule exists to prevent, and it is better for the cost to land on a preview user's build as a loud error than on solidifront's release discipline as a silent type change.

Two notes from [#44](https://github.com/KookiKodes/solidifront/issues/44). Those 478/486 figures were measured at the **first-party** tier; the standard tier has not been watched over time at a fixed pre-release version, so the "it moves" premise is sound but its evidence is tier-mismatched. And the exclusion is now a **policy choice rather than a sourcing limit** — dev-mcp bundles `2026-10` and `unstable` too, so pre-release fixtures became available exactly when the key was retired. Independent support for keeping them out: standard-tier `2026-10` is **366** types against `2026-07`'s **372**. The release candidate is _smaller_ than current stable, so types are being withdrawn, and a pre-release fixture would compile operations the newer version has removed.

Falling back to the newest supported fixture on a pre-release pin is the clearest reject: generating types from `2026-07`'s schema while operations are sent to `2026-10` reinstates exactly the Hydrogen desync trap ADR-0005 cites from `docs/research/shopify-domain.md:254`.

## Consequences

**Welding now has a price, and this is where it shows.** The CAAPI version is welded to the single Storefront pin, so pinning a pre-release to preview Storefront also drags CAAPI to a version with no fixture. The Storefront schema is fetched live and tolerates any version Shopify serves; the CAAPI schema is committed and does not. The asymmetry is new and is the direct cost of this ADR.

**The pillar is no longer a single point of failure — ADR-0013's "no fallback" is refuted.** It was true when written. [#44](https://github.com/KookiKodes/solidifront/issues/44) exhausted the search rather than merely failing to find more, recovering shopify.dev's complete 332-route client manifest and confirming the `*-direct-proxy` naming space closed by a `400`-versus-`404` contrast (Storefront and Admin answer `400` because they exist; every Customer spelling `404`s). What that search turned up is **three** routes to a standard-tier schema, two of them keyless:

1. the `@shopify/dev-mcp` tarball — keyless, complete introspection JSON, immutable per release (the decision above)
2. a borrowed public app key against the introspection service — complete; the retired incumbent, still available
3. shopify.dev's per-version docs corpus — keyless, standard tier, reconstructable but incomplete as published

It keeps [#29](https://github.com/KookiKodes/solidifront/issues/29)'s pinned-and-nightly-diffed treatment, on different ground: the new source is a developer tool whose `dist/data/` layout is not a stability contract.

ADR-0013's "undocumented" claim is **softened**: the app-key service is a README-documented option in a published first-party package, and that README states `apiKey` is _"Required and only valid for the customer API preset"_ — the closest thing to Shopify saying on the record that there is no keyless Customer route. Shopify has never said so in words; treat that as not established.

**The nightly cross-check now has a genuinely independent second observer.** Diffing the committed fixture against the tarball it was minted from would be a _freshness_ check, not the tier-drift detector this ADR claimed — same artifact, no common-cause separation. Route 3 supplies the separation: `shopify.dev/docs/api/customer/<version>/full-index.md` and its per-type documents are keyless, per-version, standard tier, and do not rot (`:version`-parameterised, with `2026-01` and `unstable` keeping their own paths). Whoever specs it must handle one asymmetry: `full-index` is **not** an exhaustive type inventory — edge types are folded into 31 "connections" entries, so `OrderEdge.md` returns `200` while `OrderEdge` is unlisted, and `2026-07` indexes 345 entries against 364 named introspection types. It compares two _representations_, not two copies. No key, and no fixture regeneration.

**ADR-0013's rejected fallback is now the decision, and the difference is mechanism.** That ADR rejected "serving solidifront's committed fixture as the consumer's schema" as _"precisely the vendored-schema staleness this ADR exists to end."_ The objection was sound against a Hydrogen file vendored by URL with no automation. It does not transfer to a fixture minted per-version from the live service and diffed nightly against Shopify's published schema.

**Unverified:** byte-identity between the tarball schema and a live borrowed-key introspection. [#44](https://github.com/KookiKodes/solidifront/issues/44) established same tier, same type count at `2026-07` (372, matching #42), and all five markers absent at all six versions; the byte comparison was attempted and blocked by the sandbox before the request went out. The nightly diff against route 3 is the standing mechanism that would surface a divergence, so this is a confirmation worth having rather than a gate.

**Unverified:** whether the runtime honours the consumer's `customer-account-api:full` grant or the standard tier. CAAPI authenticates _before_ it validates — a bogus token returns an identical `401 Invalid token. Decode Error.` for a valid field, a nonexistent field and a syntax error alike — so this cannot be probed without a real customer login. It is parked as an L5 nightly assertion behind the map's **Nightly (L5) infrastructure** prerequisites. Its stakes are much reduced: the fields in question are undocumented, so rejecting them at compile time is defensible rather than the worst available failure.

**Welding no longer rests on `storefrontCustomerAccessTokenCreate`, and is stronger for it.** [#34](https://github.com/KookiKodes/solidifront/issues/34) argued the CAAPI version welds safely to the single Storefront pin partly because that mutation is present in every supported version, so welding never dangles. [ADR-0015](./0015-the-customer-account-access-token-is-the-buyer-identity-credential.md) removed the mutation from solidifront's design entirely — the Customer Account access token reaches `@inContext` directly — so its presence carries no weight in either direction, and the leg is retired rather than merely unverified. What replaced it is better: [#44](https://github.com/KookiKodes/solidifront/issues/44) established `storefront.available` and `customer.available` as identical lists in `shopify.dev/api-versions.json`, one keyless first-party file, in place of per-version probing.

For the record, since ADR-0013 leaned on it: the mutation is **present at all six versions including `unstable`**, and **deprecated at all six**, carrying an identical deprecation reason unchanged since `2025-01` (measured across the tarball fixtures in [#45](https://github.com/KookiKodes/solidifront/issues/45), completing the `2026-01`/`2026-04` gap this ADR previously left open). Deprecated for eighteen months with no removal and still in the pre-release schema, so the absence-from-`unstable` signal ADR-0005's positional rule watches for has not fired. Codegen keeps emitting its types from the fixture; solidifront never calls it.
