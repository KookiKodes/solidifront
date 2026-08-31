# The analytics bus is ours, behind a Shopify compatibility global

Shopify's CDN analytics script binds `window.Shopify.analytics` on first load and **never re-binds**, so the object must exist during document parse — before hydration, before any module of ours runs. Solidifront owns the bus as an Effect service in `core` and installs a config-free queueing **stub** into that global from an inline script descriptor; the real bus attaches behind the stub at hydration and drains its queue. One bus, two faces. Decided in [#18](https://github.com/KookiKodes/solidifront/issues/18).

## Why a stub rather than an inlined bus

Hydrogen compiles its bus into an inline IIFE with a bespoke tsdown plugin that JSON-injects config at build time. Inlining ours the same way would give `@solidifront/vite` a new capability class — bundling a browser artifact — well beyond the "emit modules, guard resolve ids" contract [ADR-0004](./0004-generated-modules-export-a-layer-not-a-runtime.md) settled, and would put Effect in the critical inline path.

The stub avoids all of it because it needs **no configuration**: it queues. It is a string constant in `core`, returned as one `innerHTML` descriptor among the ten script tags, so the vite plugin has no role in this pillar at all.

Rejected outright: not installing the global and emitting Monorail ourselves. `shopify-consent.md` §6.7 records Shopify calling a non-Hydrogen headless analytics build unsupported; reimplementing the transport is the maximal version of that exposure for no gain.

**The queue is a compliance surface, not just a buffer.** It fills before consent state exists, so the gate is applied at **adoption**, never at enqueue — the stub records, the bus decides. That keeps one logical buffer with one gate, rather than a pre-hydration channel that has quietly bypassed the rules.

## The global is Shopify's contract; it is not our API

The stub exposes Shopify's five members verbatim from its first byte — `publish`, `subscribe`, `addDestination`, `destroy`, `getConfig` — because the CDN script may read any of them and we do not know which.

Solidifront's own surface is **`publish`, a destination `Layer`, and the consent service. Nothing else.**

