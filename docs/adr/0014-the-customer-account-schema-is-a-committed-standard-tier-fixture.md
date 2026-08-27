# The Customer Account schema is a committed standard-tier fixture

Solidifront commits one Customer Account API introspection fixture **per supported API version**, generated at the **standard privilege tier**, and serves it as the consumer's schema. CAAPI codegen is **unconditional**. Decided in [#43](https://github.com/KookiKodes/solidifront/issues/43), superseding [ADR-0013](./0013-the-customer-account-schema-comes-from-the-consumers-own-app.md).

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

That ceiling **coincides with the API Shopify documents.** Shopify's own first-party validator, at `2026-07`, rejects a marker from every cluster of the 121-type delta — `paymentInstruments` and `availableWalletPaymentConfigs` (wallets), `uiExtensionMetafields` (extension surface), `taxInvoices` and `lineItemContainers` (order presentation depth) — while accepting the shared controls: `storeCreditAccounts`, `subscriptionContracts`, `addresses`, `orders.lineItems`, core profile. All five rejected fields were confirmed present in a live 493 introspection, so this is a tier boundary and not a naming error.

So a developer working from Shopify's documentation cannot reach a gated field. #42's framing — "a permanent type-coverage ceiling on a destination pillar that Hydrogen does not have" — is **corrected**: Hydrogen ships types for fields Shopify does not document, which is a different thing from solidifront falling short. See **Schema tier** in `CONTEXT.md`.

## Why not Hydrogen's committed schema file

`references/hydrogen/packages/hydrogen/src/graphql/generated/customer-account.schema.json` exists on `preview`, needs no key, and is the intuitive answer. It has **485 types** — neither tier, because it is the first-party tier already drifting behind its own key's live 493.

Rejected on three counts at once. It describes fields Shopify's published schema refuses, which is false _acceptance_ — types promising fields the runtime may reject, surfacing in production rather than at compile time, and strictly worse than the false-rejection failure [#43](https://github.com/KookiKodes/solidifront/issues/43) was raised to avoid. It reinstates the Hydrogen dependency the "own the core" constraint forbids, as a vendored artifact — which is how it got in last time. And it re-creates the staleness ADR-0013 exists to end: `packages/codegen/copy-files.json` vendored this same file by URL with no automation, pinned at 2025-10-04, 392 types against 478 live, still describing `Checkout` and `AppliedGiftCard`.

Filtering 485 down to the standard tier is circular — it requires knowing which 372 are standard, which requires the standard-tier introspection.

## Why the key is borrowed rather than owned

A maintainer generates the fixture with a **public app API key**, borrowed rather than registered. App API keys are public by design; #42 verified two from Shopify's own example apps return the standard tier, and that the payload is byte-identical across every public app tested — so the fixture is reproducible from _any_ valid key and pinning a specific one buys nothing the tier does not already guarantee.

Registering a solidifront-owned app was rejected. The key is needed once per newly-arrived version, at a moment [ADR-0005](./0005-the-api-version-type-is-open-and-narrowed-by-codegen.md) already gates on human judgment — too thin a need to justify solidifront acquiring a Shopify app identity and maintaining a dashboard app in perpetuity whose only function is minting a query parameter.

Requiring the _consumer_ to supply an app key is rejected as strictly dominated: same bytes, extra credential. ADR-0013's "zero config cost" argument inverts.

**Hydrogen's hardcoded key is forbidden**, and the ground is now correctness rather than hygiene: it returns 493, a tier describing fields solidifront's consumers have no verified route to.

**This decision is provisional.** Shopify's published schema is a better source by definition — documented, keyless, no rot, no tier ambiguity — if it is obtainable as a fetchable artifact. Three URL shapes returned `404`/`301` and both `*-direct-proxy` shapes `404`; the question is not exhausted and is open as a research ticket. If it resolves, it replaces the borrowed key outright and the app-side dependency disappears.

## Why codegen is unconditional

ADR-0013 gated CAAPI codegen on customer-auth configuration for one stated reason: _"A storefront without login must not need a Customer Account app registered in order to build."_ No consumer registers anything now, so the reason is void rather than weakened.

