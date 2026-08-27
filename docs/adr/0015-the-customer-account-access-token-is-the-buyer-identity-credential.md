# The Customer Account access token is the buyer identity credential

There is **one** customer credential. The `access_token` a customer session obtains from the Customer Account API's OAuth flow authorizes CAAPI operations **and** identifies the buyer to the Storefront API, passed unchanged as `customerAccessToken`. Solidifront never calls `storefrontCustomerAccessTokenCreate`. Decided in [#45](https://github.com/KookiKodes/solidifront/issues/45); corrects [#17](https://github.com/KookiKodes/solidifront/issues/17), and with it [ADR-0011](./0011-customer-sessions-refresh-at-the-request-boundary.md) and [ADR-0012](./0012-customer-authentication-is-a-requirement-not-an-argument.md).

#17 recorded the opposite as its verified finding: that `BuyerInput.customerAccessToken` took a _different_ credential — a storefront customer access token minted by the CAAPI mutation `storefrontCustomerAccessTokenCreate` — so a customer session held a **fourth** token and a refresh cost **two** round trips. That is refuted.

## What was actually read, and why it was wrong

#17 read the field description from `packages/codegen/storefront.schema.json`:

> The **storefront** customer access token retrieved from the [Customer Accounts API](https://shopify.dev/docs/api/customer/reference/mutations/storefrontCustomerAccessTokenCreate).

That file is **374 types** with no `visitorConsent` types, so it predates `2025-10` and describes no version solidifront supports. It is one of the artifacts the restructure replaces.

Every supported version says something else, and they all say the same thing:

> The customer access token retrieved from the [Customer Accounts API](https://shopify.dev/docs/api/customer#step-obtain-access-token).

Byte-identical at `2025-10`, `2026-01`, `2026-04`, `2026-07`, `2026-10` and `unstable`. The qualifier "storefront" is gone and the link now points at the **OAuth token step** rather than at the mutation. Shopify rewrote a docstring and a link target; nothing about the runtime changed under us.

## Why the documentation settles it without a store

Four first-party sources, from different pipelines, agree — and a fifth has already shipped the migration.

The [deprecation changelog](https://shopify.dev/changelog/deprecation-of-storefrontcustomeraccesstokencreate-mutation), dated `2025-01`, states the mechanism outright: the exchange "is no longer necessary," the Storefront API "directly supports Access Tokens from the Customer Accounts API via the `@inContext BuyerInput#customerAccessToken`," and the migration path is to obtain an OAuth token and "use this access token directly with the Storefront API."

[Headless with B2B](https://shopify.dev/docs/storefronts/headless/bring-your-own-stack/b2b), Step 1, is the least ambiguous statement Shopify has published:

> The Customer Accounts `access_token` is one component needed to contextualize Storefront API queries for B2B and set a buyer identity on cart. […] **The `access_token` resulting from this process is used in the step to contextualize product queries and cart, below, where it is referred to as `customerAccessToken`.**

[Authenticate checkouts](https://shopify.dev/docs/storefronts/mobile/checkout-kit/authenticate-checkouts) says the same for the cart path — "pass the `access_token` from the token response as the `customerAccessToken` in the cart's `buyerIdentity`."

And the field descriptions above are a fourth witness, independent of all the prose.

Hydrogen `preview` is the fifth. `storefrontCustomerAccessTokenCreate` appears **nowhere** in `packages/hydrogen/src` except generated type files, and `customer-account/session.ts` holds exactly `access_token`, `refresh_token`, `id_token` and `expiresAt` — three tokens, no fourth. #17 read Hydrogen's _absence_ of buyer identity as evidence that preview lacked a token-exchange grant; the simpler reading is that preview has nothing to exchange.

A live cart mutation with a real CAAPI token would be a sixth witness. It needs a real store and a real customer login, which belongs to the map's **Nightly (L5) infrastructure** prerequisites, and it is a confirmation rather than a gate — the same call [#43](https://github.com/KookiKodes/solidifront/issues/43) made when it retired an unrunnable store test on documentary grounds.

## The mutation is deprecated, not going away

`storefrontCustomerAccessTokenCreate` is **present and deprecated at every CAAPI version, `unstable` included**, carrying an identical deprecation reason unchanged since `2025-01`. Eighteen months deprecated with no removal, and still in the pre-release schema.

So the removal signal [#45](https://github.com/KookiKodes/solidifront/issues/45) went looking for — absence from `unstable`, which under [ADR-0005](./0005-the-api-version-type-is-open-and-narrowed-by-codegen.md)'s positional-classification rule is how solidifront learns a thing is going — is **absent**. That does not weaken this decision; it only means the old design would have kept working, wastefully, for a long time. Codegen will keep emitting the mutation's types from the committed fixture. Solidifront simply never calls it.

## Consequences

**Two injection points, one credential.** The token reaches the Storefront API in two structurally different places: `BuyerInput.customerAccessToken` under the `@inContext` directive, which [ADR-0007](./0007-incontext-is-injected-at-build-time-from-the-pinned-schema.md) injects at build time, and `CartBuyerIdentityInput.customerAccessToken`, which is an ordinary mutation argument on [ADR-0008](./0008-cart-operations-are-one-service-overridden-by-layer.md)'s `CartOperations`. The directive path is covered. The cart path is **not decided here** — see [#47](https://github.com/KookiKodes/solidifront/issues/47).

This is where [ADR-0012](./0012-customer-authentication-is-a-requirement-not-an-argument.md)'s no-raw-accessor rule meets an edge it did not have to survive before. Its argument was that the credential is only ever needed by generated operations, which pick it up from context — sound when the credential was a separate token nobody else touched. Now the same string is a documented input on a mutation a consumer can reasonably want to call by hand. The conclusion is not refuted; the argument has to be re-made against a case it did not anticipate, which is #47's job.

**A refresh costs one round trip.** Not two. The token endpoint, and nothing after it. [ADR-0011](./0011-customer-sessions-refresh-at-the-request-boundary.md)'s conclusion that `/account/refresh` should not exist is unaffected — it rests on [#27](https://github.com/KookiKodes/solidifront/issues/27)'s shell-flush commit, not on the cost — but the figure fed its latency-budget reasoning and roughly halves. [#40](https://github.com/KookiKodes/solidifront/issues/40) should weigh single-flight against the corrected number.

**The session holds three tokens.** `access_token`, `refresh_token`, `id_token`. [#41](https://github.com/KookiKodes/solidifront/issues/41) measures whether that fits the 4096-byte cookie ceiling under [ADR-0012](./0012-customer-authentication-is-a-requirement-not-an-argument.md)'s two-`__Host-`-cookie layout. One fewer token is not the same as fitting — the JWT `id_token` is the bulky one and has not shrunk — so the layout is **re-derived from three, not trimmed from four**.

**Nothing keyed the exchanged token's renewal, and now nothing has to.** #17's sharpest observation about the old design was that `StorefrontCustomerAccessTokenCreatePayload` carries no expiry field, so the exchanged token's lifetime was unobservable and coupling it to the refresh cycle was the only available signal. That entire hazard is gone with the exchange.

**Marking a response personalized only when a session exists is now load-bearing.** [ADR-0012](./0012-customer-authentication-is-a-requirement-not-an-argument.md) adopted this as a cacheability optimization, safe "on the only axis that matters." Under direct injection it is stronger than that. Whenever a session exists, the buyer is on the `@inContext` directive and the response is genuinely buyer-specific — Shopify's B2B guide warns that contextualized responses carry personalized pricing and catalog data and that caching them can serve one customer's prices to another. So the rule is not a heuristic that happens to be safe; it is the correctness condition, and the anonymous path stays cacheable precisely because no buyer is injected on it. Recorded here because a rule kept for a reason that no longer holds is one refactor from being optimized away.

**Welding no longer rests on the mutation.** [#34](https://github.com/KookiKodes/solidifront/issues/34) argued the CAAPI version welds safely to the single Storefront pin partly because `storefrontCustomerAccessTokenCreate` is present in every supported version, so welding never dangles. Solidifront does not call it, so its presence carries no weight either way — and [#44](https://github.com/KookiKodes/solidifront/issues/44) already replaced per-version probing with `shopify.dev/api-versions.json`, where `storefront.available` and `customer.available` are identical lists from one first-party file. Welding is **strengthened**: it lost a leg it was not standing on and gained a better one. See [ADR-0014](./0014-the-customer-account-schema-is-a-committed-standard-tier-fixture.md).

**A committed schema fixture is a dated claim about the API.** This refutation cost nothing to find and eighteen months to notice, because a stale schema states its wrong answer with exactly the confidence of a fresh one. [ADR-0014](./0014-the-customer-account-schema-is-a-committed-standard-tier-fixture.md) already commits solidifront to per-version fixtures and [#29](https://github.com/KookiKodes/solidifront/issues/29) to nightly drift detection; this is the failure mode both exist to prevent, observed once for real.
