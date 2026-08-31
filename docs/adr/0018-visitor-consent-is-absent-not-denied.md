# Visitor consent is absent, not denied

Before a visitor has made a privacy choice, `RequestContext.visitorConsent` is **`null`** and the `@inContext(visitorConsent:)` argument goes out absent — not as four explicit `false`s. The fail-closed deviation [#24](https://github.com/KookiKodes/solidifront/issues/24) and [#28](https://github.com/KookiKodes/solidifront/issues/28) identified lives **only** in solidifront's own destination gate. Decided in [#18](https://github.com/KookiKodes/solidifront/issues/18), closing the question [ADR-0007](./0007-incontext-is-injected-at-build-time-from-the-pinned-schema.md) left open.

This reads like a contradiction of "fail closed" until you see that the client-side gate and the server-side `@inContext` argument are different decisions with different information behind them.

## Why `null` rather than `false`

`VisitorConsent` is `{analytics, marketing, preferences, saleOfData: Boolean}` — nullable at all six supported versions, plus `metafields: [CustomConsent!]` at `unstable` only. Nullable means **three** states, and most designs quietly collapse that to two.

`shopify-consent.md` §1.2 records why the third one matters. Shopify's own `Allowed` methods "combine several factors missing from the `currentVisitorConsent` method" — specifically **the merchant's settings** (is consent required in this region?) and **the user's location**. Solidifront's middleware can see neither; Shopify can.

So sending explicit `false` for an undecided visitor:

- **overrides Shopify's regional logic with a guess.** Shopify's documented default is already "non-essential purposes are not allowed by default in regions configured to require consent" — a compliant default computed from facts we do not have.
- **claims a decision the visitor never made.** `false` is not "unknown"; it is "declined".
- **suppresses identity on the first page view** — the one that matters most for attribution — because [#24](https://github.com/KookiKodes/solidifront/issues/24) found Shopify suppresses identity server-side on denial, returning mock tracking tokens.
- **makes the pre-consent response differ from the post-consent one on a cache key**, for a visitor who has not changed anything.

`null` hands the decision to the party holding the facts. That is not a weaker choice than `false`; it is the only one of the two that is _true_.

## Where fail-closed does belong

The deviation is real and we keep it — in the browser. `#28` found Shopify's client-side reader **fails open**:

```js
function en(purpose) {
  const consent = $();
  if (!consent || !consent.purposes) return true;   // no consent state ⇒ ALLOWED
  ...
}
```

while `shouldShowBanner()` fails closed — so "no state" means _analytics allowed, no banner_. Both Hydrogens compensate with their own gate requiring `consentStatus === "loaded"`. That fail-closed half is **Hydrogen's code, not Shopify's library**, and solidifront writes that layer itself.

So: client-side, where the gate is ours and costs nothing, no state means no delivery. Server-side, where the argument is Shopify's to interpret, no state means absent. The two halves point opposite ways _because Shopify's two halves do_, and copying only the one Hydrogen copied would leave the other reproduced by accident.

## The cookie decode

`_tracking_consent` — in [#27](https://github.com/KookiKodes/solidifront/issues/27)'s passthrough prefix allowlist — is **not JSON**. It is a compact dotted string, `"3.AMPS_USWA_f_f_…"`, parsed by `cta-v02.js:483-537` into `{purposes, region, display_banner, sale_of_data_region}`. Two segments, and they divide exactly along this ADR's line:

| Segment         | Holds                                                                                                          | We read it               |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------ |
| leading `3.`    | a **format version**                                                                                           | yes — to detect change   |
| before the dot  | the visitor's **actual interaction** (empty ⇒ all four `NO_VALUE`)                                             | yes — this is the answer |
| `AMPS_USWA_f_f` | Shopify's **already-applied regional inference** (purposes all `true`, region `USWA`, `display_banner: false`) | **no**                   |

Middleware reads the version and the visitor-choice segment and discards the rest. The regional inference is precisely what this ADR declines to override, so ignoring it is not a simplification — it is the decision, expressed in the parser.

**The parser may be partial without being unsafe.** Because `null` is the correct value for "no state", an unknown leading version, a malformed segment and a missing cookie all produce the same correct output. A parser that had to fail _closed_ would need to be complete; this one does not. A dev-only warning fires on an **unrecognised version specifically** — the one signal that Shopify changed the format, and the thing [#29](https://github.com/KookiKodes/solidifront/issues/29) should watch.

`display_banner` and `region` are not read here: they are inputs to a banner solidifront does not ship.

## Consequences

**The server bus delivers only on explicit consent — `null` means no delivery.** Middleware holds strictly less information than the browser does, so the half with less information is the stricter one, which cannot under-protect. The honest cost: in a no-banner region no visitor ever interacts, so `null` is _everyone_ and the server bus delivers nothing there.

**That cost has a known expiry.** `QueryRoot.consentManagement` is live at `unstable` only — absent from `2025-10` through `2026-10`, `isPrivatelyDocumented: false`, so genuinely public rather than an [ADR-0016](./0016-solidifront-ships-only-what-shopify-documents.md) case. It carries `saleOfDataRegions`, the full banner configuration and `cookies.cookieDomain`, which is exactly the regional information middleware lacks. Earliest pinnable version is `2027-01`. Consent **configuration** is therefore a `Layer`-provided value, kept separate from consent **state**, so its arrival is a provider swap rather than an API change — and [#12](https://github.com/KookiKodes/solidifront/issues/12)'s arrival oracle already has the shape to report it.

**This is how Shopify's own script bootstraps, and it explains #27.** [#28](https://github.com/KookiKodes/solidifront/issues/28)'s probe was `POST /api/unstable/graphql.json` carrying exactly that `consentManagement` query, tokenless, `200` on four hosts. That is _why_ #27 made `SFAPI_RE` wider than the configured version: the passthrough must pass `unstable` through for a consent bootstrap our own pinned data path can never make.

**Purpose naming is normalized once, and the polarity is not inverted.** Five spellings exist across surfaces — `sale_of_data`, `saleOfDataAllowed`, `saleOfData`, the pixels-sandbox form, and `s` in the cookie. One `Purpose` type in `core` carries four canonical names with uniform `allowed` semantics; each boundary converts at its own edge. Shopify's documented "inverted polarity" for `sale_of_data` is about how you _ask_ — an opt-out presented as a toggle — not what you store: `saleOfData: true` means "allowed to sell", exactly parallel to `analytics: true` meaning "allowed to track". Since solidifront ships no banner, it never asks, so the inversion never enters the domain. Written down because the docs' phrasing will otherwise make someone model it backwards.

**Consent is three service members, not two.** `bootstrap` (the tokenless read, typed error, retry — [#28](https://github.com/KookiKodes/solidifront/issues/28) requires read and write be distinct, since `setTrackingConsent({headlessStorefront: true})` transmits no purposes at all), `current` (state, a `SubscriptionRef` fed by the `visitorConsentCollected` listener), and `set` (the write). Preview's bootstrap failure mode — buffer forever plus one log line, "compliant but operationally invisible" — is what the typed error exists to prevent.