The gate it aligned with survives independently and is stronger: [ADR-0012](./0012-customer-authentication-is-a-requirement-not-an-argument.md) makes an authenticated customer a requirement in the `R` channel, so calling a CAAPI operation without a session is already a compile error. Conditionality's only remaining effect is _worse_ diagnostics — an unconfigured consumer would get a missing-module error instead of a directed requirement error.

Gating on the presence of CAAPI _documents_ was also rejected: codegen would have to see the documents before deciding whether to generate the schema those documents are checked against, which re-creates ADR-0013's inverted stub from the opposite direction. The build-time and bundle cost to a login-less storefront is real but unmeasured, and belongs to [#36](https://github.com/KookiKodes/solidifront/issues/36) as evidence rather than to a pre-emptive branch.

## Why supported versions only

Fixtures cover the **supported** set. A pre-release pin fails CAAPI codegen with a directed error naming the newest version that has a fixture; the Storefront side continues to work, since ADR-0005 has the consumer introspect their own store live.

Pre-release schemas move under measurement — `2026-10` was 478 types for ADR-0013's probes and 486 later — so a committed pre-release fixture would mean a routine solidifront release silently changes a consumer's generated CAAPI types with no diff in their repo. That is precisely the hazard ADR-0005's no-default rule exists to prevent, and it is better for the cost to land on a preview user's build as a loud error than on solidifront's release discipline as a silent type change.

Falling back to the newest supported fixture on a pre-release pin is the clearest reject: generating types from `2026-07`'s schema while operations are sent to `2026-10` reinstates exactly the Hydrogen desync trap ADR-0005 cites from `docs/research/shopify-domain.md:254`.

## Consequences

**Welding now has a price, and this is where it shows.** The CAAPI version is welded to the single Storefront pin, so pinning a pre-release to preview Storefront also drags CAAPI to a version with no fixture. The Storefront schema is fetched live and tolerates any version Shopify serves; the CAAPI schema is committed and does not. The asymmetry is new and is the direct cost of this ADR.

**The endpoint is still the pillar's single point of failure.** ADR-0013's "no fallback" claim was re-probed and holds: `shopify.dev/customer-graphql-direct-proxy` and `.../customer-account-graphql-direct-proxy` both `404`, and `@shopify/api-codegen-preset@3.0.0`'s `api-configs.js` gives Admin and Storefront a `*-direct-proxy` while giving Customer only the app-key service. ADR-0013's "undocumented" claim is **softened**: it is a README-documented option in that published first-party package, better attested than "known only from Hydrogen's source."

**The nightly cross-checks the fixture against Shopify's published schema.** This is the only tier-drift detector available, and it guards the failure ADR-0013 says nothing can currently detect. Its transport is unverified — the published schema reached us through Shopify's MCP validator, and `CLAUDE.md` notes interactively-authenticated MCP servers may be absent in headless runs — and is part of the same research ticket as the source question above. No committed fixture regeneration is needed for this check, so it needs no key.

**ADR-0013's rejected fallback is now the decision, and the difference is mechanism.** That ADR rejected "serving solidifront's committed fixture as the consumer's schema" as _"precisely the vendored-schema staleness this ADR exists to end."_ The objection was sound against a Hydrogen file vendored by URL with no automation. It does not transfer to a fixture minted per-version from the live service and diffed nightly against Shopify's published schema.

**Unverified:** whether the runtime honours the consumer's `customer-account-api:full` grant or the standard tier. CAAPI authenticates _before_ it validates — a bogus token returns an identical `401 Invalid token. Decode Error.` for a valid field, a nonexistent field and a syntax error alike — so this cannot be probed without a real customer login. It is parked as an L5 nightly assertion behind the map's **Nightly (L5) infrastructure** prerequisites. Its stakes are much reduced: the fields in question are undocumented, so rejecting them at compile time is defensible rather than the worst available failure.

**Unverified:** `storefrontCustomerAccessTokenCreate` was confirmed present at `2025-10` and `2026-07` at the published tier, but not at `2026-01` or `2026-04`. It is also **deprecated as of `2025-01`**, which is a problem for ADR-0011/ADR-0012 rather than for this ADR — see the ticket raised from [#43](https://github.com/KookiKodes/solidifront/issues/43).