**`subscribe` is deliberately absent from our API.** The bus is consent-agnostic by design — only destinations are gated — so a raw `subscribe` is an ungated feed of every event, and `shopify-domain.md` §5.5 warns in as many words not to assume it is safe for third-party forwarding. Removing it makes the gate unbypassable by construction rather than by documentation, and it is the concrete form of [#24](https://github.com/KookiKodes/solidifront/issues/24)'s demand that "destination" be defined against "subscriber": a **subscriber** is what Shopify's script is, a **destination** is what a consumer registers. A consumer who wants the raw feed registers a destination declaring the purposes it needs, which is the honest version of the same request.

`destroy` and `getConfig` exist because Shopify names them. Our teardown is the `Layer`'s `Scope` closing, so `destroy` is never the documented way to stop the bus.

## The gate is per-purpose, declared by the destination

Both Hydrogens gate solely on `analytics`; `saleOfDataAllowed` appears in classic only as a stamped payload field. `shopify-consent.md` open question #3 names the consequence: a visitor who grants analytics but denies sale-of-data is, at this layer, indistinguishable from one who granted everything.

A destination declares the purposes it needs. Shopify's own declares `["analytics"]` — byte-for-byte Hydrogen's behaviour, so no inherited risk — while a GA4 or Meta destination declares `["analytics", "marketing"]`. The gate becomes a predicate over a record instead of a boolean, which is nearly free and closes a documented gap rather than reproducing it.

Preview's per-destination replay cursor is kept: a late-registered destination receives history rather than nothing, which is strictly better than classic's ready-gate.

**Ring size is configurable; wipe-on-denial is not.** The cap is a memory bound and earns configuration. The wipe is a compliance property, and a switch whose only use is retaining events a visitor explicitly refused is a footgun — the same reasoning [ADR-0016](./0016-solidifront-ships-only-what-shopify-documents.md) used to keep undocumented operations out. Don't ship the capability and the misuse is unreachable. This is a deliberate deviation from `shopify-consent.md` §8.5, which recommends configuring both.

## The eight names are closed; the event map is open

The eight event names are Shopify's wire contract and cannot be extended or renamed. There is **no checkout event** — checkout is off-domain, already a scope rule under `CONTEXT.md`'s **Cart**.

Consumer events enter through an augmentable registry interface — the third instance of an idiom this codebase has settled, after [ADR-0005](./0005-the-api-version-type-is-open-and-narrowed-by-codegen.md)'s `ApiVersionRegistry` and [ADR-0006](./0006-an-operation-is-a-generated-module-not-a-string.md)'s `StorefrontQueries`. Consumer events ride the same buffer and the same gate, and reach Shopify's destination not at all — because that destination subscribes by name, so absence is automatic rather than enforced.

Rejected: classic's `custom_${string}`, which is untyped, and a second channel for consumer events, which `shopify-consent.md` §8.3 warns against on the grounds that two channels already exist.

Payloads are **plain TypeScript types, not Effect `Schema`s.** An analytics payload is produced by the consumer's own code, not received from a versioned untrusted wire, which is the entire reason [#35](https://github.com/KookiKodes/solidifront/issues/35)'s decode exists. One narrow exception: a dev-only shape assertion on the eight known payloads, because `AnalyticsCart` accepts both connection shapes and preview reads `cart.lines.nodes` directly — the one error a type cannot catch when the data came from a generated operation.

## Who publishes what

**The library publishes the three cart events, from the settled operation — never from observing the cart store.** Observing the optimistic store means publishing `product_added_to_cart` before Shopify confirms, with no retraction if the mutation fails; that is exactly what preview's `hasPendingCartWork` suppression exists to prevent. Publishing from the settled operation deletes three mechanisms at once: `hasPendingCartWork` has no successor, preview's three-layer dedupe is unnecessary because the operation runs once behind [ADR-0008](./0008-cart-operations-are-one-service-overridden-by-layer.md)'s keyed mutex, and its increase/decrease/disappeared line branching goes with it because the operation **knows which mutation ran**. Preview's un-namespaced cross-tab `localStorage` key disappears for a structural reason rather than a better bug fix.

Accepted cost: a cart changed in another tab produces no events here. That is arguably correct, since the alternative is the double-counting the `localStorage` key was fighting.

**The consumer publishes all five view events, `page_viewed` included.** Automatic pageviews would need either a `@solidjs/router` peer — which ADR-0008 ruled out — or Hydrogen's `history.pushState` monkey-patch, which `shopify-domain.md` §5.7 flags as interacting with Solid Router's own history handling. Solidifront ships one primitive per view event in `ui`, on [#30](https://github.com/KookiKodes/solidifront/issues/30)'s **client-only** boundary, plus a dev-only warning when no `page_viewed` has been published shortly after first mount.

## Two buses, one vocabulary

A **browser bus** (Shopify's destination plus consumer browser destinations) and a **server bus** (consumer server destinations only) speak the same eight names and the same open registry. Destinations are typed by environment, so one cannot be registered on both — which matters because Shopify's own destination is only ever a browser destination, so the accuracy-critical leg cannot double-count by construction.

Server-side sources are the two seams [#13](https://github.com/KookiKodes/solidifront/issues/13) already established: middleware emits `page_viewed` once per document request, and cart operations emit the three cart events. The server sees requests and mutations and nothing else, so that set is naturally complete.

**No cross-bus dedup.** A server-originated `page_viewed` and a browser-originated one are declared _two observations_, not one event seen twice. [#37](https://github.com/KookiKodes/solidifront/issues/37)'s mechanism cannot reconcile them — it keys on `createUniqueId()` inside Solid's owner tree, and middleware has no owner — so unifying them needs a key that does not yet exist, and #37's own near-miss is evidence that this class of mechanism earns a prototype before it earns trust.

**No analytics primitive uses a server effect phase.** Server events originate in Effect code — middleware and operations — not in a Solid effect phase, so this pillar pays none of #30's costs: no double-fire, no `createRenderEffect` TTFB hold, and no use of #37's dedup at all. #19 inherits the sole remaining use of it.

## Consequences

**One unverified assumption, and it is load-bearing:** whether Shopify's CDN analytics script tolerates stub-then-adopt. Preview _throws_ if `window.Shopify.analytics` already exists, which suggests the script may assume it owns the global. Raised as [#51](https://github.com/KookiKodes/solidifront/issues/51).

**The DOM Standard Events channel is a separate concept and we gate it anyway.** `page-view.ts:42` dispatches a `CustomEvent` via a dynamically imported `standard-events.js` — a second channel Hydrogen leaves ungated. Shopify's web pixels listen to it, so it is a transmission path despite looking like a DOM event, and our gate is the only one we control. A deliberate deviation, flagged for L5 verification because it is the one place gating could break behaviour Shopify expects.

**Script tags are a pure descriptor function in `core`, plus an optional `ui` component.** Order is load-bearing across ten descriptors with two "must immediately follow" constraints, so one list owns it. Explicitly not a vite-plugin HTML transform: `shopId`, `storefrontId` and the banner mode are runtime config, and ADR-0004 already ruled that config is never written into generated code.

**Banner mode is required, with no default.** Preview's code default of `"no-banner"` contradicts its own documentation. Solidifront cannot see the merchant's regional configuration, so it cannot know whether a banner is required, and unlike the `@inContext` case there is no third party to defer to — the choice is which script to _load_. A default here is a silent compliance decision made by a library on a merchant's behalf.

**Identity values are stored in the strict form and converted at the lenient boundary.** `shopId` is the numeric string, validated `/^\d+$/` once at config decode and GID-prefixed at the analytics boundary, because the Customer Account API rejects anything else. `storefrontId` is optional with **no `"0"` sentinel in our types** — a sentinel in a domain type is a lie, and PerfKit already loads only when it is truthy, so absent means PerfKit off. All three, `myshopifyDomain` included, are configured rather than derived, per ADR-0005's fail-loudly-on-a-cold-clone rule. This retires #18's open question about what `storefrontId: "0"` observably affects: nothing, because we never send it.
