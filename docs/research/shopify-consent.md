# Consent for headless Shopify analytics, and where the two Hydrogens diverge

Primary-source research for [issue #24](https://github.com/KookiKodes/solidifront/issues/24). Feeds
[#18 Analytics and consent](https://github.com/KookiKodes/solidifront/issues/18). Carried forward from
`docs/research/README.md` § "Carried-forward unknowns" #6.

## Provenance

| Fact | Value |
| --- | --- |
| Research date | 2026-08-14 |
| Status | Complete for the question asked; 9 open questions below, 3 of them compliance-relevant |
| **preview** submodule HEAD | `50b787462eae26b1a57664b16349b616ebaf2141` — `2026-08-14 18:27:12 +0100`, "Fix optimistic cart line ordering (#3951)" |
| **preview** package | `@shopify/hydrogen` `2026.10.0-preview.0` — `references/hydrogen/packages/hydrogen/package.json:3` |
| **classic** commit | `Shopify/hydrogen@main` `2a2738ba20487ccc07006815fe40e93b24cb5f08` — `2026-08-14T15:12:50Z`, read via `gh api` |
| **classic** package | `@shopify/hydrogen` `2026.4.5`; `@shopify/hydrogen-react` `2026.4.3` |
| Consent library both lines load | `consent-tracking-api` **v0.2** |
| Consent library the public docs describe | **v0.1** — https://shopify.dev/docs/api/customer-privacy |

Paths prefixed `preview:` are relative to
`/home/kookikodes/dev/solid-js/solidifront/references/hydrogen/packages/hydrogen/`.
Paths prefixed `classic:` are relative to `Shopify/hydrogen@main` at the SHA above and were read through the
GitHub API, not from a local checkout.

This document supersedes and extends `docs/research/shopify-domain.md` §5.6, §5.9 and §7.3, which flagged the
classic/preview consent split as unresolved. §7.3 there is now **resolved** — see §4 and §9.1 below.

---

## 0. The answer, in brief

**0.1 — The crux. Shopify's model does *not* have one answer; the two Hydrogens implement opposite ones.**

| | pre-consent events | on consent grant | on consent denial |
| --- | --- | --- | --- |
| **classic** | **dropped at the publisher** — `publish` is swapped for a no-op | nothing is replayed; view events happen to re-fire because a React effect re-runs | nothing to clear |
| **preview** | **recorded and buffered** (500-entry ring) — live subscribers still receive them | buffer replayed to every destination, per-destination cursor | buffer wiped, recording stops |

Neither behaviour is configurable in either line. Classic exposes a `canTrack` override that changes *when* the
gate opens, not *what happens to* gated events. Preview exposes nothing.

**0.2 — Verdict on the project term.** `CONTEXT.md:51-53` fixes **Consent** as *"the visitor's privacy choice,
which gates where analytics events are allowed to go. It gates destinations, not the recording of events."*

That definition is **accurate for Hydrogen preview and false for Hydrogen classic**, and it is **not a claim
Shopify's own documentation makes anywhere** (§5.3). Preview's own agent skill states the model in almost the
same words — "Raw subscribers can observe events before consent; destinations receive only consent-allowed
replay" (`preview:skills/hydrogen-analytics/SKILL.md:69`) — so the term is implementable and matches where
Shopify's active line is going. Two amendments are needed before it is safe to rely on:

1. **It is only true of the client-side library layer.** Shopify's *servers* suppress identity at source when
   consent is denied: the Storefront API returns mock tracking tokens
   (`00000000-0000-0000-5000-000000000000`) and withholds the `_shopify_analytics` / `_shopify_marketing`
   cookies (§6.4). No storefront-side buffering decision can undo that. An event recorded pre-consent and
   replayed post-consent carries whatever identity existed at *replay* time, not at record time.
2. **"Destinations" must be a term of art, not a synonym for "subscribers."** In preview the distinction is
   load-bearing and mechanical: `subscribe()` is live-only and consent-agnostic; `addDestination()` is
   consent-gated and replayed. If solidifront keeps the definition, it must also fix a second term for the
   ungated live channel, or the definition promises something the API does not distinguish.

Recommendation: keep the term, add "at the storefront library layer" and define the destination/subscriber
split explicitly. If solidifront instead follows classic's model, the definition must change outright.

**0.3 — What is actually mandatory** for Shopify's own analytics to attribute a headless storefront is short,
and solidifront currently satisfies none of it (§6). One item is a hard prerequisite that is easy to miss: a
**same-origin Storefront API proxy**, without which the modern http-only cookies cannot be set at all.

**0.4 — A deadline that has already passed.** Shopify stated `shopify_y` / `shopify_s` would stop being set on
**April 30, 2026** — 3½ months before this research date
(https://shopify.dev/docs/storefronts/headless/hydrogen/migrate/cookies). Any solidifront design that names
those cookies is designing against a substrate Shopify says it no longer maintains. `[UNVERIFIED against a
live store — the deprecation is documented, its enforcement was not tested.]`

---

## 1. The Customer Privacy API — Shopify's own contract

Everything in this section is from https://shopify.dev/docs/api/customer-privacy unless stated. Both Hydrogens
are clients of this API; it is the only part of the stack Shopify actually specifies.

### 1.1 Four consent purposes, four naming conventions

The purposes are `analytics`, `marketing`, `preferences`, `sale_of_data`. Verbatim:

> "The following consent purposes are supported: `Preferences`: Cookies that remember customer preferences,
> such as country or language… `Analytics`: Cookies to understand how customers interact with the site.
> `Marketing`: Cookies to provide ads and marketing communications based on customer interests."

The same four signals are spelled four different ways depending on which surface you touch:

| Surface | Spelling |
| --- | --- |
| `setTrackingConsent({...})` | `analytics`, `marketing`, `preferences`, `sale_of_data` |
| `currentVisitorConsent()` return | same four keys, values `'yes' \| 'no' \| ''` |
| `visitorConsentCollected` event `detail` | `analyticsAllowed`, `marketingAllowed`, `preferencesAllowed`, `saleOfDataAllowed` |
| predicate methods | `analyticsProcessingAllowed()`, `marketingAllowed()`, `preferencesProcessingAllowed()`, `saleOfDataAllowed()` |
| Web Pixels sandbox object | `analyticsProcessingAllowed`, `marketingAllowed`, `preferencesProcessingAllowed`, `saleOfDataAllowed` — https://shopify.dev/docs/api/web-pixels-api/standard-api/customerprivacy |

A normalizing layer in solidifront is not gold-plating; it is the minimum needed to keep call sites honest.

**`sale_of_data` has inverted polarity** and is the one purpose that is not a straightforward opt-in:

> "Data sale opt-outs should be initiated by the customer, not presented immediately with a banner. For this
> reason, `true` allows data sale / sharing and `false` blocks data sale / sharing when requested by a
> customer."

> "Data sale / sharing opt-out is enforced independently from consent, and caution is advised when combining
> them."

> "The GPC signal is automatically collected and honored in regions configured for data sale opt-out and cannot
> be adjusted through `setTrackingConsent`."

**Partial consent is explicitly supported** — "You can set one or more consent signals at once"; setting only
`{analytics: true}` yields `{marketing: '', analytics: 'yes', preferences: '', sale_of_data: ''}`.

### 1.2 Reading consent

Two families, and the docs are emphatic that they are not interchangeable:

> "Check users' consent decisions by calling the `currentVisitorConsent` method. This returns the preferences
> selected by the users and **doesn't include critical information like location and merchant configuration**."

> "**Note:** Use the `Allowed` methods to check what processing is allowed. They combine several factors
> missing from the `currentVisitorConsent` method."

> "These methods combine the following factors to determine what processing is allowed: **The current merchant
> settings**: Is consent required in this region? **User location**: Is the customer in a region where consent
> is required? **User consent given**: Did the customer give consent for a specific purpose?"

Current: `analyticsProcessingAllowed()`, `marketingAllowed()`, `preferencesProcessingAllowed()`,
`saleOfDataAllowed()`, `currentVisitorConsent()`, `shouldShowBanner()`, `getRegion()`, `consentId()`,
`saleOfDataRegion()`, `getTrackingConsentMetafield(key)`.

Legacy, under a "Do not begin any new integrations" warning: `userCanBeTracked()`, `shouldShowGDPRBanner()` (→
`shouldShowBanner()`), `shouldShowCCPABanner()` (→ `saleOfDataRegion()`).

`shouldShowBanner()` is not a consent read:

> "The method doesn't indicate if consent has already been given… This is `true` if consent isn't already set
> and the visitor is in a region showing consent."

**`getTrackingConsent()` does not appear anywhere in the documentation** — see §9.4.

### 1.3 Writing consent, and the headless parameters

> "For custom storefronts, pass the following additional parameters to the `setTrackingConsent` method:
> `headlessStorefront`: `true`, `checkoutRootDomain`: Your checkout domain, `storefrontRootDomain`: Your
> storefront domain, `storefrontAccessToken`: Your Storefront API access token"

Documented reason the token is needed:

> "**Storefront API token** — Our consent API will contact Shopify servers to manage consent using the
> Storefront API which needs a Storefront API token."

Callback error shape is `{error: [string]}`.

**A hard cross-domain constraint, stated as a failure mode rather than a recommendation:**

> "Your checkout should be within the same root domain as the storefront so that it can read cookies set on the
> storefront domain - otherwise checkout will not be able to read and respect visitor consent given on your
> storefront."

> "If your storefront is hosted on `hydrogen.shop` and the checkout is on `example.com`, consent management
> will **not** be honored on checkout, as cookies cannot be read across domains."

### 1.4 Loading the browser script

Two mutually exclusive bundles — the banner bundle supersedes the bare API:

> "* [Customer Privacy API](https://cdn.shopify.com/shopifycloud/consent-tracking-api/v0.1/consent-tracking-api.js)
> * [Customer Privacy API bundled with the Shopify Cookie Banner](https://cdn.shopify.com/shopifycloud/privacy-banner/storefront-banner.js)"

On a Shopify-hosted theme the loader is `Shopify.loadFeatures`:

> "To use the Customer Privacy API, you must load it using `loadFeatures`… The second argument to
> `loadFeatures` is a callback that indicates that the API has loaded. When invoked without an error, the API
> is globally available at `window.Shopify.customerPrivacy`."

Neither Hydrogen uses `loadFeatures`; both inject the CDN `<script>` directly (§2.2, §3.2).

Stated requirements for a headless integration:

> "To integrate into a custom storefront, you need to load the correct JavaScript asset, pass additional
> parameters, and update the storefront's content security policy."

> "The Customer Privacy API (and the Shopify Cookie banner if used) will `POST` to the Storefront API at the
> checkout domain. This domain needs to be allowed in your Content Security Policy."

The change signal is a DOM event on `document`:

> "The Customer Privacy API publishes the document event `visitorConsentCollected` when consent changes…
> **Updates are published only when consent changes, not when the listener is added.**"

That last clause matters: there is no "current state" event to subscribe to, which is exactly why both
Hydrogens carry their own readiness machinery.

**A caveat that names solidifront's situation directly:**

> "**Note:** Full integration of the cookie banner with Shopify Analytics is only available using the
> [Hydrogen Analytics](https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/consent) package, and
> not the method described in this section."

### 1.5 Defaults before consent is collected

The load-bearing paragraph, quoted in full:

> "The default permissions state depends on how merchants have configured their privacy settings. **For regions
> that are configured to require consent, non-essential purposes are not allowed by default until consent is
> given. For other regions, the default behavior is to allow all processing purposes.**"

So the pre-consent default is **merchant- and region-dependent, decided by Shopify's servers, not by the
storefront**. Hydrogen preview's own e2e suite is built around exactly this: it maintains four separate test
stores — `defaultConsentAllowed_cookiesEnabled`, `defaultConsentDisallowed_cookiesEnabled`, and the two
`cookiesDisabled` variants (`preview:examples/hydrogen/e2e/fixtures/index.ts:105-113`) — because the default
cannot be set from code.

The legacy section documents the opposite of a fail-closed default, and is worth knowing precisely so it is
never copied:

> "If the Customer Privacy API isn't available, then tracking and data emission can proceed. All methods should
> be preceded with a check that the API is available before checking that tracking or sale of data is blocked."

Both Hydrogens ignore this and fail **closed** (§2.3, §3.3). That is a deliberate deviation from Shopify's
legacy guidance in the safe direction.

### 1.6 The privacy banner

> `<script src="https://cdn.shopify.com/shopifycloud/privacy-banner/storefront-banner.js"></script>`

> "When using the Shopify Cookie banner, initialize the banner with the following configuration (this will
> automatically pass consent to the Customer Privacy API)" — `privacyBanner.loadBanner({storefrontAccessToken,
> checkoutRootDomain, storefrontRootDomain, locale?, country?})`, returning a Promise.

`privacyBanner.showPreferences()` re-opens the preferences modal, also Promise-returning.

Which regions it appears in is an **admin setting**, not a code setting:

> "From your Shopify admin, go to **Settings > Customer Privacy > Cookie banner**. Select the regions where
> your banner should display." — https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/consent

### 1.7 Web pixels — a separate, differently-shaped gate

https://shopify.dev/docs/api/web-pixels-api/pixel-privacy. Consent gates whether a pixel **loads at all**,
declared in config and enforced by Shopify:

> "When creating app pixels, you can define the customer privacy settings that your pixel requires within your
> `shopify.extension.toml` file. **Shopify's pixel manager will only load your pixel if there is visitor
> permission for all of the settings that your pixels declares as required.**"

`analytics.subscribe` itself has no documented consent coupling; a pixel that declares no requirements receives
events regardless and must gate itself. Whether a late-loading pixel receives pre-consent events is **not
stated** — §9.5.

---

## 2. Hydrogen **classic** (`Shopify/hydrogen@main`, `2026.4.5`)

### 2.1 Configuration surface

`classic:packages/hydrogen/src/analytics-manager/AnalyticsProvider.tsx:59-68`:

```ts
export type Consent = Partial<
  Pick<
    CustomerPrivacyApiProps,
    | 'checkoutDomain'
    | 'sameDomainForStorefrontApi'
    | 'storefrontAccessToken'
    | 'withPrivacyBanner'
    | 'country'
  >
> & {language?: LanguageCode}; // the privacyBanner SDKs refers to "language" as "locale" :(
```

Passed as `<Analytics.Provider consent={...} cart={} shop={} canTrack?={} customData?={} cookieDomain?={}>`.

**Every field is optional at the type level; requirements are enforced only at runtime, and only as
`console.error` — never a throw** (`AnalyticsProvider.tsx:316-353`):

```ts
if (!consent.checkoutDomain) {
  const errorMsg = messageOnError('consent.checkoutDomain', 'PUBLIC_CHECKOUT_DOMAIN');
  errorOnce(errorMsg);
}
if (!consent.storefrontAccessToken) { /* …'PUBLIC_STOREFRONT_API_TOKEN'… */ }
if (!consent?.country)  { consent.country = 'US'; }
if (!consent?.language) { consent.language = 'EN'; }
if (consent.withPrivacyBanner === undefined) { consent.withPrivacyBanner = false; }
```

Defaults: `country: 'US'`, `language: 'EN'`, `withPrivacyBanner: false`. `sameDomainForStorefrontApi` falls
back to `isSfapiProxyEnabled()` (`classic:src/customer-privacy/ShopifyCustomerPrivacy.tsx:149-152`), detected
from a `_sfapi_proxy` Server-Timing header on the navigation entry.

Two observations worth carrying into a solidifront design:

- The provider **mutates the caller's `consent` object in place during render** (`:342`, `:346`, `:350`).
- **The JSDoc is wrong about the most compliance-relevant default.** `ShopifyCustomerPrivacy.tsx:106` says
  `withPrivacyBanner` "Defaults to true"; both `:138` and `AnalyticsProvider.tsx:350` default it to **false**.
  The published reference repeats the wrong value —
  https://shopify.dev/docs/api/hydrogen/latest/hooks/usecustomerprivacy says "Defaults to true." The skeleton
  template ships `withPrivacyBanner: false`; the shopify.dev example ships `true`. A merchant following the
  docs and omitting the flag gets **no banner**.

A `disableThrowOnError?: boolean` prop is declared `@deprecated` at `:84-85` but is never destructured or
referenced — inert.

### 2.2 Script loading

`classic:src/customer-privacy/ShopifyCustomerPrivacy.tsx:123-126, 176-180`:

```ts
export const CONSENT_API =
  'https://cdn.shopify.com/shopifycloud/consent-tracking-api/v0.2/consent-tracking-api.js';
export const CONSENT_API_WITH_BANNER =
  'https://cdn.shopify.com/shopifycloud/privacy-banner/storefront-banner.js';

useLoadScript(withPrivacyBanner ? CONSENT_API_WITH_BANNER : CONSENT_API, {
  attributes: { id: 'customer-privacy-api' },
});
```

Note **v0.2**, against v0.1 in the public docs. Injected into `document.body`
(`classic:packages/hydrogen-react/src/load-script.tsx:22-53`).

Readiness is deliberately *not* the script's load event (`:173-175`):

> "// NOTE: We no longer use the status because we need `ready` to be not when the script is loaded
> // but instead when both `privacyBanner` (optional) and customerPrivacy are loaded in the window"

Instead, `Object.defineProperty` interceptors on `window.privacyBanner` (`:295-332`) and
`window.Shopify.customerPrivacy` (`:336-410`) fire when the CDN assigns them; only when all expected APIs are
present does `:412-438` call `privacyBanner.loadBanner(config)`, dispatch a `shopifyCustomerPrivacyApiLoaded`
DOM event, and invoke `onReady?.()`.

**Failure mode is silent and total.** `useLoadScript`'s return value is discarded, so an `'error'` status is
swallowed. If the script never loads, `onReady` never fires, `ShopifyAnalytics`'s register never reports ready,
and **the entire bus stays blocked for the page lifetime**. There is no timeout, no fallback, and no error
surfaced to the app.

### 2.3 `canTrack()` before consent

`AnalyticsProvider.tsx:118-129` seeds the context with `canTrack: () => false`. The live default
(`:283-290`):

```ts
function shopifyCanTrack(): boolean {
  try {
    return window.Shopify.customerPrivacy?.analyticsProcessingAllowed?.() ?? false;
  } catch (e) {}
  return false;
}
```

Before the CDN script lands, `window.Shopify` is undefined, the access throws, and the result is `false`.
Fail-closed.

### 2.4 What happens to events published before consent — **dropped**

The decisive line is `AnalyticsProvider.tsx:355-366`:

```ts
const value = useMemo<AnalyticsContextValue>(() => {
  return {
    canTrack,
    ...carts,
    customData,
    publish: canTrack() ? publish : () => {},
```

When `canTrack()` is false, **the `publish` handed to every consumer is a no-op closure**. The payload never
enters the bus. Nothing records it; nothing replays it.

There *is* a queue in classic, but it gates on subscriber registration, not consent (`:198`, `:232-239`,
`:260-277`): `publish` parks payloads in `waitForReadyQueue` until every `register(key)` has called `ready()`,
then flushes. Two details make it unsuitable as a consent buffer even in principle:

- It is a **`Map` keyed by event name**, so only the last payload per event type survives — N
  `product_added_to_cart` events collapse to one.
- It sits *downstream* of the no-op swap, so nothing gated by consent ever reaches it.

The de-facto "replay" in classic is a React re-render, not a buffer. `AnalyticsView.tsx:171-181` lists
`publish` in its dependency array:

```ts
useEffect(() => {
  if (!shop?.shopId) return;
  viewPayload = { ...viewPayload, url: window.location.href };
  publish(type, viewPayload);
}, [publish, url, shop?.shopId]);
```

When consent resolves, `publish` swaps identity, the effect re-fires, and the *view* events are re-derived.
**Cart events are not recovered.** `CartAnalytics.tsx:57-147` has the same deps but is short-circuited on the
second pass by its own idempotence guards — `if (cart?.updatedAt === prevCart?.updatedAt) return;` (`:59`), a
`localStorage.cartLastUpdatedAt` check (`:61-74`), and decisively `if (cart.updatedAt === lastEventId.current)
return;` (`:86`), which the no-op pass already set at `:87`. **A cart mutation that happens before consent
resolves is lost.**

### 2.5 Consent gates recording, not destinations

In classic the single gate is `publish: canTrack() ? publish : () => {}`. Every consumer receives the same
neutered function; `publishEvent` (`:241-258`) performs no consent check of its own. There is no per-subscriber
consent metadata, no consent category on `subscribe()`, and no way to register a subscriber that receives
unconsented events. **An unconsented event reaches no subscriber at all — Shopify or third-party.**

Shopify's own destination is double-gated: `classic:packages/hydrogen-react/src/analytics.ts:33-34` also
refuses on `if (!payload.hasUserConsent) return Promise.resolve();`, where `hasUserConsent` is stamped from
`analyticsProcessingAllowed()` at `ShopifyAnalytics.tsx:152-153, 176-186` alongside
`analyticsAllowed`/`marketingAllowed`/`saleOfDataAllowed`/`ccpaEnforced`/`gdprEnforced`. Confirmed in the
public reference: "If `event.payload.hasUserConsent` is false, no analytics event will happen." —
https://shopify.dev/docs/api/hydrogen-react/latest/utilities/sendshopifyanalytics

Cookies are handled separately and **actively deleted** without consent —
`classic:packages/hydrogen-react/src/useShopifyCookies.tsx:136-139` calls `setCookie(SHOPIFY_Y, '', 0, …)`.
`hasUserConsent` is seeded `true` until `privacyReady` specifically to avoid premature deletion
(`ShopifyAnalytics.tsx:93-98`: `// must be initialized with true to avoid removing cookies too early`).

### 2.6 Events classic sends to Shopify

The bus defines nine names (`classic:src/analytics-manager/events.ts:1-16`) — the eight preview also has, plus
`custom_${string}`. **Only five are forwarded to Shopify** (`ShopifyAnalytics.tsx:111-125`): `page_viewed`,
`product_viewed`, `collection_viewed`, `search_viewed`, `product_added_to_cart`. `cart_viewed`, `cart_updated`,
`product_removed_from_cart` and `custom_*` exist only for third-party subscribers.

Transport is **Monorail over `fetch`**, not `Shopify.analytics.publish` — a repo-wide code search for
`Shopify.analytics.publish` on `main` returns zero results. `classic:packages/hydrogen-react/src/analytics.ts:81-137`:

```ts
return fetch(
  shopDomain
    ? `https://${shopDomain}/.well-known/shopify/monorail/unstable/produce_batch`
    : 'https://monorail-edge.shopifysvc.com/unstable/produce_batch',
  {method: 'post', headers: {'content-type': 'text/plain'}, body: JSON.stringify(eventsToBeSent)},
)
```

`page_viewed` maps to `PAGE_VIEW_2` and emits **two** payloads — `trekkiePageView`
(`trekkie_storefront_page_view/1.4`) and `customerPageView2`. "Trekkie" here is a Monorail *schema*, not a
separately loaded script. Lighthouse user-agents are excluded (`analytics.ts:69-72, 85-87`).

PerfKit (`PerfKit.tsx:16-34`) is **deliberately withheld until consent is collected** —
`{!!shop && consentCollected && <PerfKit shop={shop} />}` (`AnalyticsProvider.tsx:399-406`).

### 2.7 Forward-direction signals inside classic

- `AnalyticsProvider.tsx:323-324`: `// TODO: we likely don't need checkout domain if SFAPI proxy is enabled //
  but keep it for backward compatibility for now until we have checkout URL params.`
- `ShopifyCustomerPrivacy.tsx:210-213`: the `storefrontRootDomain` dot-prefix hack exists "so that we keep
  backward compatibility until new cookies are rolled out. Once consent-tracking-api is updated to not rely on
  cookies anymore, we can remove this."
- `:418-425`: the `cachedConsent` poke is "a workaround until consent-tracking-api knows how to read
  server-timing for us."
- `:266-272`: `visitorConsentCollected` fires before user interaction — "The fact that this event has been
  fired before interaction is likely a bug in Privacy Banner SDK. We ignore this event for now." **Preview
  reimplements a fix for this same bug rather than ignoring the event** (§3.4).
- `classic:CHANGELOG.md:74-76` (2026.4.0, a major): "Make Storefront API proxy mandatory and enable backend
  consent mode, supporting the **deprecation of the `_tracking_consent` cookie** in favor of server-set cookies
  via the SF API proxy." `window.Shopify.customerPrivacy.backendConsentEnabled = true` is now pre-installed as
  a stub, and `getCustomerPrivacy()` filters it out until the real API arrives (`:344-374`, `:643-652`).
- `classic:CHANGELOG.md:274-283`: `visitorConsent` on `@inContext` exists for Checkout Kit / non-Hydrogen
  integrations and is explicitly *not* needed when using `Analytics.Provider`.

---

## 3. Hydrogen **preview** (`2026.10.0-preview.0`)

### 3.1 Configuration surface

The entire public consent surface is one optional field — `preview:src/core/analytics/types.ts:22-24`:

```ts
export type ConsentConfig = {
  mode?: "default-banner" | "custom-banner" | "no-banner";
};
```

There is **no `checkoutDomain`, no `storefrontAccessToken`, no `country`/`language`** anywhere in the rewrite.
Passed as `<ShopifyScripts consent={{mode}} shop={} i18n={} analytics={} />`
(`preview:src/react/shopify-scripts.tsx:13-28`) or straight to `getShopifyScriptTags()`.

Documented meaning of each mode (`preview:skills/hydrogen-setup/references/analytics.md:127-131`):

> - `"default-banner"` loads Shopify's hosted privacy banner and waits when the Customer Privacy API says
>   banner interaction is required.
> - `"custom-banner"` loads only the Customer Privacy API and treats the initial consent event as actionable.
>   Your banner must call `setTrackingConsent()` when the shopper accepts or declines.
> - `"no-banner"` loads only the Customer Privacy API and releases analytics after consent setup. Use this
>   only when consent is already allowed or managed outside this storefront.

**The code default and the documented recommendation disagree, in the unsafe direction.**
`preview:src/core/shopify-scripts/consent.ts:7-12` defaults to `mode: consent.mode ?? "no-banner"`, and
`index.ts:152-155` loads the bare consent API unless `mode === "default-banner"` — confirmed by the test
"renders the standalone consent API as an async script when consent is omitted"
(`consent-tracking.test.ts:21-38`). The same skill file then says
(`skills/hydrogen-setup/references/analytics.md:605`):

> "**`mode: "no-banner"` is wrong for any storefront with EU/UK/CA visitors unless consent is handled
> elsewhere.** Without a hosted or custom banner, those visitors have no UI to grant consent — destination
> events never deliver. Default to `mode: "default-banner"` unless you have a custom consent UI that calls
> `setTrackingConsent()`."

So omitting `consent` entirely gives you the mode the docs call wrong. Every shipped template and example
passes `default-banner` explicitly (`preview:examples/shared/config.ts:77-79`,
`templates/react-router/app/lib/shop.ts:49-54`) — except `examples/hydrogen/app/root.tsx:92-94`, which uses
`no-banner`. Solidifront should default to `default-banner`, or require the field.

Minor drift worth not copying: `templates/react-router/app/lib/shop.ts:50-54` passes `country: "US", language:
"EN"` inside the consent object, which `ConsentConfig` does not declare and which the setup skill explicitly
warns against — "Analytics consent config does not accept `country` or `language`"
(`skills/hydrogen-setup/references/analytics.md:26`).

### 3.2 Script loading

`preview:src/core/shopify-scripts/constants.ts:12-13` — the same **v0.2** URLs as classic:

```ts
export const SHOPIFY_CONSENT_API_SCRIPT   = `${SHOPIFY_CDN_ORIGIN}/shopifycloud/consent-tracking-api/v0.2/consent-tracking-api.js`;
export const SHOPIFY_PRIVACY_BANNER_SCRIPT = `${SHOPIFY_CDN_ORIGIN}/shopifycloud/privacy-banner/storefront-banner.js`;
```

Order is load-bearing and enforced by comments in `index.ts:142-172`: the async consent library tag, then the
inline consent bootstrap ("This must run immediately after the consent library tag so it can find that tag and
attach its load listener before consent-tracking-api/privacy-banner executes"), then the inline analytics bus
("This must run after getShopifyConsentTrackingScript because that script temporarily annotates
visitorConsentCollected events for the analytics bus"), then the async Shopify analytics CDN script.

**Tokenless headless flow.** `global.ts:124-129` seeds `customerPrivacy.config = {isHeadless: true}` and
`consentStatus: "pending"`; `global-script.ts:16-18` sets `consentDomain = window.location.host` at runtime,
with the comment "Privacy banner defaults to hostname, which drops protocol/port. Use the current host for
tokenless consent requests and legacy cookie domain inference." The initial request is
`consent-script.ts:59`:

```ts
setTrackingConsent({ headlessStorefront: true }, (result) => { … });
```

`{headlessStorefront: true}` **and nothing else** — no `checkoutRootDomain`, no `storefrontRootDomain`, no
`storefrontAccessToken`, against a documented contract that names all three as required for custom storefronts
(§1.3). Asserted by test at `consent.test.ts:75-78`. This is §9.1.

Also, in `default-banner` mode preview never calls `privacyBanner.loadBanner()` — the test
`"does not replay or configure the privacy banner"` (`consent.test.ts:254`) makes that explicit, and
`consent-script.ts:83-90` hands the initial consent request to the banner: "In default-banner mode,
privacy-banner owns the initial consent request."

### 3.3 Consent gating

`preview:src/core/analytics/bus.ts:66-80`:

```ts
function hasAnalyticsConsent(): boolean {
  try {
    const privacy = window.Shopify?.customerPrivacy;
    if (privacy?.consentStatus !== "loaded") return false;

    const currentVisitorConsent = privacy.currentVisitorConsent?.();
    if (isObjectRecord(currentVisitorConsent) && currentVisitorConsent.analytics === "no") {
      return false;
    }

    return privacy?.analyticsProcessingAllowed?.() ?? false;
  } catch {
    return false;
  }
}
```

Three conditions, all fail-closed: readiness, no explicit `"no"`, then the predicate. Note this is *stricter*
than Shopify's own guidance in §1.2 — preview overrides `analyticsProcessingAllowed()` with the raw
`currentVisitorConsent()` value when the visitor explicitly declined, even though the docs say the `Allowed`
methods are the authoritative combination. Asserted by
`bus.test.ts:653-674` ("blocks destinations when the visitor explicitly declined analytics"). The setup skill
documents only the last clause (`skills/hydrogen-setup/references/analytics.md:135-141`).

### 3.4 The pre-interaction banner problem

Preview solves the bug classic ignores (§2.7). `bus.ts:101-118`:

```ts
// Only Shopify's privacy-banner has a known pre-interaction initial event:
// it may call setTrackingConsent once to hydrate consent state, then again
// after the shopper accepts or declines. Custom banners also may call
// setTrackingConsent later, but Hydrogen does not own or observe their UI
// lifecycle, so their initial event must be treated as actionable consent.
function shouldWaitForDefaultBannerInteraction(): boolean { … }
```

The inline bootstrap annotates each `visitorConsentCollected` event with `detail.source = "initial" |
"interaction"` (`consent-script.ts:93-107`), with the comment "This will be done in consent-tracking-api
library eventually" — i.e. preview is polyfilling a field it expects Shopify to ship. Failure mode is
conservative: the `catch` returns `true` (keep waiting).

### 3.5 What happens to events published before consent — **buffered and replayed**

`bus.ts:168-191` — `publish` delivers to raw subscribers **unconditionally**, then hands the event to the
destination manager:

```ts
const eventSubscribers = subscribers.get(event) ?? new Map();
eventSubscribers.forEach((callback, subscriberId) => { … callback(normalizedPayload); … });

// Buffer the event and deliver to destinations when analytics consent allows.
destinationManager.onPublish(event, normalizedPayload);
```

Asserted by `bus.test.ts:185-193`, named **"delivers events regardless of consent state (consent-agnostic
bus)"**.

`destination-manager.ts:9, 204-223` — a 500-entry ring buffer with a monotonic sequence:

```ts
const MAX_REPLAY_BUFFER_SIZE = 500;

function onPublish(event: string, payload: unknown): void {
  const replayEntry = {sequence: nextReplaySequence++, event, payload};
  if (shouldRecordReplay) {
    replayBuffer.push(replayEntry);
    if (replayBuffer.length > MAX_REPLAY_BUFFER_SIZE) replayBuffer.shift();
  }
  if (deps.canTrack()) {
    for (const destination of destinations) deliverDestinationEvent(destination, replayEntry);
  }
}
```

Each destination carries its own `nextReplaySequence` cursor, so a destination registered late gets history and
nothing twice (`:29-48`, `:77-93`, test `"replays each buffered event to a destination only once"`).

Replay is driven by a `document` listener on `visitorConsentCollected` (`bus.ts:217-254`), whose own comment is
the clearest statement of the model:

```
 * - default-banner initial + banner required: keep waiting for the user's interaction.
 * - initial + allowed: replay buffered events.
 * - interaction + allowed: replay buffered events.
 * - interaction + denied: drop the buffer and stop recording until allowed.
```

Denial is permanent for that page: `destination-manager.ts:77-84` sets `shouldRecordReplay = false` and empties
the buffer, and only a later successful `replay()` sets it back to `true`. Asserted by
`bus.test.ts:628-651`.

**None of this is configurable.** `MAX_REPLAY_BUFFER_SIZE` is a module constant; there is no option to disable
buffering, to keep the buffer across a denial, or to opt a destination out of gating.

### 3.6 Consent gates destinations, not recording — stated as policy

`preview:skills/hydrogen-analytics/SKILL.md:18, 67-71`:

> "Key consent setup: Shopify Customer Privacy controls destination delivery in production. **Raw subscribers
> can observe events before consent; destinations receive only consent-allowed replay.** Do not bypass Customer
> Privacy consent gating in production."

`preview:skills/hydrogen-setup/references/analytics.md:141, 143, 581, 601`:

> "This is conservative by design: if the Customer Privacy script is blocked, hasn't loaded, or is unavailable,
> **destination delivery is blocked**. Raw `subscribe()` listeners still see live events, but analytics
> destinations do not receive events until `analyticsProcessingAllowed()` returns true."

> "Events published before consent is ready are buffered for destinations and replayed only if analytics
> consent is granted… If the visitor explicitly denies analytics consent, the replay buffer is cleared."

> "Consent gating happens at the bus level before destination callbacks see the payload. Raw
> `analytics.subscribe()` is live-only and consent-agnostic; use `addDestination()` for logging or analytics
> destinations that should respect consent and replay."

> "Do not bypass this gate in production. Shipping consent bypasses is a regulatory issue."

This is where solidifront's `CONTEXT.md` phrasing comes from, and it is a fair reading of preview — with the
caveats in §0.2.

### 3.7 A second event channel that consent does not touch

Preview also dispatches Shopify **Standard Events** as DOM `CustomEvent`s on `document`, entirely separately
from the analytics bus. `preview:src/core/shopify-scripts/page-view.ts:33-44` dynamically imports
`https://cdn.shopify.com/storefront/standard-events.js` and dispatches `new StandardEvents.PageViewEvent({page})`
on every navigation. **There is no consent check anywhere in that file**, and `initializeShopifyScripts()`
calls it unconditionally (`initialize.ts:21`). Whatever consumes those events — Shopify's own standard-events
runtime, installed apps, web pixels — owns its own gating (§1.7).

Any solidifront model of consent must account for two channels, not one. The `subscribe`/`addDestination`
split describes only the bus.

### 3.8 No consent API is exposed to app code

Preview exports the `ConsentConfig` *type* and nothing else. There is no `useCustomerPrivacy` equivalent, no
`getCustomerPrivacy()`, no `canTrack` override — grep for `customerPrivacy` across `src/` returns only
`globals.ts` (the type declaration), the three consent/cookie internals, and `bus.ts`. App code that needs to
read or set consent must reach for `window.Shopify.customerPrivacy` itself. The typed shape preview declares
(`preview:src/globals.ts:22-38`) omits `getRegion()`, `consentId()`, `saleOfDataRegion()` and
`getTrackingConsentMetafield()`, which the API does expose (§1.2).

---

## 4. Precisely where the two diverge

| | **classic** `2026.4.5` | **preview** `2026.10.0-preview.0` |
| --- | --- | --- |
| Config type | `Consent` — 6 fields, all optional | `ConsentConfig` — 1 field, optional |
| Required fields | `checkoutDomain`, `storefrontAccessToken` (`errorOnce`, never throws) | none |
| `setTrackingConsent` initial payload | full headless params per docs | `{headlessStorefront: true}` only |
| Banner selection | `withPrivacyBanner: boolean`, defaults **false** | `mode` enum, defaults **`"no-banner"`** |
| Banner init | `privacyBanner.loadBanner(config)` called by Hydrogen | never called; banner owns it |
| Consent script | v0.2 (`customer-privacy-api` in `<body>`) | v0.2 (`shopify-consent` in head order) |
| Readiness detection | `Object.defineProperty` interceptors on `window.Shopify` / `window.privacyBanner` | script `load` event + `visitorConsentCollected`, with `consentStatus: "pending" \| "loaded"` |
| Pre-interaction banner event | **ignored** ("likely a bug in Privacy Banner SDK") | **handled** via a polyfilled `detail.source` annotation |
| Gate predicate | `analyticsProcessingAllowed()` only | `consentStatus === "loaded"` **and** not `analytics === "no"` **and** `analyticsProcessingAllowed()` |
| **Pre-consent events** | **dropped** — `publish` is a no-op | **recorded**, delivered live to `subscribe()`, buffered for destinations |
| **On grant** | nothing replayed; view events re-fire via React effect deps; **cart events lost** | 500-entry buffer replayed, per-destination cursor, exactly once |
| **On denial** | n/a (nothing was recorded) | buffer wiped, recording stops until allowed again |
| Gate scope | **all subscribers**, first- and third-party | **destinations only**; `subscribe()` is ungated |
| Third-party seam | `subscribe()` — consent-gated | `addDestination()` — consent-gated **and** replayed |
| Consent API for app code | `useCustomerPrivacy()` hook, `getCustomerPrivacy()`, `getPrivacyBanner()`, `canTrack` prop override | **none** — reach for `window.Shopify.customerPrivacy` |
| `custom_*` events | supported | rejected at type and runtime (`bus.ts:82-88`) |
| Events sent to Shopify | 5 of 9, via `fetch` to Monorail from Hydrogen's own code | Hydrogen publishes to a bus; the **CDN script** `storefront/analytics/shopify.js` consumes it |
| PerfKit | withheld until `consentCollected` | rendered whenever `storefrontId` + numeric `shopId` exist (`perfkit.ts:14-18`); gating is inside the script |

### 4.1 Which direction Shopify says is forward

Shopify has not published a deprecation notice for classic, and both lines are actively released under the same
calendar scheme. What exists is a statement of intent in preview's README:

> "**🧪 Developer Preview** — Hydrogen is being rebuilt in the open. APIs will change and some pieces are still
> landing." — `preview:README.md:9`

> "The old Hydrogen was a framework you adopted whole. The new Hydrogen is a **toolkit** you bring to the
> framework you already use… We redesigned it in partnership with the Next.js team at Vercel." —
> `preview:README.md:11`

> "So we went back to the start and rebuilt Hydrogen as a lightweight, framework-agnostic toolkit of commerce
> primitives that deploys to any JavaScript runtime." — `preview:README.md:33`

For consent specifically, three independent signals point the same way:

1. Classic's own code anticipates the tokenless direction — `// TODO: we likely don't need checkout domain if
   SFAPI proxy is enabled` (`AnalyticsProvider.tsx:323-324`), and 2026.4.0 already shipped "backend consent
   mode… supporting the deprecation of the `_tracking_consent` cookie" (`classic:CHANGELOG.md:74-76`). Preview
   is the endpoint of that trajectory, not a divergence from it.
2. Preview polyfills a Shopify-side gap it expects Shopify to close — "This will be done in consent-tracking-api
   library eventually" (`consent-script.ts:95`).
3. Shopify's public docs still describe **v0.1** while both lines load **v0.2**, so the documented contract is
   behind both implementations and cannot be used to adjudicate.

**Conservative reading:** preview's buffer-and-replay model is where Shopify's active work is, but it is
self-described as unstable, is not documented on shopify.dev, and rests on an undocumented tokenless consent
call (§9.1). Classic's model is the one the public documentation and the supported product describe.

---

## 5. The crux: buffered, or dropped?

### 5.1 Answer

- **classic — dropped.** `publish: canTrack() ? publish : () => {}` (`AnalyticsProvider.tsx:360`).
- **preview — buffered, then replayed or wiped.** 500-entry ring, per-destination cursor, driven by
  `visitorConsentCollected` (`destination-manager.ts:9, 77-93, 204-223`; `bus.ts:217-254`).
- **Configurable in neither.** No prop, option, or constant is exposed in either line.

### 5.2 Shopify itself says nothing

Searched across the Customer Privacy API, Web Pixels, Hydrogen analytics, and the headless analytics guides:
Shopify never uses "buffer", "queue", "replay", or "defer" in relation to pre-consent analytics events. What
the docs do say leans toward dropping, but always describes *emission*, never *recording*:

> "**Caution:** If you haven't configured consent through the Customer Privacy API, then analytics events won't
> fire and no data is tracked." — https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/tracking

> "If `event.payload.hasUserConsent` is false, no analytics event will happen." —
> https://shopify.dev/docs/api/hydrogen-react/latest/utilities/sendshopifyanalytics

> "**canTrack** · `() => boolean` · An optional function to set wether the user can be tracked. Defaults to
> Customer Privacy API's `window.Shopify.customerPrivacy.analyticsProcessingAllowed()`." —
> https://shopify.dev/docs/api/hydrogen/latest/components/analytics/analytics-provider

A synchronous boolean predicate evaluated at publish time, with no queue semantics attached. **Whether a
storefront may hold events in memory pending consent is left entirely to the storefront.** That is a
permission, not an endorsement — see §7.3.

### 5.3 Consequence for `CONTEXT.md`

The term as written — *"gates destinations, not the recording of events"* — is implementable, is what preview
does, and is what preview's own documentation says. It is **not** what classic does, and it is **not** a
position Shopify has taken. Adopting it is a solidifront design decision that follows Hydrogen preview, and it
should be recorded as such (an ADR, per `docs/agents/domain.md`) rather than presented as Shopify's model.

The two amendments in §0.2 are required for the definition to be true of the whole system rather than of one
layer.

---

## 6. What is required for Shopify's analytics to attribute a headless storefront

Ordered by how hard Shopify's own wording is.

### 6.1 REQUIRED — consent must be configured, or nothing is tracked at all

> "**Caution:** If you haven't configured consent through the Customer Privacy API, then analytics events won't
> fire and no data is tracked." — https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/tracking

### 6.2 REQUIRED — a same-origin Storefront API proxy

> "Shopify uses HTTP-only cookies to securely track consent and analytics. **For these cookies to work
> correctly, your storefront must be able to query the Storefront API under the same origin** (your store
> domain)." — https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/consent

> "If you're not using Hydrogen's default request handler or are building a custom solution, **you need to
> implement your own Storefront API proxy**." — ibid.

Preview's own skill treats this as a hard prerequisite rather than a nicety
(`preview:skills/hydrogen-analytics/SKILL.md:18`):

> "Prerequisite: analytics depends on the same-origin SFAPI proxy… Without it, analytics falls back to
> deprecated JavaScript-visible cookies and session continuity into checkout breaks — treat it as incomplete
> until the proxy is wired."

Mechanically, the tokens ride in a `Server-Timing` header on Storefront API responses and are read back from
the Performance API, not from cookies (`preview:src/core/shopify-scripts/utils/tracking-values.ts:16-18`); the
proxy must forward `Set-Cookie` and `Server-Timing` to the document response
(`preview:src/core/request-context.ts:211-244`).

### 6.3 REQUIRED — the token must come from the right sales channel

> "To ensure your Hydrogen analytics are compatible with Shopify Live View, make sure your app meets the
> following requirements: … **Your app's Storefront API token must be created and managed through the Hydrogen
> sales channel. Tokens created with other channels won't work.** … For add-to-cart analytics events, the
> referring URL can't be `localhost` or an Oxygen preview environment URL ending in `myshopify.dev`. The
> `storefrontHeaders` prop for `createStorefrontClient` must be defined." —
> https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/validation

### 6.4 REQUIRED — checkout on the same root domain

See §1.3. Cross-domain checkout means consent given on the storefront is not honored at checkout.

Preview's e2e suite shows what denial does end-to-end, and it is enforced **server-side by Shopify**, not by
Hydrogen: on decline, the Storefront API's `Server-Timing` `_y`/`_s` values become the mock UUID
`00000000-0000-0000-5000-000000000000`
(`preview:examples/hydrogen/e2e/fixtures/storefront.ts:36, 861-873`), the `_shopify_analytics` and
`_shopify_marketing` cookies are absent, only `_shopify_essential` is set, and PerfKit loads but does not beacon
(`preview:examples/hydrogen/e2e/specs/new-cookies/privacy-banner-decline.spec.ts:20-41`). Revoking consent
after granting it flips previously-real UUIDs back to mock values on the next request
(`privacy-banner-consent-change.spec.ts:59-62`).

### 6.5 The event names Shopify's own ingest accepts

> "#### AnalyticsEventName — Analytics event names accepted by Shopify analytics. **ADD_TO_CART** ·
> 'ADD_TO_CART' · required · Add to cart. **PAGE_VIEW** · 'PAGE_VIEW' · required · Page view" —
> https://shopify.dev/docs/api/hydrogen-react/latest/utilities/sendshopifyanalytics

Only two. Page type is carried separately via `AnalyticsPageType` (`product`, `collection`, `search`, `cart`,
`index`, …). Sales channel is `ShopifySalesChannel` — `'headless'` or `'hydrogen'`. Preview mirrors this in
`ShopAnalyticsChannel = "hydrogen" | "headless"` (`preview:src/core/analytics/types.ts:8`), where `"hydrogen"`
carries `storefrontId` in the payload and `"headless"` omits it
(`preview:src/core/shopify-scripts/analytics.ts:13-20`).

### 6.6 RECOMMENDED, explicitly

> "We recommend using Hydrogen's built-in `<Analytics.Provider>` component." —
> https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/consent-3p

> "If you have a Hydrogen storefront, we recommend that you use the Hydrogen Analytics package." —
> https://shopify.dev/docs/api/customer-privacy

> "It's also recommended that your storefront supports cart permalinks." —
> https://shopify.dev/docs/storefronts/headless/bring-your-own-stack

### 6.7 The unsupported-configuration warning that names solidifront

There is **no shopify.dev page documenting a supported first-party analytics contract for a non-Hydrogen
headless storefront.** The nearest thing is the custom-headless cookie migration guide, which opens:

> "**Caution:** This configuration isn't officially supported by Shopify." —
> https://shopify.dev/docs/storefronts/headless/hydrogen/migrate/cookies-custom-setup

Its prescribed path is still `hydrogen-react`:

> "To migrate analytics tracking for a custom headless build, implement a Storefront API proxy on your server
> to handle the new Shopify cookies within your storefront domain… You'll use `hydrogen-react`'s
> `useShopifyCookies({fetchTrackingValues: true})`… If you're using custom analytics, then replace
> `getShopifyCookies` (now deprecated) with `getTrackingValues`."

> "For example, set it to `true` if you are using `hydrogen-react` only with a different framework and still
> need to make a same-domain request to Storefront API to set cookies." —
> https://shopify.dev/docs/api/hydrogen-react/latest/hooks/useshopifycookies

Neither the Monorail payload schema nor `Shopify.analytics` nor trekkie is publicly specified. Anything
solidifront builds beyond calling these packages is reverse-engineering, not spec-following, and should be
labelled that way in its own docs.

### 6.8 The cookie deprecation, which has already elapsed

> "Shopify will stop setting `shopify_y` and `shopify_s` cookies on **April 30, 2026**. Hydrogen now provides
> utilities that give you access to equivalent tracking values: `uniqueToken` replaces `_y`, `visitToken`
> replaces `_s`. These values aren't meant to be read from browser cookies directly." —
> https://shopify.dev/docs/storefronts/headless/hydrogen/migrate/cookies

> "**Caution:** If you don't migrate your analytics tracking before April 30, 2026, then the data for your
> integration's visitors and session attributions won't be reported accurately in Shopify Analytics." — ibid.

That date is **3½ months in the past** as of this research. Preview's
`src/core/shopify-scripts/deprecated-cookies.ts:1-9` is the compatibility shim, and its header says so:

> "@deprecated This module manages the legacy `_shopify_y` and `_shopify_s` JavaScript-visible cookies. Modern
> Shopify storefronts use http-only cookies set by the Storefront API via the SFAPI proxy. This module exists
> only for backward compatibility with downstream systems that may still read these JS cookies directly. To
> remove: delete this file and remove the ShopifyScripts startup call."

**Solidifront should not implement JS-visible tracking cookies at all.**

---

## 7. Jurisdictions — what Shopify's model assumes, and what it leaves to you

### 7.1 Which regimes are named

> "You need to get consent from your storefront visitors before collecting analytics if you serve customers in
> regions with privacy laws (like **GDPR in the EU or CCPA in California**), use tracking cookies, or collect
> personal data." — https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/consent

> "Use this method to determine if the app user has explicitly disallowed selling data to third parties for
> visitors located in **California or Virginia**. This enables compliance with the **CCPA and VCDPA**." —
> https://shopify.dev/docs/api/customer-privacy (legacy section)

Global Privacy Control is honored automatically and cannot be overridden:

> "The GPC signal is automatically collected and honored in regions configured for data sale opt-out and cannot
> be adjusted through `setTrackingConsent`."

**Shopify has deliberately generalized away from naming laws in its API.** Both region methods were renamed:

> "Two methods have been renamed to generalize their use" — `shouldShowGDPRBanner()` → `shouldShowBanner()`,
> `shouldShowCCPABanner()` → `saleOfDataRegion()`.

Preview's setup skill restates the practical scope more broadly than the API does
(`preview:skills/hydrogen-setup/references/analytics.md:124-125`):

> "**Visitors in jurisdictions with consent requirements** (EU/EEA/UK GDPR, parts of Canada, California CCPA,
> etc.) — analytics must wait for consent… **Visitors in jurisdictions without consent requirements** — the
> Customer Privacy SDK auto-allows tracking and the banner does not render."

That is Hydrogen's own prose, not Shopify's legal specification. Treat it as orientation, not as a compliance
map.

### 7.2 What Shopify decides

Region detection is geolocation resolved to ISO 3166-2 (`getRegion()` → `'USCA'`, `'IEL'`, `'GBENG'`, …,
empty string when undeterminable). But **the behaviour per region is merchant configuration, not law derived by
Shopify**: "the opt out form is available to visitors from the configured regions, which is usually US states";
"When the Shopify cookie banner is enabled, it displays in the configured regions."

Per the help-centre page, automated privacy settings enable the banner for UK and EEA visitors when the
merchant has active markets there, and leave it off elsewhere by default —
https://help.shopify.com/en/manual/privacy-and-security/privacy/customer-privacy-settings/privacy-settings.
`[UNVERIFIED — help.shopify.com returns HTTP 403 to direct fetches; this paragraph came through a summarizing
fetch and could not be quoted character-for-character. Do not restate it as Shopify's exact wording.]`

### 7.3 What Shopify explicitly leaves to the storefront

Quote these in any solidifront compliance discussion:

> "**Caution:** Collecting data without consent might not comply with applicable laws. **Consult legal counsel
> to discuss the requirements that apply to your business.**" — https://shopify.dev/docs/api/customer-privacy

> "**Note:** You're responsible for ensuring that all analytics you're sending from your Hydrogen site are
> compliant with consent laws." — https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/consent
> (repeated verbatim at .../analytics/consent-3p)

> "You're responsible for your own compliance, and you should consult your own legal counsel to determine how
> the laws in your region, and the region in which you sell, might affect your business." —
> https://help.shopify.com/en/manual/privacy-and-security/privacy/customer-privacy-settings

> "Automated privacy settings aren't a substitute for legal advice." — ibid.

Concretely, Shopify owns: region detection, the merchant's regional configuration, the `Allowed` predicates,
the hosted banner UI, and server-side suppression of identity when consent is denied (§6.4). The storefront
owns: loading the script, calling `setTrackingConsent` if it renders its own banner, deciding what its own
non-Shopify destinations do, and — per §5.2 — deciding whether to hold events in memory pending consent.

A server-side counterpart exists for data-sale opt-out and is not part of the browser API:
https://shopify.dev/docs/api/admin-graphql/unstable/mutations/dataSaleOptOut.

---

## 8. What this means for solidifront

1. **Keep the term "Consent", amend the definition.** Add the layer qualifier and define "destination" against
   "subscriber" (§0.2). Record it as a decision that follows Hydrogen preview, not as Shopify's model.
2. **Do not default to no-banner.** Preview's code default (`"no-banner"`) contradicts its own documentation.
   Either require the mode or default to `default-banner`.
3. **Model the two channels.** The analytics bus and the DOM Standard Events channel are separate, and only the
   first is gated (§3.7). A domain model with one Consent gate will be wrong.
4. **Normalize the four spellings** of the four purposes at the boundary (§1.1). This is minimum-viable, not
   polish.
5. **Effect shape.** Buffer-and-replay is a natural `Queue` + `Scope`; destinations as `Layer`s with scoped
   teardown replaces preview's returned-unsubscribe registry; the consent gate is a `Ref`/`SubscriptionRef` fed
   by the `visitorConsentCollected` listener. The 500-entry cap and the wipe-on-denial rule should become
   explicit configuration rather than constants — but wipe-on-denial must remain the **default**.
6. **The SFAPI proxy is a prerequisite, not an analytics feature** (§6.2). Analytics work is blocked on it.
7. **Do not implement `_shopify_y` / `_shopify_s`** (§6.8).
8. **Fail closed.** Both Hydrogens deviate from Shopify's legacy "proceed if the API is unavailable" guidance
   (§1.5). Copy the deviation, not the guidance.
9. **Label the reverse-engineered parts.** Shopify says a non-Hydrogen headless analytics build "isn't
   officially supported" (§6.7). Solidifront's docs should repeat that, not paper over it.

---

## 9. Open questions

1. **Is preview's tokenless consent call actually supported, or is it depending on unreleased behaviour?**
   Preview sends `setTrackingConsent({headlessStorefront: true})` with no `checkoutRootDomain`,
   `storefrontRootDomain`, or `storefrontAccessToken` (`preview:src/core/shopify-scripts/consent-script.ts:59`),
   against docs that name all three as required for custom storefronts (§1.3). Both lines load v0.2 while the
   docs describe v0.1, so the v0.1 references are simply stale — that part of `shopify-domain.md` §7.3 is
   resolved. What is **not** resolved is whether v0.2 introduced a token-free headless mode that classic has
   not adopted, or whether preview relies on behaviour that is not yet public. **This is the single highest-risk
   unknown in this document**: if it is the latter, consent silently fails on a real storefront and that is a
   compliance failure, not a bug. Worth asking directly at
   https://github.com/Shopify/hydrogen/discussions. `[UNVERIFIED]`
2. **Does preview's `default-banner` mode actually show a banner?** Preview never calls
   `privacyBanner.loadBanner(config)` — asserted by its own test "does not replay or configure the privacy
   banner" (`preview:src/core/shopify-scripts/consent.test.ts:254`) — where classic calls it explicitly with
   the full config (`classic:ShopifyCustomerPrivacy.tsx:412-438`). The code comment says the banner script
   self-initializes ("privacy-banner owns the initial consent request",
   `preview:src/core/shopify-scripts/consent-script.ts:86`), and preview's e2e suite does drive a real banner
   (`acceptPrivacyBanner()` / `declinePrivacyBanner()`), which is suggestive but was not run here. Whether the
   banner also self-configures locale/country, and what happens when it does not, is unverified.
   `[UNVERIFIED — compliance-relevant]`
3. **What happens on a *partial* grant?** Both Hydrogens gate solely on the `analytics` purpose. Neither reads
   `marketingAllowed()`, `preferencesProcessingAllowed()`, or `saleOfDataAllowed()` for gating —
   `saleOfDataAllowed` appears in classic only as a stamped payload field
   (`classic:ShopifyAnalytics.tsx:176-186`) and nowhere in preview's gate. A visitor who grants analytics but
   denies sale-of-data is, at the storefront library layer, indistinguishable from one who granted everything.
   Whether Shopify's downstream ingest honours the other three purposes server-side was not established.
   `[UNVERIFIED — compliance-relevant]`
4. **Does `getTrackingConsent()` exist?** It appears nowhere in Shopify's documentation; the nearest documented
   method is `getTrackingConsentMetafield(key)`. Neither Hydrogen calls it. Treat as nonexistent until seen in
   shipped CDN JavaScript. `[UNVERIFIED]`
5. **Do web pixels receive pre-consent events after consent is granted?** The `init.customerPrivacy` snapshot
   plus `customerPrivacy.subscribe('visitorConsentCollected')` pattern implies a pixel that loads after consent
   starts from the consent moment, but Shopify does not say so. This is the pixel-side analogue of the crux and
   is unanswered. `[UNVERIFIED]`
6. **What `firstPartyMarketingAllowed` / `thirdPartyMarketingAllowed` are.** They appear only in Hydrogen's
   `VisitorConsentCollected` type
   (https://shopify.dev/docs/api/hydrogen/latest/hooks/usecustomerprivacy) and never in the Customer Privacy
   API reference. Two undocumented signals. `[UNVERIFIED]`
7. **The CDN scripts were not read.** `consent-tracking-api.js`, `storefront-banner.js`, and
   `storefront/analytics/shopify.js` are all opaque here. In particular, preview delegates the *entire* Monorail
   leg to `storefront/analytics/shopify.js`, which binds to `window.Shopify.analytics`
   (`preview:src/core/analytics/bus.ts:128-140, 256-264`). Whether that script performs its own consent check —
   i.e. whether preview's gate is single or double — is unverified. Classic's equivalent is double-gated and
   readable (§2.5). `[UNVERIFIED]`
8. **Whether replayed events carry stale identity.** Preview snapshots the URL before replay
   (`bus.test.ts:360`, "snapshots inferred URLs before destination replay") but nothing snapshots the tracking
   tokens, which are read from `Server-Timing` at dispatch time. An event recorded pre-consent and replayed
   post-consent will therefore be attributed with post-consent identity. Whether that is intended, and whether
   it is defensible under GDPR, was not established and is a question for counsel, not for source reading.
   `[UNVERIFIED — compliance-relevant]`
9. **Regional default behaviour was not observed on a live store.** Everything in §1.5 and §7.2 is from
   documentation plus the existence of preview's four differently-configured e2e stores
   (`preview:examples/hydrogen/e2e/fixtures/index.ts:105-113`). No store was created and no region was
   simulated. `[UNVERIFIED]`
