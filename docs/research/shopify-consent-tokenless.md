# Is Hydrogen preview's tokenless headless consent call supported by consent-tracking-api v0.2?

**Research date:** 2026-08-15
**Question:** [KookiKodes/solidifront#28](https://github.com/KookiKodes/solidifront/issues/28) — "Verify tokenless headless consent against consent-tracking-api v0.2". Resolves **open question #1** of [`shopify-consent.md`](./shopify-consent.md) §9, which called it *"the single highest-risk unknown in this document"*, and **open question #7** (single vs. double gate) in the same pass.
**Status:** Answered. The tokenless call is **supported and deliberate**. One genuine risk was found, but it is not the one the ticket suspected.

**Primary sources.** The CDN scripts are served from unversioned, mutable URLs; each is pinned below by byte size and SHA-256 at fetch time so the reading is auditable without re-fetching. All fetched from `https://cdn.shopify.com` on **2026-08-15**.

| Artifact | Path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| consent-tracking-api **v0.2** | `/shopifycloud/consent-tracking-api/v0.2/consent-tracking-api.js` | 21,370 | `343403a24b831578a82c4363b1ca38025b2a6efa8c96e6fcf104443ae9b0479d` |
| consent-tracking-api **v0.1** | `/shopifycloud/consent-tracking-api/v0.1/consent-tracking-api.js` | 22,602 | `ea9c2752def05f39afcca794de1cdf1bed29cbb3b892e62ded14403ac050b3c5` |
| privacy banner | `/shopifycloud/privacy-banner/storefront-banner.js` | 81,100 | `243a10706ddf4bfcecc4181074572946470c730ed92bea8c0ae6f762302dde1b` |
| storefront analytics | `/storefront/analytics/shopify.js` | 12,522 | `a992f5f7e4c228d85f886dad60ba8ea5ef1e8531f72a56b84997c117d5c7e034` |

- **v0.3 does not exist** — `/shopifycloud/consent-tracking-api/v0.3/consent-tracking-api.js` returns HTTP 404 (2,770-byte Shopify 404 page).
- **Sourcemaps.** `consent-tracking-api.js.map` **404s for v0.2** but **200s for v0.1** (17,051 bytes, `610fbc51…`) — and that v0.1 map is **stale**: its `sourcesContent` is a pre-granular-consent release whose `setTrackingConsent(consent: boolean, callback)` takes a boolean and POSTs to `/set_tracking_consent.json`, which is **not** what the deployed v0.1 bundle does. It was not used as evidence for v0.1 behaviour; see §3.0. `/storefront/analytics/shopify.js.map` **200s (46,575 bytes, `fdc4d84e…`) and is current** — validated in §5.1 — so §5 quotes original TypeScript, not deminified output.
- Line numbers cited as `cta-v02.js:NNN` refer to the file after `npx prettier@3 --parser babel <file>`, which is deterministic. Verbatim excerpts are reproduced in **Appendix A**.
- **Live network probes** against public Shopify storefronts, 2026-08-15, transcript in **Appendix B**.
- `references/hydrogen` submodule @ `50b7874` (`@shopify/hydrogen` `2026.10.0-preview.0`); `Shopify/hydrogen@main` (classic) and PR history via authenticated `gh`.
- https://shopify.dev/docs/api/customer-privacy (retrieved 2026-08-15).

---

## Verdict

**Preview's tokenless call is supported, intentional, and better-founded than the docs it appears to contradict. It is not relying on unreleased behaviour.**

1. **v0.2 accepts `{headlessStorefront: true}` alone.** Validation is an *allowlist*, not a required-set: it rejects a non-object, an empty object, and unknown keys — and requires nothing else. `checkoutRootDomain`, `storefrontRootDomain` and `storefrontAccessToken` are optional at every point in the code path (§1).
2. **The storefront access token is genuinely not required by Shopify's server.** Verified live: a tokenless POST of the exact query v0.2 sends returns **HTTP 200 with valid data** on four Shopify-served origins. A *wrong* token returns **401 UNAUTHORIZED**. Omitting the token is therefore the *safer* mode, not a degraded one (§2.3, Appendix B).
3. **The ticket's premise that preview passes no domain is incorrect.** Preview sets `window.Shopify.customerPrivacy.config.consentDomain = window.location.host` in an inline bootstrap that runs *before* the consent script, with the comment *"Use the current host for tokenless consent requests"* (`references/hydrogen/packages/hydrogen/src/core/shopify-scripts/global-script.ts:16-18`). v0.2 reads that config first (§2.1).
4. **That host works because Hydrogen ships a mandatory same-origin Storefront API proxy** whose route regex matches `unstable` explicitly (`references/hydrogen/packages/hydrogen/src/core/url.ts:1`), and which deliberately does **not** inject the access token (§2.2). This is the same prerequisite [`shopify-consent.md`](./shopify-consent.md) §6.2 already flagged as REQUIRED.
5. **The v0.1 → v0.2 delta is the opposite of "v0.2 added a tokenless mode".** v0.1 *had* a tokenless headless branch and it was a **client-only fake**: it made no network call, wrote a cookie defaulting analytics/marketing/preferences to **DECLINED**, called the callback with success, and returned a promise that never settles. **v0.2 deleted it** and routes headless through the real server call (§3).
6. **Failure is not a silent no-op.** Errors surface as `result.error` on the callback (§4). The real hazard is downstream: preview's caller returns without marking consent ready, so `consentStatus` stays `"pending"` **forever** and every destination analytics event buffers indefinitely. That fails *closed*, not open (§4.2).
7. **The gate is double** (open question #7): the CDN analytics script performs its own check, `if (!payload.hasUserConsent) return Promise.resolve()`. But both gates read the same `_tracking_consent` state, and the CDN one **fails open** when no consent cookie exists (§5).

**Confidence: high** for 1–5 and 7 (shipped code plus live network verification); **high** for 6 (shipped code, not executed end-to-end). The one thing not directly observed is a preview storefront performing the call in a browser (§6.2).

**The residual risk is a deployment risk, not an API risk:** the proxy is opt-in at the app level. If an app does not call `handleShopifyRoutes`, the consent bootstrap fails and analytics silently never ships.

---

## 1. Does v0.2's `setTrackingConsent` accept `{headlessStorefront: true}` alone?

**Yes.** Nothing in the validation path requires any of the three parameters.

### 1.1 The validation is an allowlist with a non-empty constraint

`setTrackingConsent` is `Cn(n, t)` at `cta-v02.js:816-891`. Its whole argument check is an inlined IIFE (`cta-v02.js:824-855`), reproduced verbatim in **Appendix A.1**. Deminified, it is exactly three rules:

```js
// (a) type
if (typeof consent !== "boolean" && typeof consent !== "object")
  throw new ConsentValidationError(`setTrackingConsent received an invalid argument of type "${typeof consent}". …`);

// (b) non-empty
if (typeof consent === "object") {
  const keys = Object.keys(consent);
  if (keys.length === 0)
    throw new ConsentValidationError("The submitted consent object is empty. …");

  // (c) every key must be in the allowlist
  for (const key of keys)
    if (!VALID_KEYS.includes(key))
      throw new ConsentValidationError(`The submitted consent object contains an invalid key: "${key}". …`);
}
```

There is **no fourth rule.** No required-key check, no conditional requirement keyed off `headlessStorefront`, and — notably — no requirement that any of the four *actual consent purposes* be present.

The allowlist is `yn` (`cta-v02.js:812-813`), assembled from the string constants at `cta-v02.js:33-49`:

```js
const gn = ["marketing", "analytics", "preferences", "sale_of_data"];
const yn = [...gn, "email", "rootDomain", "checkoutRootDomain", "storefrontRootDomain",
            "storefrontAccessToken", "headlessStorefront", "isExtensionToken",
            "metafields", "customerAccountRequestInfo"];
```

`{headlessStorefront: true}` is an object (passes a), has one key (passes b), and that key is in `yn` (passes c). **It throws nothing.**

### 1.2 What the three "required" parameters actually do

None is required; each is a *fallback override* consumed at a different point:

| Key | Where read | Fallback when absent |
| --- | --- | --- |
| `checkoutRootDomain` | `cta-v02.js:752` — picks the request host | `window.Shopify.customerPrivacy.config.consentDomain`, then `window.location.host` |
| `storefrontAccessToken` | `cta-v02.js:699` — request header | `config.storefrontAccessToken`, then the Liquid `#shopify-features` token, then **no header at all** |
| `storefrontRootDomain` | `cta-v02.js:786` — second cookie domain | server-returned `cookieDomain`, then `window.location.hostname` |

The one behaviour `headlessStorefront` itself controls is **client-side cookie writing** (`cta-v02.js:779-788`), and even that is gated on `!U()` — see §2.4.

### 1.3 The remaining throw sites

`setTrackingConsent` throws in only two other cases, neither triggered here: a non-function second argument (`cta-v02.js:856-865`), and a Node.js environment (`cta-v02.js:817-820`, *"setTrackingConsent is not supported in Node.js environments"*).

---

## 2. What does it actually send?

### 2.1 The request URL

`An(_, payload, callback)` (`cta-v02.js:749-811`) resolves the host in a three-step fallback (`cta-v02.js:750-753`):

```js
const host = getConfig().consentDomain
          || payload.granular_consent.checkoutRootDomain
          || window.location.host;
```

where `getConfig()` is `O()` = `window.Shopify?.customerPrivacy?.config || {}` (`cta-v02.js:239-249`).

**This is where the ticket's premise breaks.** Preview does not leave all three unset. `references/hydrogen/packages/hydrogen/src/core/shopify-scripts/global-script.ts:16-18`:

```ts
// Privacy banner defaults to hostname, which drops protocol/port. Use the current
// host for tokenless consent requests and legacy cookie domain inference.
shopify.customerPrivacy.config.consentDomain = window.location.host;
```

The comment names the design in Shopify's own words: **"tokenless consent requests"**. The config object is seeded `{ isHeadless: true }` at `references/hydrogen/packages/hydrogen/src/core/shopify-scripts/global.ts:124-129`, and preview's own test asserts the final shape is exactly `{ isHeadless: true, consentDomain: window.location.host }` (`references/hydrogen/packages/hydrogen/src/core/shopify-scripts/consent-tracking.test.ts:103-107`).

Ordering is deliberate: the inline `shopify-global-bootstrap` script is emitted before the `async` consent CDN tag (`references/hydrogen/packages/hydrogen/src/core/shopify-scripts/index.ts:97-164`), and `references/hydrogen/packages/hydrogen/src/react/shopify-scripts.tsx:63-69` attaches a no-op `onLoad` specifically to stop React hoisting the async tag above it.

The URL is then built at `cta-v02.js:720-721`:

```js
const scheme = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http:" : "https:";
const url = `${scheme}//${host}/api/unstable/graphql.json`;
```

So for preview: **`POST https://<storefront-origin>/api/unstable/graphql.json`** — same-origin.

### 2.2 Why same-origin resolves

Hydrogen ships a first-class Storefront API reverse proxy. `references/hydrogen/packages/hydrogen/src/core/url.ts:1`:

```ts
export const SFAPI_RE = /^\/api\/(unstable|2\d{3}-\d{2})\/graphql\.json$/;
```

`unstable` is matched **explicitly** — the exact path v0.2 hard-codes. The interceptor is `references/hydrogen/packages/hydrogen/src/core/request-routing/interceptors/sfapi-proxy.ts:5-24`, registered second in the chain at `handle-shopify-routes.ts:11-19`, forwarding to `storefrontClient.storeUrl` (`interceptors/proxy.ts:35`).

**The proxy deliberately does not inject the access token.** `applyStorefrontRequestHeaders` (`references/hydrogen/packages/hydrogen/src/core/request-context.ts:255-276`) sets SDK, version, request-group, cookie, and unique/visit-token headers but never the access token; it is only forwarded if the browser sent it (`references/hydrogen/packages/hydrogen/src/core/headers.ts:106-115`). Two tests assert this on purpose (`interceptors/sfapi-proxy.test.ts:225,235`): *"does not set X-Shopify-Storefront-Access-Token from config"* and *"forwards the incoming Storefront API token header without overwriting it"*.

**Caveat — the proxy is opt-in at the app level.** `handleShopifyRoutes` must be called by the application (`references/hydrogen/examples/hydrogen/server.ts:68`, `references/hydrogen/templates/react-router/app/root.tsx:56`, `references/hydrogen/examples/solid-start/src/middleware.ts:50`). This is the residual risk in the Verdict, and it is exactly the prerequisite [`shopify-consent.md`](./shopify-consent.md) §6.2 already documented.

### 2.3 The payload, and the token question settled empirically

`pn(host, payload)` (`cta-v02.js:690-748`) builds:

```js
const token = granular.storefrontAccessToken
           || getConfig().storefrontAccessToken
           || readLiquidAccessToken();       // #shopify-features JSON; warns and returns undefined if absent
const headerName = granular.isExtensionToken
  ? "Shopify-Storefront-Extension-Token"
  : "x-shopify-storefront-access-token";
const authHeaders = token ? { [headerName]: token } : {};   // ← omitted entirely when absent
fetch(url, { method: "POST", headers: { "content-type": "application/json", ...authHeaders }, body });
```

For preview there is no token in the call, none in config, and no Liquid `#shopify-features` element — so v0.2 logs `console.warn("Could not find liquid access token")` (`cta-v02.js:701-719`) and **sends no auth header at all**.

The body is produced by `En` (`cta-v02.js:660-689`) via the serializer `S` (`cta-v02.js:125-142`), which **skips `undefined` and `""` values**. Executing that code verbatim against `{granular_consent: {headlessStorefront: true}}` yields:

```json
{"query":"query { consentManagement { cookies(visitorConsent:{}) { trackingConsentCookie cookieDomain landingPageCookie origReferrerCookie } customerAccountUrl } }","variables":{}}
```

Two things follow, and the first is easy to miss:

- **`headlessStorefront` is never transmitted.** Neither are the domains or the token-as-payload. `En` reads only `marketing`, `analytics`, `preferences`, `sale_of_data`, `metafields`, `email`, `referrer`, `landing_page`. `headlessStorefront` is purely a client-side flag.
- **`visitorConsent:{}` is empty**, so the call *sets nothing*. Despite its name, `setTrackingConsent({headlessStorefront: true})` is a **read/bootstrap** call — it asks the server for the region-appropriate consent cookie. `{headlessStorefront: true}` is simply the minimal payload that satisfies the non-empty rule (§1.1b) while writing no consent value. This matches its caller's name, `requestInitialConsent`.

**What identifies the shop when there is no token: the origin.** Verified live (Appendix B) — a tokenless POST of exactly this query returns HTTP 200 with valid data on `supplystore2021.myshopify.com`, `shopify.supply`, `checkout.hydrogen.shop`, and `mock.shop`. A plain `{shop{name}}` is *also* served tokenless from those origins, while a **bogus token yields 401 `UNAUTHORIZED`**. The Storefront API authenticates these requests by host, and treats a present-but-invalid token as a hard failure.

> This is the strongest single result in this document: **omitting the token is safer than sending a wrong one.** It also explains the sub-commit *"Avoid passing storefront token from server config"* in PR [#3309](https://github.com/Shopify/hydrogen/pull/3309).

### 2.4 The response path, and what preview does *not* do

On `response.ok`, `An` (`cta-v02.js:757-800`) caches `trackingConsentCookie` on `window.Shopify.customerPrivacy.cachedConsent`, then:

```js
if (payload.granular_consent.headlessStorefront && !U()) {
  // write _tracking_consent client-side on one or two domains
}
```

`U()` (`cta-v02.js:337-350`) is `customerPrivacy.backendConsentEnabled === true || config.isHeadless === true`. **Preview sets `config.isHeadless = true`, so `U()` is true and this block never runs.** The cookie is set by Shopify's server via the proxy's forwarded `Set-Cookie`. Consent is then read back preferentially from `Server-Timing` rather than the JS cookie (`cta-v02.js:450`) — the "backend consent mode" introduced for classic in PR [#3649](https://github.com/Shopify/hydrogen/pull/3649), reached in preview through `config.isHeadless`.

Finally `B(...)` (`cta-v02.js:378-413`) dispatches `visitorConsentCollected` with the post-update purposes, and the callback is invoked `callback(null, response)`.

---

## 3. v0.1 → v0.2 delta in the required-parameter set

### 3.0 A trap: the v0.1 sourcemap is stale

`/shopifycloud/consent-tracking-api/v0.1/consent-tracking-api.js.map` returns HTTP 200 with complete `sourcesContent` — five original TypeScript files. **It does not describe the deployed v0.1 bundle.** The map's `src/index.ts` has `setTrackingConsent(consent: boolean, callback)` posting to `https://<host>/set_tracking_consent.json`, with no granular purposes and no headless parameters anywhere; the deployed `cta-v01.js` has `headlessStorefront`, `checkoutRootDomain`, `storefrontRootDomain`, `storefrontAccessToken` as string constants at lines 42-47 and reports `__metadata__.version === "v0.1"` at line 849. The map is an artifact of an earlier release left at the same URL. **Everything in §3 below is read from the deployed bundle**, not the map.

### 3.1 The delta, and it runs the other way

The required-parameter *set* did not change: **neither version requires any of the three.** What changed is what happens when they are absent.

**v0.1 had a dedicated tokenless-headless branch, and it never touched the network.** `cta-v01.js:701-731`, verbatim in **Appendix A.2**:

```js
if (typeof consent === "object" && consent.headlessStorefront && !consent.storefrontAccessToken) {
  Logger.warn("Headless consent has been updated. Please read shopify.dev/docs/api/customer-privacy to integrate.");
  monorail.produce("setTrackingConsent-Headless");
  // build a cookie locally, DEFAULTING TO DECLINED
  const cmp = {
    a: toConsent(consent.analytics,    DECLINED),
    m: toConsent(consent.marketing,    DECLINED),
    p: toConsent(consent.preferences,  DECLINED),
    s: toConsent(consent.sale_of_data),           // NO_VALUE
  };
  setCookie("_tracking_consent", consent.rootDomain, ONE_YEAR, encodeURIComponent(JSON.stringify({ v, reg: "", con: { CMP: cmp } })));
  callback(null);                       // reports SUCCESS
  return new Promise((resolve, reject) => {});   // never settles
}
```

Note all three properties of that branch: it **short-circuits before validation**, it reports **success**, and it returns a **promise that never settles**. Under v0.1, `setTrackingConsent({headlessStorefront: true})` would write a cookie recording analytics/marketing/preferences as **explicitly declined** and tell the caller everything worked.

**v0.2 deleted this branch outright.** The strings `"Headless consent has been updated"` and `"setTrackingConsent-Headless"` do not occur in `cta-v02.js` (0 matches each), and the only remaining use of `headlessStorefront` is the cookie-writing predicate at `cta-v02.js:780`. All calls now go through the same server path.

So the answer to *"did v0.2 introduce a genuine token-free headless mode?"* is: **v0.2 made the existing token-free headless mode genuine.** v0.1's was a client-side placeholder that the warning string itself flags as superseded.

### 3.2 Other v0.1 → v0.2 changes on this path

| Change | v0.1 | v0.2 |
| --- | --- | --- |
| `window.Shopify.customerPrivacy.config` support | absent (0 matches) | `consentDomain`, `storefrontAccessToken`, `isHeadless`, `injectedConsent` (`cta-v02.js:239-249`) |
| `backendConsentEnabled` / server-set cookies | absent | `U()` at `cta-v02.js:337-350` |
| Auth header when token is absent | header set to `undefined` (`cta-v01.js:980`) | header **omitted** (`cta-v02.js:725`) |
| Allowlist | 12 keys | 13 — adds `customerAccountRequestInfo` |
| `customerAccountRequestInfo` request override | absent | `cta-v02.js:694-696` |
| `localhost` / `127.0.0.1` over `http:` | absent | `cta-v02.js:720` |
| Error object | `{error}` | `{error, statusCode}` (`cta-v02.js:802-809`) |
| Node.js guard | absent | throws (`cta-v02.js:817-820`) |

### 3.3 What the record says

- **The docs are stale, and stale in a specific way.** https://shopify.dev/docs/api/customer-privacy (2026-08-15) still instructs `{ name: 'consent-tracking-api', version: '0.1' }` and the `v0.1` CDN URL. Its custom-storefront example passes all four keys, and it asserts: *"Our consent API will contact Shopify servers to manage consent using the Storefront API which needs a Storefront API token."* That sentence is **false of v0.2 against a same-origin proxy** — §2.3 shows the server serves the query tokenless and rejects a wrong token. Notably, the docs never use the word "required" for any of the four keys.
- **The v0.1 → v0.2 bump is PR [#3309](https://github.com/Shopify/hydrogen/pull/3309)**, "🍪 Hydrogen Cookie Migration for New Shopify Cookie Architecture", merged 2025-12-11. Its commit message contains the sub-commits *"Upgrade consent-tracking-api to v0.2"*, *"Add internal proxy to SFAPI"*, *"Use new proxy to get consent in same-origin"*, *"Signal that sfapi-proxy is enabled to the browser and use it for consent"*, and *"Avoid passing storefront token from server config"* — the whole design in five lines.
- **PR [#3649](https://github.com/Shopify/hydrogen/pull/3649)** (merged 2026-04-09) made the proxy mandatory: *"this flag is only safe to set when the SF API proxy is guaranteed to exist. Making the proxy mandatory fulfills that guarantee"*, and *"Convert the missing-storefront warning to a thrown error, since the proxy is mandatory and a missing storefront means consent writes would silently fail."*
- **PR [#3750](https://github.com/Shopify/hydrogen/pull/3750)** (opened 2026-04-28, **not merged**) is the clearest statement of the rationale: *"Omits `storefrontRootDomain` entirely when `hasSfapiProxy` is true … so consent-tracking-api falls back to `window.location.host`. Both consent fetches now route through Hydrogen's mandatory same-origin SFAPI proxy"*, and *"even with a well-formed value, that second request typically targets the registrable root (e.g. `example.com`) which usually isn't in a merchant's CSP `connect-src` and doesn't host an SFAPI."* Preview has arrived at that end-state by a different route (setting `consentDomain` rather than omitting keys). `[The link between #3750 and preview's implementation is inference — no commit connects them.]`
- **No changelog or release note records the tokenless mode.** `references/hydrogen/packages/hydrogen/CHANGELOG.md` has zero consent/privacy matches, and no `.changeset/` entry relates to consent. The origin commit for preview's `consent-script.ts` is not recoverable: the file has only two commits on `preview`, first appearing in the bulk vendor drop PR #3886 (2026-07-30).
- **Classic reaches the same host by the opposite route.** `Shopify/hydrogen@main`, `packages/hydrogen/src/customer-privacy/ShopifyCustomerPrivacy.tsx:199-220`: `const sfapiDomain = hasSfapiProxy && typeof window !== 'undefined' ? window.location.host : checkoutDomain;` then `checkoutRootDomain: sfapiDomain`. So classic *also* targets `window.location.host` when the proxy exists — it just computes it in application code and passes it explicitly, and still forwards `storefrontAccessToken`. **The divergence is mechanism, not destination.**

---

## 4. Failure mode when the call cannot complete

### 4.1 At the library layer: an error, not a silent no-op

`An`'s tail (`cta-v02.js:802-809`), verbatim in **Appendix A.3**:

```js
Promise.race(requests).catch((err) => {
  const result = { error: "Error while setting storefront API consent: " + err.message };
  if (err.cause?.status !== undefined) result.statusCode = err.cause.status;
  if (callback === undefined) throw result;   // no callback → throw
  callback(result);                            // callback → first arg carries .error
});
```

Three distinct failures all land here:

| Failure | Path | What the caller sees |
| --- | --- | --- |
| Non-2xx (e.g. proxy not wired → 404/500) | `cta-v02.js:741-747` throws `Error("Server error")` with `cause.status` | `{error: "…Server error", statusCode: 404}` |
| Network / CORS | `fetch` rejects (`cta-v02.js:736-740`) | `{error: "…<network message>"}` |
| HTTP 200 with GraphQL `errors` and no `data` | `response.data.consentManagement` throws `TypeError` | `{error: "…Cannot read properties of undefined…"}` |

The third is worth calling out: v0.2 never inspects a GraphQL `errors` array, so a 200-with-errors surfaces as a `TypeError` message rather than the server's actual complaint. Debuggable, but misleading.

**This is not a silent no-op.** The callback convention is `(err, result)`; preview's single-parameter `(result) => { if (result?.error) … }` (`references/hydrogen/packages/hydrogen/src/core/shopify-scripts/consent-script.ts:59-66`) reads the first argument, which is `null` on success and the error object on failure. It works correctly in both directions.

### 4.2 At Hydrogen's layer: indefinite buffering — the real hazard

Preview's error branch logs and **returns without calling `markConsentReady()`**:

```ts
setTrackingConsent({ headlessStorefront: true }, (result) => {
  if (result?.error) {
    logConsentError("unable to request initial consent", result.error);
    return;                       // ← markConsentReady() is NOT called
  }
  markConsentReady();
});
```
— `references/hydrogen/packages/hydrogen/src/core/shopify-scripts/consent-script.ts:59-66`

`consentStatus` is seeded `"pending"` (`shopify-scripts/global.ts:128`) and only becomes `"loaded"` via `markConsentStatusLoaded` (`consent-script.ts:42-45`). The analytics gate returns `false` unless `consentStatus === "loaded"` (`references/hydrogen/packages/hydrogen/src/core/analytics/bus.ts:66-80`, wired as `canTrack` at `bus.ts:162`). Blocked events are buffered and replayed rather than dropped (`analytics/destination-manager.ts:58-95, 201-223`).

So a failed bootstrap means: **`consentStatus` stays `"pending"` forever, and every destination analytics event buffers indefinitely and is never delivered.** No banner is shown either, since `shouldShowBanner()` returns `false` with no consent state (§5.3). Symptom: a storefront that logs one `[hydrogen:error:consent]` line and then reports zero analytics, with no further signal.

That fails **closed** — the compliant direction. The `visitorConsentCollected` listener at `consent-script.ts:111` is a partial recovery: if the privacy banner is loaded and fires that event, `markConsentReady()` still runs. In `no-banner`/`custom-banner` mode with a broken proxy, nothing rescues it.

---

## 5. Do `storefront-banner.js` and `storefront/analytics/shopify.js` do their own consent checks?

**Answer to open question #7: the gate is double.** Preview is not weaker than classic here.

### 5.1 `storefront/analytics/shopify.js` — yes, twice

Its sourcemap is live and **current**: `assetVersionId: "0.0.1+15ac9e737bdfeda1b5864996ec1a2390397f701b"`, and every source-unique string (`shopify:error:analytics`, `hasUserConsent`, `analytics_allowed`, `sale_of_data_allowed`) is present in the minified bundle. The excerpts below are original TypeScript from `sourcesContent`, not deminified output.

**Gate 1** — `src/shopify-analytics.ts:62-70`: if the consent API is not on `window`, no payload is built at all.

```ts
const customerPrivacy = getCustomerPrivacy();
if (!customerPrivacy) return;
…
const analyticsAllowed  = customerPrivacy.analyticsProcessingAllowed();
const marketingAllowed  = customerPrivacy.marketingAllowed();
const saleOfDataAllowed = customerPrivacy.saleOfDataAllowed();
return { …, hasUserConsent: analyticsAllowed, analyticsAllowed, marketingAllowed, saleOfDataAllowed,
         ccpaEnforced: !saleOfDataAllowed, gdprEnforced: !(marketingAllowed && analyticsAllowed) };
```

**Gate 2** — `src/utils/monorail.ts:294-300`, the send path:

```ts
export function sendShopifyAnalytics(event: ShopifyAnalyticsEvent, shopDomain?: string): Promise<void> {
  const { eventName, payload } = event;
  if (!payload.hasUserConsent) return Promise.resolve();
  …
}
```

Present verbatim in the shipped bundle as `function R(e,t){let{eventName:n,payload:r}=e;if(!r.hasUserConsent)return Promise.resolve();…}`. Only the `analytics` purpose gates; the other three ride along as payload fields (`analytics_allowed`, `marketing_allowed`, `sale_of_data_allowed` at `monorail.ts:169-171`), consistent with `shopify-consent.md` §9 open question #3.

### 5.2 `storefront-banner.js` — it collects consent, it does not gate

The banner is a consent *collector*, not a gate. Two findings matter anyway:

- **It bundles its own complete copy of consent-tracking-api v0.2** (`banner.pretty.js:659`, `const Bn = "v0.2"`), including `setTrackingConsent`, `shouldShowBanner`, and the identical validation strings — and `wt()` (`banner.pretty.js:3776-3782`) installs it onto `window.Shopify.customerPrivacy` when that global is missing or has ≤1 key. Loading both scripts can therefore trip v0.2's own *"Multiple versions of Shopify.trackingConsent or Shopify.customerPrivacy loaded"* warning (`cta-v02.js:1156`). Preview loads **either** the consent script **or** the banner, never both (`references/hydrogen/packages/hydrogen/src/core/shopify-scripts/index.ts:145-157`), so this is a hazard for anyone who wires them independently.
- **Its own submit path is the classic shape.** `ke(n)` (`banner.pretty.js:1087-1101`) only sets `headlessStorefront` when there is **no** `config` *and* a `storefrontAccessToken` is supplied; otherwise it submits the four purposes alone. When `config.consentDomain` is set — preview's case — `loadBanner` uses it for both root domains (`banner.pretty.js:3683-3692`).

### 5.3 The important qualifier: double in mechanism, single in source of truth — and one half fails open

Both gates ultimately call `analyticsProcessingAllowed()` on the same `window.Shopify.customerPrivacy`, which resolves the same `_tracking_consent` state. And that function **fails open** (`cta-v02.js:594-599`):

```js
function en(purpose) {
  const consent = $();
  if (!consent || !consent.purposes) return true;   // ← no consent state ⇒ ALLOWED
  const value = consent.purposes[purpose];
  return typeof value !== "boolean" || value;
}
```

while `shouldShowBanner()` fails **closed** (`cta-v02.js:612-615`):

```js
function an() {
  const consent = $();
  return !!consent && typeof consent.display_banner === "boolean" && consent.display_banner;
}
```

**No consent state means "analytics allowed, and show no banner."** That combination is the compliance-relevant one. Preview is protected because *its* gate additionally requires `consentStatus === "loaded"` (§4.2) and so fails closed — but the CDN analytics script alone does not. **Anything that publishes to `window.Shopify.analytics` outside Hydrogen's bus is gated only by the fail-open check.** For solidifront, which would be writing that bus itself, this is the load-bearing detail: the fail-closed half is *Hydrogen's own code*, not Shopify's library.

---

## 6. Verdict, confidence, and what would falsify it

### 6.1 Verdict

**Supported by the shipped v0.2, and by design.** Preview's call is the client half of a coherent three-part design that Shopify built deliberately:

1. **v0.2** removed v0.1's client-only headless fake and routes headless consent through the real Storefront API (§3.1).
2. **Hydrogen** proxies `/api/(unstable|YYYY-MM)/graphql.json` same-origin, without injecting a token, and sets `config.consentDomain = window.location.host` so v0.2 targets it (§2.1, §2.2).
3. **Shopify's Storefront API** authenticates by origin and serves the `consentManagement` query tokenless — verified live on four origins — while rejecting a *wrong* token with 401 (§2.3).

Not undocumented, either — just documented **in the wrong place**. The mandatory same-origin proxy is stated at https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/consent (quoted in [`shopify-consent.md`](./shopify-consent.md) §6.2) and enforced by preview's own skill file. What is stale is https://shopify.dev/docs/api/customer-privacy, which still describes v0.1, still tells you to load the v0.1 script, and still says a Storefront API token is needed. **`shopify-consent.md` §9 open question #1 resolves to "supported"; the risk it flagged does not materialise.**

### 6.2 Confidence

**High**, with one honest gap.

- **Directly verified:** every claim in §1-§3 and §5 is read from shipped bytes pinned by SHA-256; §2.3's token claim is verified by live HTTP against four Shopify origins; §2.3's payload is verified by executing the shipped serializer.
- **Read but not executed:** §4.2's "buffers indefinitely" chain is traced through preview's source and tests, not observed in a browser.
- **Not observed:** a preview storefront performing the call end-to-end. `hydrogen.shop` is a live Hydrogen storefront (`powered-by: Shopify, Oxygen, Hydrogen`) but runs the **classic** line and returns HTTP 500 for every POST including `/`, so it has no SFAPI proxy route and could not serve as the test (Appendix B.2). No preview storefront with a wired proxy was available.

### 6.3 What would falsify it

1. A preview storefront with `handleShopifyRoutes` wired where the consent POST still fails. **Cheapest decisive test** — deploy the preview template, open devtools, look for `POST /api/unstable/graphql.json` and its status.
2. Shopify's Storefront API beginning to reject tokenless `consentManagement` from the shop's own origin. Would break every headless storefront on v0.2 at once; re-run Appendix B.1 to check.
3. A v0.3 appearing that reinstates a required-parameter check. Currently 404.
4. Evidence that origin-authenticated consent writes are honoured differently server-side than token-authenticated ones. Not observable from the client; would need a live store with a real consent decision, per `shopify-consent.md` §9 open question #9.

---

## 7. What this leaves solidifront to decide

These are new, raised by this research, and not covered by `shopify-consent.md` §9.

1. **The same-origin Storefront API proxy is not optional infrastructure — it is a consent dependency.** `shopify-consent.md` §6.2 listed it as REQUIRED for analytics *cookies*; this document shows the consent *bootstrap itself* fails without it, and fails into indefinite buffering. Solidifront must ship an `/api/(unstable|YYYY-MM)/graphql.json` proxy, matching `SFAPI_RE` exactly, before any consent work is meaningful. **This should probably be an ADR, not a task.**
2. **Do not forward a storefront access token on the consent path.** §2.3: tokenless is 200, wrong-token is 401. A solidifront design that "helpfully" attaches the configured token converts a working call into a hard failure whenever the token's scope is wrong. Shopify removed this on purpose ("Avoid passing storefront token from server config").
3. **Decide what happens when the consent bootstrap fails.** Preview buffers forever and emits one log line. That is compliant but operationally invisible. Solidifront has an Effect-native option Hydrogen does not: model bootstrap failure as a typed error with a retry schedule, and expose consent status as observable state rather than a `window` string. Silence for a compliance-critical dependency is a poor default.
4. **`setTrackingConsent` is misnamed for this use, and solidifront should not reproduce the confusion.** `{headlessStorefront: true}` sends `visitorConsent:{}` and sets nothing (§2.3). If solidifront exposes an Effect service, the read/bootstrap operation and the write operation should be **two distinct members**, not one function distinguished by payload shape.
5. **`analyticsProcessingAllowed()` fails open; plan for it.** §5.3. Any solidifront gate must require positive evidence that consent state was loaded — Hydrogen's `consentStatus === "loaded"` idiom — rather than trusting the library's own default.
6. **Decide the banner/consent-script exclusivity rule explicitly.** `storefront-banner.js` embeds a full v0.2 and installs it on `window` (§5.2). Loading both is a real collision that Shopify's library only warns about. Preview enforces either/or in one `if`; solidifront should make it unrepresentable.
7. **Pin, hash, and monitor the CDN scripts.** `v0.2` is a mutable URL with no sourcemap, no changelog, and no version negotiation — and v0.1's *stale sourcemap* (§3.0) shows Shopify does redeploy under a fixed version path. The SHA-256 table at the top of this document is the only reproducibility mechanism available. Consider a CI check that re-fetches and diffs.

---

## Appendix A — verbatim excerpts

Reproduce with:

```
curl -sO https://cdn.shopify.com/shopifycloud/consent-tracking-api/v0.2/consent-tracking-api.js
npx prettier@3 --parser babel consent-tracking-api.js > v02.pretty.js
```

### A.1 — v0.2 `setTrackingConsent` validation (`cta-v02.js:812-865`)

```js
  const gn = [u.MARKETING, u.ANALYTICS, u.PREFERENCES, u.SALE_OF_DATA],
    yn = [...gn, u.EMAIL, d, f, E, p, l, A, g, y],
    hn = gn.map((n) => '"'.concat(n, '"')).join(", "),
    vn = "https://shopify.dev/docs/api/customer-privacy";
  function Cn(n, t) {
    if (m())
      throw new Error(
        "setTrackingConsent is not supported in Node.js environments. This function requires browser APIs (XHR, cookies, window) and can only be called client-side.",
      );
    const o = new k();
    if (
      (on() && o.produce("setTrackingConsent", un),
      (function (n) {
        if ("boolean" != typeof n && "object" != typeof n)
          throw new e(
            'setTrackingConsent received an invalid argument of type "'.concat(
              typeof n,
              '". ',
            ) +
              "Expected an object with consent keys. Example: setTrackingConsent({ analytics: true, marketing: false }). " +
              "See ".concat(vn, " for documentation."),
          );
        if ("object" == typeof n) {
          const t = Object.keys(n);
          if (0 === t.length)
            throw new e(
              "The submitted consent object is empty. " +
                "Expected at least one consent key: ".concat(hn, ". ") +
                "Example: setTrackingConsent({ analytics: true, marketing: false }). " +
                "See ".concat(vn, " for documentation."),
            );
          for (const n of t)
            if (!yn.includes(n))
              throw new e(
                'The submitted consent object contains an invalid key: "'.concat(
                  n,
                  '". ',
                ) +
                  "Valid keys are: ".concat(hn, ". ") +
                  "Example: setTrackingConsent({ analytics: true, marketing: false }). " +
                  "See ".concat(vn, " for documentation."),
              );
        }
      })(n),
      void 0 !== t && "function" != typeof t)
    )
      throw new e(
        'setTrackingConsent received an invalid callback of type "'.concat(
          typeof t,
          '". ',
        ) +
          "The second argument must be a function if provided. Example: setTrackingConsent({ analytics: true }, (error, result) => { ... }). " +
          "See ".concat(vn, " for documentation."),
      );
```

Constants (`cta-v02.js:33-49`): `a = {PREFERENCES:"p", ANALYTICS:"a", MARKETING:"m", SALE_OF_DATA:"t"}`, `u = {MARKETING:"marketing", ANALYTICS:"analytics", PREFERENCES:"preferences", SALE_OF_DATA:"sale_of_data", EMAIL:"email"}`, `l="headlessStorefront"`, `d="rootDomain"`, `f="checkoutRootDomain"`, `E="storefrontRootDomain"`, `p="storefrontAccessToken"`, `A="isExtensionToken"`, `g="metafields"`, `y="customerAccountRequestInfo"`.

### A.2 — v0.1's deleted client-only headless branch (`cta-v01.js:701-731`)

```js
  function le(e, t) {
    const r = new O();
    return (
      X() && r.produce("setTrackingConsent"),
      "object" == typeof e && e.headlessStorefront && !e.storefrontAccessToken
        ? (w.warn(
            "Headless consent has been updated. Please read shopify.dev/docs/api/customer-privacy to integrate.",
          ),
          r.produce("setTrackingConsent-Headless"),
          (function (e, n) {
            function t(e) {
              let n =
                arguments.length > 1 && void 0 !== arguments[1]
                  ? arguments[1]
                  : c.NO_VALUE;
              return !0 === e ? c.ACCEPTED : !1 === e ? c.DECLINED : n;
            }
            const r = {
                [s.ANALYTICS]: t(e[u.ANALYTICS], c.DECLINED),
                [s.MARKETING]: t(e[u.MARKETING], c.DECLINED),
                [s.PREFERENCES]: t(e[u.PREFERENCES], c.DECLINED),
                [s.SALE_OF_DATA]: t(e[u.SALE_OF_DATA]),
              },
              i = { v: o, reg: "", con: { CMP: r } },
              a = encodeURIComponent(JSON.stringify(i));
            return (
              P(j, e.rootDomain, G, a),
              n(null),
              new Promise((e, n) => {})
            );
          })(e, t || (() => {})))
        : (function (e, t) {
```

`c.DECLINED === "0"` (`cta-v01.js` consent-value enum); `P` is the cookie setter; `j === "_tracking_consent"`; `G` is one year in ms.

### A.3 — v0.2 request construction and error path (`cta-v02.js:690-748`, `749-811`)

```js
  function pn(n, e) {
    const t = e.granular_consent;
    let o = "",
      r = {};
    if (t.customerAccountRequestInfo)
      ((o = t.customerAccountRequestInfo.url),
        (r = t.customerAccountRequestInfo.headers));
    else {
      const e =
          t.storefrontAccessToken ||
          O().storefrontAccessToken ||
          (function () {
            try {
              const n =
                  document.documentElement.querySelector("#shopify-features"),
                e = "Could not find liquid access token";
              if (!n) return void T.warn(e);
              const t = n.textContent;
              if (!t) return void T.warn(e);
              let o;
              try {
                o = JSON.parse(t).accessToken;
              } catch (n) {
                return void T.warn(e);
              }
              return o || void T.warn(e);
            } catch (n) {
              return void T.warn("Could not find liquid access token");
            }
          })(),
        i = /^(localhost|127\.0\.0\.1)(:|$)/.test(n) ? "http:" : "https:";
      o = "".concat(i, "//").concat(n, "/api/unstable/graphql.json");
      const c = t.isExtensionToken
        ? "Shopify-Storefront-Extension-Token"
        : "x-shopify-storefront-access-token";
      r = e ? { [c]: e } : {};
    }
    const i = {
      headers: C(
        C({ "content-type": "application/json" }, r),
        _() ? { "x-test-payload": JSON.stringify(e) } : {},
      ),
      body: JSON.stringify(En(e)),
      method: "POST",
    };
    let c;
    try {
      c = fetch(o, i);
    } catch (n) {
      c = Promise.reject(n);
    }
    return c.then((n) => {
      if (n.ok) return n.json();
      {
        const e = new Error("Server error");
        throw ((e.cause = { status: n.status }), e);
      }
    });
  }
  function An(n, e, t) {
    const o =
      O().consentDomain ||
      e.granular_consent.checkoutRootDomain ||
      window.location.host;
```

and the tail:

```js
      Promise.race(r).catch((n) => {
        var e;
        const o = "Error while setting storefront API consent: " + n.message,
          r = null === (e = n.cause) || void 0 === e ? void 0 : e.status,
          i = { error: o };
        if ((void 0 !== r && (i.statusCode = r), void 0 === t)) throw i;
        t(i);
      })
```

with the cookie-write predicate (`cta-v02.js:779-788`):

```js
            (function (n) {
              return n.granular_consent.headlessStorefront;
            })(e) && !U())
          ) {
            const n = 31536e6,
              t = e.granular_consent,
              o = i || t.checkoutRootDomain || window.location.hostname,
              r = t.storefrontRootDomain || i || window.location.hostname;
            (R(D, o, n, c), r !== o && R(D, r, n, c));
          }
```

and `U` (`cta-v02.js:337-350`), `O` (`cta-v02.js:239-249`):

```js
  function U() {
    var n, e;
    const t = K();
    return (
      !0 ===
        (null == t ||
        null === (n = t.Shopify) ||
        void 0 === n ||
        null === (e = n.customerPrivacy) ||
        void 0 === e
          ? void 0
          : e.backendConsentEnabled) || !0 === O().isHeadless
    );
  }
  function O() {
    var n, e;
    return m()
      ? {}
      : (null === (n = window.Shopify) ||
        void 0 === n ||
        null === (e = n.customerPrivacy) ||
        void 0 === e
          ? void 0
          : e.config) || {};
  }
```

### A.4 — fail-open / fail-closed readers (`cta-v02.js:594-615`)

```js
  function en(n) {
    const e = $();
    if (!e || !e.purposes) return !0;
    const t = e.purposes[n];
    return "boolean" != typeof t || t;
  }
  function tn() { return en(a.PREFERENCES); }
  function on() { return en(a.ANALYTICS); }
  function rn() { return en(a.MARKETING); }
  function cn() { return en(a.SALE_OF_DATA); }
  function an() {
    const n = $();
    return !!n && "boolean" == typeof n.display_banner && n.display_banner;
  }
```

`on` is exported as `analyticsProcessingAllowed`, `an` as `shouldShowBanner` (`cta-v02.js:1093-1119`).

---

## Appendix B — live network probes (2026-08-15)

### B.1 — the tokenless consent query is served by origin

Body is the exact string v0.2 produces for `{headlessStorefront: true}` (§2.3), sent with **no** `x-shopify-storefront-access-token`:

```
POST https://<host>/api/unstable/graphql.json
content-type: application/json

{"query":"query { consentManagement { cookies(visitorConsent:{}) { trackingConsentCookie cookieDomain landingPageCookie origReferrerCookie } customerAccountUrl } }","variables":{}}
```

| Host | Kind | Status | Result |
| --- | --- | --- | --- |
| `supplystore2021.myshopify.com` | Shopify online store | **200** | `trackingConsentCookie: "3.AMPS_USWA_f_f_…"`, `cookieDomain: "supplystore2021.myshopify.com"` |
| `shopify.supply` | same shop, custom domain | **200** | same shape, `cookieDomain: "supplystore2021.myshopify.com"` |
| `checkout.hydrogen.shop` | Shopify-served checkout domain | **200** | `cookieDomain: "hydrogen.shop"` — the storefront root, i.e. exactly the headless hand-off |
| `mock.shop` | Shopify demo storefront | **200** | `cookieDomain: "fakestore-ai.myshopify.com"` |
| `hydrogen.shop` | Hydrogen app origin (classic) | **500** | `Unexpected Server Error` — see B.2 |

Decoding `3.AMPS_USWA_f_f_…` with v0.2's own parser (`cta-v02.js:483-537`): the consent segment before `.` is empty ⇒ all four purposes `NO_VALUE` (no interaction); the `AMPS` segment ⇒ `purposes` all `true`; `region: "USWA"`; `display_banner: false`; `sale_of_data_region: false`. A correct implied-consent result for a US visitor, produced with no token.

Auth behaviour on the same host:

| Request | Status | Body |
| --- | --- | --- |
| `{shop{name}}`, no token | **200** | `{"data":{"shop":{"name":"Shopify Supply"}}}` |
| `{shop{name}}`, token `0000…dead` | **401** | `{"errors":[{"message":"","extensions":{"code":"UNAUTHORIZED"}}]}` |

The exemption is **origin-based, not query-based**: the whole Storefront API answers unauthenticated from the shop's own storefront origin, and a present-but-invalid token is a hard failure.

`checkout.hydrogen.shop` also returns `access-control-allow-origin: https://hydrogen.shop` and `access-control-allow-credentials: true` for a request carrying `Origin: https://hydrogen.shop` — CORS is provisioned for the cross-domain variant of the same flow.

### B.2 — why `hydrogen.shop` could not serve as the end-to-end test

`hydrogen.shop` is a live Hydrogen storefront (`GET /` → 200; response header `powered-by: Shopify, Oxygen, Hydrogen`) running the **classic** line. It has no SFAPI proxy route:

| Request | Status |
| --- | --- |
| `GET /api/2026-07/graphql.json` | 404 (app 404 page) |
| `GET /definitely-not-a-route-xyz123` | 404 (app 404 page) |
| `POST /api/unstable/graphql.json` | 500 `Unexpected Server Error` |
| `POST /api/2026-07/graphql.json` | 500 `Unexpected Server Error` |
| `POST /` | 500 `Unexpected Server Error` |
| `POST /definitely-not-a-route-xyz123` | 500 `Unexpected Server Error` |

Every `POST` 500s regardless of path, so the 500 is a generic "no action for this route", not a proxy rejection. This says nothing about preview, whose proxy is a source-verified interceptor (§2.2) — it only means no public storefront was available on which to observe the complete flow.
