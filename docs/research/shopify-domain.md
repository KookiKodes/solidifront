# The Shopify commerce domain, and how Hydrogen solves it

Primary-source research for the `solidifront` restructure.

## Provenance

| Fact | Value |
| --- | --- |
| Research date | 2026-08-14 |
| `git -C references/hydrogen rev-parse HEAD` | `50b787462eae26b1a57664b16349b616ebaf2141` |
| Submodule branch | `preview` — the only branch fetched locally (`git branch -a` → `preview`, `remotes/origin/preview`; no tags) |
| HEAD commit | `2026-08-14 18:27:12 +0100` — "Fix optimistic cart line ordering (#3951)" |
| Package under study | `@shopify/hydrogen` **`2026.10.0-preview.0`** — `references/hydrogen/packages/hydrogen/package.json` |
| Package self-description | "Framework-agnostic Shopify storefront SDK and agent skills." |
| Storefront API version targeted | **`2026-04`** — `packages/hydrogen/src/core/constants.ts:1` |
| Customer Account API version targeted | **`2026-04`** — `packages/hydrogen/src/core/constants.ts:2` |
| Default request timeout | `DEFAULT_TIMEOUT_IN_MS = 30_000` — `src/core/constants.ts:3` |
| Shopify dev MCP default SFAPI version | `2026-04` |

All `src/...` paths below are relative to
`/home/kookikodes/dev/solid-js/solidifront/references/hydrogen/packages/hydrogen/`.

### There are two live Hydrogens right now

This is essential context and was not obvious going in.

| | **classic** | **preview** |
| --- | --- | --- |
| Branch | `Shopify/hydrogen@main` | `Shopify/hydrogen@preview` (the local submodule) |
| `@shopify/hydrogen` version | **2026.4.5** | **2026.10.0-preview.0** |
| Architecture | React Router framework, `hydrogen` + `hydrogen-react` packages | plain-JS `core/` + thin `react/` + `vue/` bindings |
| `SFAPI_VERSION` | `2026-04` (`packages/hydrogen-react/src/storefront-api-constants.ts`) | `2026-04` (`src/core/constants.ts:1`) |
| Customer API version | `2026-04` (`packages/hydrogen/src/customer/constants.ts`) | `2026-04` |
| Typegen | `@shopify/hydrogen-codegen` → `@shopify/graphql-codegen` | `gql.tada` type-level inference, no consumer codegen |
| Cart | `createCartHandler`, **21 methods**, `customMethods` | `createCartServerHandlers`, **8 operations**, fragment only |
| Status | shipping, documented on shopify.dev | "APIs will change and some pieces are still landing" |

Classic is **not** a legacy 2025.x line — it is current, actively released, and versioned in the same calendar
scheme. Preview is a parallel rewrite. Claims marked *classic* below are cited to `Shopify/hydrogen@main` paths
read via the GitHub API and to shopify.dev; claims marked *preview* are verified against local source.

**Where they differ, preview is sometimes behind** — notably cart coverage (§3.6) and `@inContext(visitorConsent:)`
(§6.3). Do not assume preview is a strict superset.

---

## 0. What this means for solidifront

### 0.1 The finding that reframes the restructure

Shopify has already done the restructure solidifront is contemplating, **and has already prototyped Solid.**

`references/hydrogen/README.md`:

> "The old Hydrogen was a framework you adopted whole. The new Hydrogen is a **toolkit** you bring to the
> framework you already use — a plain-JavaScript core of Shopify storefront primitives, with thin bindings for
> React and Vue (and more on the way). We redesigned it in partnership with the Next.js team at Vercel."

> "The parts of a storefront that change at runtime — cart contents, applied filters, the active market, search
> results — live in **observables**: a small, signals-style reactive model. You subscribe with a selector, and
> your code runs only when that slice changes. In React that's a hook; anywhere else it's `.subscribe()`."

The tree is `src/core/**` + `src/client/**` + `src/graphql/**` + `src/customer-account/**` (all
framework-agnostic), with `src/react/**` (7 files) and `src/vue/**` (7 files) as adapters. Verified by grep:
there are **zero** `import ... from "react"` statements anywhere in `src/core/**`, `src/client/**`, or
`src/customer-account/**`. The only React reference in core is a set of esm.sh URLs inside an HTML import-map
string in the dev-only GraphiQL page (`src/core/request-routing/interceptors/graphiql.ts:110-124`).

**And `references/hydrogen/examples/solid-start/` exists** — a full SolidStart v1 storefront (cart with
optimistic updates, collection filter/sort, product variant selection, Shop Pay, Customer Account OAuth, blogs)
built on core primitives with **no Solid binding package at all**. `examples/solid-start/README.md`, under
"Open questions", says verbatim:

> "**Framework bindings.** This example intentionally uses core primitives directly. If Solid bindings are
> added later, compare them against `src/lib/cart.tsx`, `src/components/CollectionBrowser.tsx`, and
> `src/components/ProductPurchasePanel.tsx`."

`examples/README.md` is equally explicit that examples "are not starter kits or supported templates" — only
`templates/react-router` and `templates/nextjs` ship. And `skills/hydrogen-analytics/references/` contains
only `react.md` and `vue.md`, no `solid.md`.

### 0.2 Decisions this forces

**1. Decide the relationship to Hydrogen preview: compete, wrap, or contribute.**
Solidifront's packages (`@solidifront/storefront-client`, `@solidifront/codegen`, `@solidifront/start`)
reimplement things Hydrogen preview now ships framework-agnostically. A Solid binding is *small* — the entire
React↔Vue delta is ~70 and ~96 lines for scripts, ~250 and ~245 for cart. Against that: preview is
pre-1.0 and self-described as unstable ("APIs will change and some pieces are still landing"), has no Effect
story, and has real gaps (below) that solidifront already fills.

**2. `@inContext` injection is solidifront's genuine, defensible lead. Keep it.**
Hydrogen does **not** inject the directive. The developer hand-writes
`@inContext(country: $country, language: $language)` into every document; the client injects only the
*variables*, gated on two regexes over the raw query text — `src/client/client.ts:44-45, 321-336`:
```ts
const COUNTRY_VAR_RE  = /\$country\s*:/;
const LANGUAGE_VAR_RE = /\$language\s*:/;

function buildVariables(queryText, userVariables, resolvedI18n) {
  const variables = { ...userVariables };
  if (COUNTRY_VAR_RE.test(queryText))  variables.country  = resolvedI18n.country;
  if (LANGUAGE_VAR_RE.test(queryText)) variables.language = resolvedI18n.language;
  return variables;
}
```
Hydrogen **never rewrites query text.** Solidifront already does: `packages/storefront-client/src/utils/
upsertInContextWithLocale.ts` parses, `visit()`s every `OperationDefinition`, upserts both the variable
definitions and the `@inContext` directive arguments, and re-prints — with siblings
`upsertInContextWithBuyer.ts` and `upsertInContextWithVisitorConsent.ts` behind an Effect `Context.Tag`
service (`packages/storefront-client/src/services/InContext.ts`) exposing pluggable
`getBuyerIdentity` / `getLocale` / `getVisitorConsent`.

That covers two `@inContext` arguments Hydrogen ignores entirely (§6.3), and it removes a *silent-failure*
class: if `@inContext` is omitted, Shopify falls back to the primary market and silently omits products
unpublished there — "Unpublished products will behave just like they were archived or deleted: they will be
omitted from connections and not found when queried by handle or ID"
(https://shopify.dev/docs/api/storefront/2026-04/queries/product). Forgetting the directive is a wrong-data
bug, not an error. Automatic injection is therefore not sugar; it is correctness.

Two costs to engineer around:
- Runtime `parse()` + `print()` per request versus two regex tests. **Move the transform to build time** (a Vite
  plugin over `gql()` call sites, or emit transformed documents from codegen). This is where solidifront's
  existing plugin/codegen investment pays for itself and is the strongest argument for not simply adopting
  Hydrogen preview.
- Rewriting the document changes the SFAPI cache key, because Hydrogen keys on the serialized request body
  (`client.ts:367-384`). That is *correct* — localized responses must not share an entry — but the transform
  must be deterministic (stable field/argument ordering) or the cache thrashes.

**3. Adopt "typegen without a consumer codegen step" — or consciously reject it.**
Hydrogen preview deleted `@shopify/hydrogen-codegen` from the consumer's build. Its entire runtime dependency
list is `{"gql.tada": "1.9.2"}`. `gql()` is a runtime identity function returning a branded string; all typing
is type-level inference against a bundled introspection type (§2.3). Solidifront's `@solidifront/codegen` is
already `"deprecated": true`, so this is half-decided. The open Effect question: Hydrogen does **zero** runtime
validation of response shape — an Effect `Schema` decode is a real improvement, at the cost of bundle size and
per-response CPU. Decide deliberately rather than by default.

**4. Cart: take the transaction model from preview, the operation surface from classic, and beat both on
extensibility.**
Preview's *only* first-party extension seam is "pass a fragment named `CartFragment` on `Cart`" — you cannot
override an operation, add an intent, or add a mutation. Classic's `customMethods` covers more but is
**literally a shallow object spread** with no access to the default it replaces
(`packages/hydrogen/src/cart/createCartHandler.ts:411-418`):
```ts
if ('customMethods' in options) {
  return { ...methods, ...(options.customMethods ?? {}) };
}
```
Neither is a real composition model. Preview's cart is the **correctness reference** (2,505 lines of source,
5,470 of test, for genuinely hard optimistic-transaction logic); classic's is the **completeness reference**
(21 methods vs 8). Solidifront should take both and beat them with an Effect `Layer` of cart operations
overridable by service substitution, where an override *can* delegate to the default because the default is a
value rather than a `switch` arm or a spread-away key. See §3.5–§3.6.

**5. Close the buyer-identity gap.** In *preview*, `buyerIdentity` appears **zero** times outside generated
schema `.d.ts` — no `cartBuyerIdentityUpdate`, no `@inContext(buyer:)`, no SFAPI `customerAccessToken`, no
Multipass. Classic *does* have this: `cart.updateBuyerIdentity`, plus `customerAccount.setBuyer()`/`getBuyer()`
whose result `cartCreateDefault` merges into `buyerIdentity` — the B2B path. So preview has **regressed** here,
and solidifront should follow classic rather than preview. Solidifront's `upsertInContextWithBuyer` already
covers the pricing half; `cartBuyerIdentityUpdate` plus a buyer store covers the cart half.

**6. Do not copy Hydrogen's locale resolution, because there is none.**
`skills/hydrogen-markets/SKILL.md:12`: "Markets are an application routing concern plus Storefront API
context. **Hydrogen does not prescribe how a storefront chooses a market.**" There is no locale-resolution code
anywhere in `core/` — no path parsing, no subdomain lookup, no cookie read, no `Accept-Language` parsing, no
`localization` query. Every example hardcodes `{country: "US", language: "EN", currency: "USD"}`.
Solidifront already ships more (`packages/start/src/middleware/createLocaleMiddleware.ts` +
`@solidifront/vite-plugin-generate-shopify-locales`). Keep it; make it optional; adopt Hydrogen's *shape*
(resolve once at the request boundary into a request-scoped context, never per query).

**7. Where copying Hydrogen would be actively wrong for a Solid/Effect library.**
- **`useSyncExternalStore` and its snapshot cache.** `src/react/cart.tsx:168-198` is a `useRef` cache keyed on
  `(state, selector)` identity, existing purely to give React a referentially stable `getSnapshot`. Solid needs
  none of it — `createSignal` + `store.subscribe` is ~15 lines, as `examples/solid-start/src/lib/cart.tsx`
  shows.
- **`reuseVisibleReferences` / `reuseLineReferences`** (`src/core/cart/cart.ts:448, 464`) exist to preserve
  object identity so React's `Object.is` bailout fires. Fine-grained Solid reactivity makes most of it
  unnecessary — but note it lives in `core/`, so a binding inherits it regardless.
- **Module-level mutable singletons.** `let cartEndpoint` appears in `src/react/cart.tsx:30`,
  `src/vue/cart.ts:30`, *and* behind `configureCartEndpoint` in core. `src/core/cart/cart.ts:305` holds
  `const connectedCartStores = new Set<CartStoreContext>()`. `src/core/shopify-scripts/page-view.ts:5`,
  `.../utils/navigation.ts:1-2`, `.../deprecated-cookies.ts:89`, `.../utils/tracking-values.ts:13`, and
  `src/core/utils/load-script.ts:6` all hold module-global mutable state. Global mutable config is exactly what
  Effect's `Layer`/`Context` exists to eliminate.
- **Throw-based errors.** Hydrogen's contract is "transport errors throw, GraphQL errors are returned". Effect's
  typed error channel (`Data.TaggedError`, already used in `services/InContext.ts`) is a better fit and should
  not be flattened into `throw`/`try`.
- **`"use client"`** at the top of `src/react/index.ts` and `src/react/cart.tsx` — meaningless in Solid.
- **`window.Shopify` as the analytics transport.** The bus is a hard singleton that *throws* on double
  initialization (`src/core/analytics/bus.ts:136-140`) and stores itself on `window.Shopify.analytics`. That is
  a deliberate constraint imposed by Shopify's CDN scripts, not a design choice to admire — but it *is*
  non-negotiable if you want Shopify Pixels to work. Wrap it; do not reproduce the pattern elsewhere.

**8. What is safe to reuse in spirit.** Everything in `src/client/**`, `src/graphql/**`,
`src/customer-account/**`, and `src/core/**` — SFAPI client, cache, request context, request routing, standard
routes, cart, analytics, shopify-scripts, money, product, collection, predictive-search, shop-pay. None import
React or Vue. The framework-coupled surface is exactly 14 files.

### 0.3 The domain checklist

Derived from `src/core/index.ts`, the most complete enumeration of the domain available. Solidifront currently
ships roughly rows 1, 2, and 6.

| # | Capability | Hydrogen preview export | Solidifront today |
| --- | --- | --- | --- |
| 1 | Storefront API client, 3 auth modes | `createStorefrontClient` | `@solidifront/storefront-client` |
| 2 | Typed GraphQL documents | `gql`, `StorefrontApi.ResultOf/VariablesOf`, `ts-plugin` | `@solidifront/codegen` (deprecated) |
| 3 | Sub-request caching (SWR, stale-if-error) | `Cache`, `createFetchWithCache`, `createRunWithCache` | — |
| 4 | Per-request context (headers, i18n, abort, cache policy, tracking tokens) | `createShopifyRequestContext` | partial (`createStorefrontMiddleware`) |
| 5 | Cart: server handlers + optimistic store + form protocol | `createCartServerHandlers`, `createCartStore`, `createCartFormRegister`, `parseCartRequest`, `createCartCookie` | — |
| 6 | Localization / markets context | `I18nConfig` on request context | `createLocaleMiddleware` + locales plugin (**ahead of Hydrogen**) |
| 7 | Customer Account OAuth + session + client | `@shopify/hydrogen/customer-account` | — |
| 8 | Analytics event bus + destinations + consent | `AnalyticsEvent`, `trackCartAnalytics`, `getShopifyScriptTags` | — |
| 9 | Shopify-owned request routes (checkout, cart permalinks, `/cart.js`, SFAPI proxy, `/admin`, URL redirects, GraphiQL, MCP/agent) | `handleShopifyRoutes`, `handleShopifyRedirects` | — |
| 10 | Money formatting | `formatMoney` | — |
| 11 | Product variant/option selection state | `createProductFormStore`, `getSelectedProductOptions` | — |
| 12 | Collection filter/sort state + URL serialization | `createCollectionStore`, `parseCollectionParams` | — |
| 13 | Predictive search | `createPredictiveSearchStore`, `createPredictiveSearchServerHandlers` | — |
| 14 | Shop Pay | `createShopPayButton`, `loadShopJs` | — |
| 15 | Structured logging | `configureLogging` | — |

Rows 9, 11, 12, 13, 14 are what a from-scratch storefront reliably gets wrong. Row 9 especially: cart
permalinks, `/cart.js`, and `/checkout` are hit by installed apps and marketing links, and a storefront that
404s them looks broken in ways nobody attributes to the framework.

---

## 1. Storefront API client

### 1.1 What the domain requires

POST GraphQL to `https://{shop}.myshopify.com/api/{version}/graphql.json`. Three auth postures, because Shopify
rate-limits and attributes traffic differently: public token (browser-safe), private token + trusted buyer IP
(SSR), private token without buyer identity (background). Tokenless access exists but cannot read token-gated
fields — "product tags, metaobjects, metafields, menus, and customers"
(`src/client/client.ts:84-86`). Forward buyer-identity headers for attribution and abuse controls. Localization
context on every query. Sub-request caching with SWR, keyed so personalized responses never cross buyers.
Partial-success handling: GraphQL returns `200` with `errors` and possibly partial `data`. Quarterly versioning
with the ability to pin and to route some queries to `unstable`.

### 1.2 Hydrogen preview implementation

`src/client/client.ts` (384 lines), types in `src/client/types.ts` (238 lines).

**Construction.** `createStorefrontClient({type, requestContext, config})` (`client.ts:90-320`).
`ClientType = "public" | "private" | "private_no_buyer_context"` (`types.ts:192-198`).
`CreateStorefrontClientArgs` (`types.ts:133-152`) is a discriminated union whose `private` arm *requires*
`requestContext: RequestContext & ShopifyRequestContextWithBuyerIp` — buyer IP is enforced by the type system
and re-checked at runtime (`client.ts:171-177` throws `TypeError`). Private tokens are refused in a browser at
construction (`client.ts:144-148`, `typeof document !== "undefined"`).

**API versioning.** `config.apiVersion ?? STOREFRONT_API_VERSION` (`client.ts:115`). The documented escape hatch
for `unstable` is a *second client instance* (`types.ts:59-66`), with the key caveat spelled out there:
"Hydrogen's bundled gql.tada schema still controls type inference, so queries against fields outside that
schema need their own typing." **Types are pinned to the bundled schema, not to `apiVersion`.** A version bump
is a package bump.

**Headers.** Static: `content-type` plus one token header. Request-scoped:
`requestContext.applyStorefrontRequestHeaders(requestHeaders)` (`client.ts:169`), which per
`src/core/request-context.ts:255-276` sets `X-SDK-Variant: hydrogen`, `X-SDK-Variant-Source: kit`,
`X-SDK-Version: 2026-04`, `X-Hydrogen-Version`, the request-group ID, `cookie`,
`Sec-Shopify-Storefront-Origin`, `X-Shopify-UniqueToken`, `X-Shopify-VisitToken`, and legacy
`Shopify-Storefront-Y`/`-S`.

**Caching.** `config.cache: CacheInstance = WebCacheLike | KeyValueCacheLike`
(`src/core/cache/run-with-cache.ts:15`, shapes at `src/core/cache/store.ts:21-45`) — Web Cache API *or* any KV
store. Strategies (`src/core/cache/strategies.ts`): `Cache({mode, maxAge, staleWhileRevalidate, staleIfError})`,
`Cache.none()`, `Cache.short()` (`maxAge: 1, swr: 9`), `Cache.long()` (`maxAge: 3600, swr: 82800`). Durations
accept `{seconds, minutes, hours, days}`.

Three guards worth stealing verbatim:
- Cache options rejected unless a cache instance was configured (`client.ts:196-200`).
- `mode: "private"` explicitly unsupported, throwing with a pointer to `createRunWithCache`
  (`client.ts:202-206`).
- Mutations never cached, enforced twice: at runtime `if (/\bmutation\b/.test(queryText)) return undefined;`
  (`client.ts:351`) *and* at the type level — `GraphqlExtraOptionsForDoc` (`types.ts:31-32`) strips the `cache`
  key unless the document's inferred operation kind is `"query"`.

The cache key (`client.ts:367-384`) is `["storefront-api", apiUrl, method, body, headers]` where headers pass an
**allowlist minus an identity denylist**: `REQUEST_CACHE_KEY_HEADERS` (`client.ts:46-55`) minus
`REQUEST_IDENTITY_HEADERS` (`client.ts:56-64`, containing `cookie`, buyer IP, and all four tracking headers).
That partition is the mechanism preventing per-buyer leakage. `shouldCacheResponse` additionally refuses any
body containing `errors` (`client.ts:356-363`).

**Error handling.** Transport errors throw; GraphQL errors are returned.
- `StorefrontApiError` for non-2xx, network failure, non-JSON body, or wrong JSON root
  (`client.ts:252-294`), carrying `{status, requestId, queryText, variables, cause}`.
  `toJSON()` strips dev-only fields (`queryText`, `variables`, `stack`) so it is safe for error reporters.
- `StorefrontTimeoutError` subclass from `AbortSignal.timeout(timeoutInMs)` (`client.ts:227-230, 265-271`).
  `timeoutInMs === 0` disables.
- `AbortError` propagates untouched (`client.ts:272-274`).
- `requestContext.signal`, per-call `signal`, and the timeout combine via `AbortSignal.any` (`client.ts:237`),
  with an early-abort fast path (`client.ts:213-219`).
- `x-request-id` captured (`client.ts:249`) and carried on errors.

The return type encodes the GraphQL spec guarantee (`types.ts:183-185`):
```ts
export type StorefrontGraphqlResult<Doc extends DocLike> =
  | { data: ResultOfDoc<Doc>; errors?: undefined; headers: Headers }
  | { data: ResultOfDoc<Doc> | null; errors: GraphQLFormattedError[]; headers: Headers };
```
Narrowing on `if (errors)` yields a non-null fully-typed `data` in the else branch. Raw `headers` are always
returned. Response headers feed back into the request context **only on a cache miss** (`client.ts:244-247`) —
a cache hit must not re-emit another buyer's `Set-Cookie`.

### 1.3 Classic, for contrast

`Shopify/hydrogen@main:packages/hydrogen/src/storefront.ts`.
`createStorefrontClient<TI18n>(options): {storefront: Storefront<TI18n>}`. Options split across
`HydrogenClientProps` (`storefrontHeaders?`, `cache?`, `storefrontId?`, `waitUntil?`, `i18n?`, `logErrors?`) and
`StorefrontClientProps` (`storeDomain?`, `privateStorefrontToken?`, `publicStorefrontToken?`,
`storefrontApiVersion? = SFAPI_VERSION`, `contentType?`).

Notable differences from preview:
- **No `type` discriminant.** Token choice is implicit:
  `const getHeaders = clientOptions.privateStorefrontToken ? getPrivateTokenHeaders : getPublicTokenHeaders;`
  Preview's explicit three-way `ClientType` is the better design.
- Buyer context is nested in `storefrontHeaders: {requestGroupId, buyerIp, buyerIpSig, cookie, purpose}`
  (`packages/hydrogen/src/types.d.ts`), populated by `getStorefrontHeaders(request)`. Headers are
  `X-Shopify-Client-IP`, `X-Shopify-Client-IP-Sig`, `Custom-Storefront-Request-Group-ID`. Note preview renamed
  the buyer-IP header to `Shopify-Storefront-Buyer-IP` and dropped the signature.
- Returns `{query, mutate, cache, CacheNone, CacheLong, CacheShort, CacheCustom, generateCacheControlHeader,
  getPublicTokenHeaders, getPrivateTokenHeaders, getHeaders, getShopifyDomain, getApiUrl, i18n,
  isStorefrontApiUrl, forward, isMcpUrl, forwardMcp, setCollectedSubrequestHeaders}`.
  (It is `getApiUrl`, not `getStorefrontApiUrl` — that is the `hydrogen-react` name.)
- **`@inContext` uses the same regex trick**, confirmed at `storefront.ts:371-379`:
  ```ts
  if (i18n) {
    if (!variables?.country  && /\$country/.test(document))  queryVariables.country  = i18n.country;
    if (!variables?.language && /\$language/.test(document)) queryVariables.language = i18n.language;
  }
  ```
  Two differences from preview: the regex is looser (`/\$country/`, not `/\$country\s*:/`), and **classic
  honours caller-supplied variables** (`!variables?.country`), which is the precedence preview's docs claim but
  its source contradicts (§7.2).
- The cart layer builds directives programmatically instead
  (`packages/hydrogen/src/cart/queries/cart-query-helpers.ts`), and **includes `visitorConsent`**:
  ```ts
  getInContextDirective(includeVisitorConsent) =>
    includeVisitorConsent
      ? '@inContext(country: $country, language: $language, visitorConsent: $visitorConsent)'
      : '@inContext(country: $country, language: $language)';
  ```
  Also note `$country: CountryCode = ZZ` — a default value preview omits.
- Queries pass through `minifyQuery()` + `assertQuery()`/`assertMutation()` (`src/utils/graphql.ts`) before
  fetch; the cache key is `[url, method, cacheKeyHeader, body]` and mutations bypass the cache instance
  entirely (`cacheInstance: mutation ? undefined : cache`) — the same guarantee preview enforces with a regex
  plus a type-level strip.

### 1.4 Extension seams

`config.fetch` (also the documented testing seam), `config.cache` + `config.waitUntil`, `config.apiVersion`,
`config.defaultTimeoutInMs`, and `requestContext` — which is the real seam, since everything request-scoped
funnels through it (§6.1). There is **no** middleware chain on the GraphQL client, no response transform hook,
and no retry policy; `extensions.code === "THROTTLED"` retry is documented as the caller's job.

**For solidifront:** an Effect `StorefrontClient` service with `Layer`s for cache, fetch, retry
(`Schedule.exponential` on `THROTTLED`), and the `InContext` resolvers is a strictly richer shape, and
`packages/storefront-client/src/services/` already has the skeleton. Import verbatim: the **cache-key header
partitioning** and the **mutation-never-cached double guard**.

---

## 2. Type generation

### 2.1 What the domain requires

The Storefront schema is ~1 MB of introspection and moves quarterly. A storefront library must give callers
`ResultOf<Query>` / `VariablesOf<Query>` without hand-written types, without shipping the schema to the browser,
and ideally without a codegen step the developer must remember to re-run.

### 2.2 Classic: `@shopify/hydrogen-codegen`

`@shopify/hydrogen-codegen` (v0.3.3) is now a **thin wrapper** — four files, ~145 LOC — delegating to a separate
package **`@shopify/graphql-codegen`** (repo `Shopify/graphql-codegen`). Its whole index re-exports
`preset`, `getSchema`, `pluckConfig`, `plugin`, `processSources`, and the `Client*` type helpers.

**The `#graphql` tag** is a customized `graphql-tag-pluck` config (`Shopify/graphql-codegen/src/pluck.ts`):
`isGqlTemplateLiteral` returns true when the first quasi matches `/\s*#graphql\s*\n/i` (or a `/* GraphQL */`
leading comment). Crucially `pluckStringFromFile` does **not** strip `${FRAGMENT}` interpolations — it rewrites
them to `#REQUIRED_VAR=FRAGMENT` annotations that `normalizeOperation()` later inlines, so the generated map key
matches the *fully-expanded runtime string*.

**The interface-merging trick** (`Shopify/graphql-codegen/src/plugin.ts`) emits two interfaces keyed by the
literal query string:
```ts
export const GENERATED_QUERY_INTERFACE_NAME = 'GeneratedQueryTypes';
export const GENERATED_MUTATION_INTERFACE_NAME = 'GeneratedMutationTypes';
// entries look like:
//   "#graphql\n  query Product(...)": {return: ProductQuery, variables: ProductQueryVariables},
```
Query/mutation bucketing is itself a regex: `/(^|}\s|\n\s*)mutation[\s({]/im`.
`packages/hydrogen-codegen/src/defaults.ts` appends the module augmentation, choosing SFAPI vs CAAPI **by output
filename**: `/(customer|caapi\.)/i.test(outputFile)`.

> **Correction to a common assumption:** the merged interfaces are **`StorefrontQueries` / `StorefrontMutations`**
> (declared empty at `packages/hydrogen/src/storefront.ts:99-110`) and `CustomerAccountQueries` /
> `CustomerAccountMutations` (`src/customer/types.ts:43-51`). There is no `AllQueries`/`AllMutations`.

Emitted files: `storefrontapi.generated.d.ts` and `customer-accountapi.generated.d.ts` in the app root, ending
in `declare module '@shopify/hydrogen' { interface StorefrontQueries extends GeneratedQueryTypes {} ... }`.

**How typed queries reach the caller** (`storefront.ts:127-141`):
```ts
query: <OverrideReturnType extends any = never, RawGqlString extends string = string>(
  query: RawGqlString,
  ...options: ClientVariablesInRestParams<
    StorefrontQueries, RawGqlString,
    StorefrontCommonExtraParams & Pick<StorefrontQueryOptions, 'cache'>,
    AutoAddedVariableNames                       // 'country' | 'language'
  >
) => Promise<ClientReturn<StorefrontQueries, RawGqlString, OverrideReturnType> & StorefrontError>;
```
`ClientReturn` is a literal-string index:
`RawGqlString extends keyof GeneratedOperations ? GeneratedOperations[RawGqlString]['return'] : any`.
`AutoAddedVariableNames = 'country' | 'language'` makes `variables` optional for i18n-only queries — the exact
type-level mirror of the runtime injection, and the same idea preview expresses as `UserVariables<Doc>`.

Config now lives in `templates/skeleton/.graphqlrc.ts` (graphql-config, two projects), not a `codegen.ts`; the
Hydrogen CLI's `h2 codegen` wires the preset. `getSchema(api)` is just
`require.resolve('@shopify/hydrogen/${api}.schema.json')` — the same "ship the schema in the package" move
preview makes.

**The comparison that matters for solidifront.** Both designs key types off the *literal source string*.
Classic pays for it with a generated file the developer must regenerate and commit; preview pays for it with a
480-line type-level GraphQL executor and a TS plugin. Both are therefore equally unable to inject a directive at
runtime without desynchronizing types — which is precisely the constraint solidifront escapes by transforming at
**build** time (§2.4).

### 2.3 Preview: no consumer codegen at all

The single biggest change in the rewrite, and the one most directly relevant to solidifront.

Entire runtime dependency list of the package:
```json
"dependencies": { "gql.tada": "1.9.2" }
```

`gql()` is a runtime **identity function that concatenates strings** (`src/graphql/graphql.ts:94-108`):
```ts
export const gql = ((source: string, fragments?: Array<string>) => {
  let query = source;
  if (fragments) {
    const seen = new Set<string>();
    for (const fragment of fragments) {
      if (!seen.has(fragment)) { seen.add(fragment); query += "\n" + fragment; }
    }
  }
  return query;
}) as unknown as StorefrontGql;
```

Typing is a phantom brand on that string (`src/graphql/graphql.ts:24-32`):
```ts
export type StorefrontQueryString<Result = any, Variables = any, Source extends string = string> =
  string & DocumentDecoration<Result, Variables> & {
    readonly __hydrogenQueryBrand: true;
    readonly __hydrogenQuerySource?: Source;
  };
```
The doc comment is pointed: *"Honest about being a `string` at runtime (unlike `TadaDocumentNode` which claims
to be an AST)."* `__hydrogenQuerySource` preserves the **literal** source at the type level, which is what makes
fragment composition type-check (`ComposedSource`, `FragmentSources`, `graphql.ts:42-57`).

`src/graphql/type-resolver.ts` (480 lines) is a type-level GraphQL executor: it uses `gql.tada`'s exported
`parseDocument<T>` to parse the literal string *type* into an AST *type*, then walks it against a generated
introspection *type* (`src/graphql/generated/graphql-env.d.ts`) to compute `InferResult<S>` /
`InferVariables<S>` — deliberately avoiding gql.tada internals (file header, `type-resolver.ts:1-8`). It handles
NON_NULL/LIST unwrapping, aliases, `@include`/`@skip`/`@defer` conditionality, and `@required`/`@optional`
(`type-resolver.ts:80-140`). It also exports `InferOperationKind<Source>`, used to make `cache` a type error on
mutations.

**Codegen still runs — inside the Hydrogen package, at publish time.** `packages/hydrogen/codegen.ts` emits four
committed artifacts into `src/graphql/generated/`: `storefront-api-types.d.ts`, `storefront.schema.json`,
`customer-account-api-types.d.ts`, `customer-account.schema.json`. Config: `enumsAsTypes: true`,
`defaultScalarType: "string"`, `useTypeImports: true`, and a scalar map (`src/graphql/scalars.ts`) collapsing
every custom scalar (`Color`, `DateTime`, `Decimal`, `HTML`, `JSON`, `URL`, `UnsignedInt64`; CAAPI adds
`BigInt`, `ISO8601DateTime`) to `string`. The Customer Account schema is introspected live from
`https://app.myshopify.com/services/graphql/introspection/customer?api_client_api_key={PUBLIC_ID}&api_version=2026-04`.
`package.json`'s `codegen` script then runs `gql.tada generate-output`.

**Editor + CI ergonomics replace the consumer codegen step:**
- `@shopify/hydrogen/ts-plugin` (`src/ts-plugin/index.ts`, 23 lines) wraps `gql.tada/ts-plugin` and injects the
  packaged schemas via `createGraphQLPluginConfig` (`src/graphql/plugin-config.ts`), registering two named
  schemas, `storefront` and `customer-account`. One line in `tsconfig.json`. It writes
  `storefront-graphql-env.d.ts` and `customer-account-graphql-env.d.ts` at the project root (gitignore them).
- `npx @shopify/hydrogen gql check --fail-on-warn` (`src/cli/index.ts`, `src/cli/gql.ts`) shells out to the
  gql.tada CLI with a temporary tsconfig, because the TS plugin does not run under `tsc`.

Caller-side typing:
```ts
import { gql, type StorefrontApi } from "@shopify/hydrogen";
const SHOP_QUERY = gql(`query { shop { name } }`);
type ShopResult = StorefrontApi.ResultOf<typeof SHOP_QUERY>;
```
Documented sharp edge: because `gql()` returns a branded string rather than a `TadaDocumentNode`, gql.tada's
`FragmentOf<>` **does not compile**; you must compose the fragment into a throwaway shape query and index into
its `ResultOf`. Second documented edge: keep `gql()` out of client/barrel modules — "Bundlers can't tell whether
a `gql()` call has side effects, so any `gql()` reachable from browser code gets bundled into the browser."

CAAPI gets a parallel but **deliberately incompatible** `gql` (`src/customer-account/graphql.ts:71`), with a
runtime `assertCustomerAccountDocument` that throws on foreign values (`graphql.ts:98-104`), so Storefront and
Customer Account documents cannot be mixed. It also computes `document.variableNames` once at creation time via
`/\$([_A-Za-z][_0-9A-Za-z]*)\s*:/g` (`graphql.ts:14, 106-112`) — a cheaper variant of the client's regex trick.

### 2.4 "Auto-injection of context methods" — the closest analogue

Hydrogen's analogue is the two regexes in §0.2. That is the whole mechanism. The directive itself is boilerplate
the developer repeats in every document — the `hydrogen-markets` skill even ships a diff showing the developer
adding it by hand.

There is an architectural reason Hydrogen *cannot* do better within its own design: it infers types from **the
literal source string the developer wrote**, so injecting a directive at runtime would desynchronize the type
from the document. Solidifront, by doing injection at **build** time and feeding the *transformed* source to the
inferencer, gets both automatic injection and accurate types. That is the strongest technical argument for
keeping solidifront's plugin/codegen layer rather than folding into Hydrogen.

**Recommendation:** keep the AST transform; move it from request-time to build-time via a Vite plugin over
`gql()` call sites; adopt gql.tada-style type-level inference over the transformed source; ship the schema
`.json` inside the package and re-export a `ts-plugin` so editors work with zero config.

---

## 3. Cart

### 3.1 What the domain requires

Full SFAPI `2026-04` mutation set (https://shopify.dev/docs/api/storefront/2026-04/objects/Cart, "Mutated by"):

`cartAttributesUpdate`, `cartBuyerIdentityUpdate`, `cartCreate`, `cartDeliveryAddressesAdd`,
`cartDeliveryAddressesRemove`, `cartDeliveryAddressesReplace`, `cartDeliveryAddressesUpdate`,
`cartDiscountCodesUpdate`, `cartGiftCardCodesAdd`, `cartGiftCardCodesRemove`, `cartGiftCardCodesUpdate`,
`cartLinesAdd`, `cartLinesRemove`, `cartLinesUpdate`, `cartNoteUpdate`, `cartSelectedDeliveryOptionsUpdate`.

Limits to encode: 250 lines per `cartLinesAdd`/`Remove`/`Update`. On `cartLinesUpdate`, "Omitting the
`attributes` field or setting it to `null` preserves existing line attributes. Pass an empty array to clear all
attributes." Beyond the API: cart-id persistence, optimistic UI, no-JS form fallback, per-line error/warning
surfacing, and revalidation when the cart changes out of band (installed apps, Shop Pay, other tabs).

### 3.2 Preview: server side

`src/core/cart/queries.ts` defines exactly **eight** operations (`DEFAULT_CART_QUERIES`, `queries.ts:463-472`):
`cart`, `cartCreate`, `cartLinesAdd`, `cartLinesUpdate`, `cartLinesRemove`, `cartDiscountCodesUpdate`,
`cartNoteUpdate`, `cartAttributesUpdate`.

**Not covered:** buyer identity, gift cards, delivery addresses, delivery options, metafields. Combined with the
absent `@inContext(buyer:)` (§6.3), preview has **no first-party B2B or logged-in-buyer cart contextualization
at all** — a regression from classic Hydrogen, which shipped `cartBuyerIdentityUpdate` as a default method.

Every document hand-writes `@inContext(country: $country, language: $language)` and declares
`$country: CountryCode, $language: LanguageCode` (16 occurrences: `queries.ts:124, 134, 156, 178, 200, 222, 244,
266, 293, 304, 327, 350, 373, 396, 419, 442`).

The default `HydrogenCartFragment` (`queries.ts:26-120`) selects `id`, `checkoutUrl`, `totalQuantity`, `note`,
`attributes`, three `cost` money fields, `lines(first: 250)` with per-line cost / merchandise /
`selectedOptions` / `sellingPlanAllocation` / `parentRelationship`, and `discountCodes`. Note **`lines(first:
250)` is a hard cap with no pagination.**

`src/core/cart/server-handlers.ts` exposes `createCartServerHandlers()` → `{get, post}`, both bound to
`/api/cart` (`CART_API_PATH`, `server-handlers.ts:27`). Each is a `CallableRouteHandler` — a plain async
function with `.pathname`/`.method` assigned (`src/core/request-routing/registered-routes.ts:38-46`):
```ts
export function createCallableRouteHandler(pathname, method, handler) {
  return Object.assign(handler, { pathname, method });
}
```
That directly-callable property is what makes seam 2 in §3.5 possible.

`POST` (`handlePost`, `server-handlers.ts:160-195`):
- `parseCartRequest` (`src/core/cart/actions.ts:42-59`) accepts `application/json`,
  `x-www-form-urlencoded`, or `multipart/form-data`.
- Cart-id resolution: body `cartId` → cookie (`server-handlers.ts:177-178`); `getCartId`
  (`src/core/cart/get-cart.ts:40-48`) additionally checks a `?cartId=` search param first.
- Non-`add` intents with no cart id → `missing_cart`.
- `set-cookie` appended **only when the browser already owned the cart** (`server-handlers.ts:189-190`) — a
  deliberate guard against writing a cart id the browser did not ask for.
- Form requests get `303` to a same-origin-validated `Referer` (`safeRedirectTarget`,
  `server-handlers.ts:197-208`); JSON requests get JSON. That is the no-JS fallback.

`CartAction` intents (`actions.ts:20-28`): `add | update | remove | discount-update | discount-apply |
discount-remove | attributes-update | note-update`. JSON infers intent from body structure; FormData requires an
explicit `intent` plus the synthetic `increase`/`decrease`/`set`, because "forms can't atomically
read-modify-write quantity" (`actions.ts:179-194` — an unusually good comment block on the JSON/form impedance
mismatch). Mixed add/update/remove in one JSON request is rejected (`actions.ts:152-156`).

`discount-apply`/`discount-remove` are **synthesized**, not API operations, and Hydrogen documents the race
(`server-handlers.ts:341-349`):
> "Read-then-write: SFAPI has no atomic discount modify endpoint, so concurrent requests can overwrite each
> other's discount codes."

Cookie (`src/core/cart/cookie.ts`): name `cart`, `Max-Age=1209600` (14 days), `Path=/; SameSite=Lax`, GID prefix
stripped for storage and re-added on read. **No `HttpOnly`, no `Secure`.**

### 3.3 Preview: client side

`src/core/cart/cart.ts` — 2,505 lines, `cart.test.ts` 5,470, `route.test.ts` 1,305. The densest thing in the
package, and where the real domain knowledge lives.

Public surface is small (`cart.ts:97-106`):
```ts
export type CartStore = {
  connect(): void;
  destroy(): void;
  hydrate(data: CartData): void;
  getState(): CartState;
  subscribe(listener: (state: CartState) => void): () => void;
  fetch(): Promise<void>;
  reset(): void;
  handleFormSubmit(event: SubmitEvent, eventDetail?: Record<string, unknown>): Promise<void>;
};
```

Underneath is an optimistic **transaction registry** (`cart.ts:150-185`). Each transaction type declares
`projectPayload` (optimistic projection), `transport` (network), `projectPromise` (settlement), plus
`getSignalKeys`/`getPendingKeys`/`getErrorKeys` and `removeSupersededPayload`. Pending transactions are ordered
and re-projected over server state, with per-key `AbortController` ownership so a later write to the same line
cancels an earlier one. Optimistic line ids are prefixed `optimistic:` and derived from an FNV-1a hash of a
merchandise identity key (`cart.ts:68-81, 369-421`).

`CartState` (`src/core/cart/state.ts:125-133`) is
`{data, loading, readyPromise?, pending, revalidating?, errors}`, where `pending` is
`{lines: Set<string>, note: boolean, attributes: boolean, discountCodes: Set<string>, cost?: boolean}` and
`errors` (`state.ts:97-111`) carries separate `Map`s for lines / attributes / discount codes plus per-slice
`*UpdatedAt` timestamps. Per-line pending *and* per-line errors is the thing hand-rolled carts get wrong.

The reactive substrate is `src/core/observable.ts` (83 lines): `createObservable<T>` with
`subscribe(fn, selector?, isEqual?)`, `Object.is` bailout, mutation-safe listener iteration. **That is a signal,
badly.** In Solid it is a store plus memos, and the selector plumbing disappears.

`handleFormSubmit` closes the loop with `createCartFormRegister()` (`src/core/cart/form.ts`) — a
framework-agnostic "spread these attributes onto your input" helper covering `lineId`, `quantity` (with an
`interactive` variant returning `inputMode="numeric" pattern="\d+"`), `discountCode`, `merchandiseId`, `note`,
`attributes.<key>`, `sellingPlanId`, and the `intent` submit buttons. It returns plain attribute objects — no
JSX, works anywhere.

### 3.4 The Solid binding already exists as an example

`examples/solid-start/src/lib/cart.tsx` is a complete, working Solid binding in ~100 lines:
`CartProvider` (`createCartStore()` + `onMount(connect/fetch)` + `onCleanup(destroy)` + context),
`useCartStore`, an overloaded `useCart(selector?, isEqual?)` returning an accessor backed by `createSignal` +
`store.subscribe` + `onCleanup(unsubscribe)`, and `useCartForm()` returning `{register, formProps}`. It types
itself off the server handlers:
```ts
type SolidCartData = CartDataFromHandlers<typeof cartHandlers>;
```
Compare `src/react/cart.tsx` (245 lines, of which ~30 are the `useSyncExternalStore` snapshot cache) and
`src/vue/cart.ts` (244 lines). The Solid version is the shortest of the three because
`createSignal` + `subscribe` *is* the model.

### 3.5 How consumers extend or override cart operations — **the critical question**

**Seam 1 — the `CartFragment` (the only documented one).**
`createCartServerHandlers({fragment})` where the fragment must be literally named `CartFragment` and be
`on Cart`, enforced by regex at runtime (`queries.ts:554-564`):
```ts
function createFragmentPattern({name, typeName}) {
  return new RegExp(`fragment\\s+${name}\\s+on\\s+${typeName}`);
}
```
`makeCartQueries({fragment})` re-composes eight `CUSTOM_*` variants spreading both `...HydrogenCartFragment` and
`...CartFragment` (`queries.ts:291-461, 566-610`). Extra fields flow to the typed client via
`CartDataFromHandlers<typeof cartHandlers>` (`server-handlers.ts:98-100`). Documented at
`skills/hydrogen-cart-ui/references/react.md:71` and `.../vue.md:50`.

A neat hack makes it type-check: the `CUSTOM_*` documents interpolate the fragment-spread name
(`...${CART_FRAGMENT_NAME}`) specifically so the gql.tada TS plugin *skips* the document instead of flagging an
unknown fragment, while TypeScript still resolves the literal source type (`queries.ts:286-290`).

**Seam 2 — replace or wrap the handler.** Because handlers are plain callables with `.pathname`/`.method`, and
`handleShopifyRouteHandlers` just flattens `Object.values(group)` and matches on exact `pathname` + `method`
(`registered-routes.ts:51-70`), a consumer can supply their own via
`createShopifyRouteHandler("/api/cart", "POST", fn)` — or wrap:
```ts
const post = createShopifyRouteHandler("/api/cart", "POST", async (ctx) => {
  /* pre-work */ return cartHandlers.post(ctx);
});
```
This follows from the types but is **not documented** as an extension pattern.

**Seam 3 — bypass.** `cartQueries`, `makeCartQueries()`, `getCart()`, `parseCartRequest()`, `createCartCookie()`
are all exported, so you can drive mutations directly against `storefrontClient.graphql`.

**What is missing versus classic.** The `CartAction` union (`actions.ts:20-28`) and the `switch` in
`executeMutation` (`server-handlers.ts:259-318`) are closed. You cannot add `cartBuyerIdentityUpdate`, change
what `add` does, or register a new intent.

### 3.6 Classic's cart handler — more surface, weaker composition

`Shopify/hydrogen@main:packages/hydrogen/src/cart/createCartHandler.ts`. Options (line 86):
```ts
export type CartHandlerOptions = {
  storefront: Storefront;
  customerAccount?: CustomerAccount;      // supplies B2B buyer identity
  getCartId: () => string | undefined;
  setCartId: (cartId: string) => Headers;
  cartQueryFragment?: string;             // must be named `CartApiQuery`
  cartMutateFragment?: string;            // must be named `CartApiMutation`
  buyerIdentity?: CartBuyerIdentityInput;
};
```

**21 default methods** — `get`, `getCartId`, `setCartId`, `create`, `addLines`, `updateLines`, `removeLines`,
`updateDiscountCodes`, `updateGiftCardCodes`, `addGiftCardCodes`, `removeGiftCardCodes`, `updateBuyerIdentity`,
`updateNote`, `updateSelectedDeliveryOption`, `updateAttributes`, `setMetafields`, `deleteMetafield`,
`addDeliveryAddresses`, `removeDeliveryAddresses`, `updateDeliveryAddresses`, `replaceDeliveryAddresses`.
Preview covers 8 of these.

Two behaviours worth stealing that preview lacks:
- **Auto-create on write.** `addLines`, `updateDiscountCodes`, `updateGiftCardCodes`, `updateBuyerIdentity`,
  `updateNote`, `updateAttributes`, and `setMetafields` all do
  `return cartId || optionalParams?.cartId ? await cartLinesAddDefault(mutateOptions)(lines, optionalParams) :
  await cartCreate({lines, buyerIdentity}, optionalParams);`
- **Buyer merge on create.** `cartCreateDefault` does
  `const buyer = options.customerAccount ? await options.customerAccount.getBuyer() : undefined;` and merges
  `buyerIdentity: {...buyer, ...buyerIdentity}`. That single line is the entire B2B story preview is missing.

**`customMethods` is a shallow spread**, evaluated once at construction (`createCartHandler.ts:411-418`), and
`HydrogenCartCustom = Omit<HydrogenCart, keyof TCustomMethods> & TCustomMethods` — the custom signature fully
*replaces* the default's type, with no compatibility check. **A custom method gets no reference to the default
it replaced.** The official example (`createCartHandler.customMethods.example.js`) works around this by
re-deriving the default from the exported factory:
```js
customMethods: {
  editInLine: async (addLines, removeLineIds, optionalParams) => {
    await cartLinesAddDefault(cartQueryOptions)(addLines, optionalParams);
    return await cartLinesRemoveDefault(cartQueryOptions)(removeLineIds, optionalParams);
  },
  addLines: async (lines, optionalParams) => { /* fully reimplemented */ },
}
```
There is a real leak in that pattern: the handler keeps `let cartId = _getCartId()` in a closure, updated only
inside its own `cartCreate`, so an overriding `addLines` silently loses the auto-create fallback.

**The composition primitive that actually works** is the `*Default` factory family — every operation is exported
as a uniformly curried
`(options: CartQueryOptions) => (requiredArgs, optionalParams?) => Promise<CartQueryDataReturn<TCart>>`, with
`CartQueryOptions = {storefront, getCartId, cartFragment?, customerAccount?}`. Mutation strings are *functions
of the fragment*, defaulting to `MINIMAL_CART_FRAGMENT` (`fragment CartApiMutation on Cart { id totalQuantity
checkoutUrl }`). That currying — an operation as a value parameterized by a context record — is very close to
what an Effect `Layer` wants to be, and is the right thing for solidifront to generalize.

`cartGetIdDefault` / `cartSetIdDefault` are both ~6 lines. Cookie name is hardcoded `cart`, value is the bare id
suffix, and options are fully configurable (`CookieOptions = {maxage?, expires?, samesite?, secure?, httponly?,
domain?, path?}`) — **so classic lets you set `Secure`/`HttpOnly`; preview hardcodes neither** (§7.4).

`CartOptionalInput = {cartId?, country?, language?, visitorConsent?}` — per-call overrides, defaulting to
`cart.getCartId()` and `storefront.i18n.*`. `main` also adds a global augmentation point
`interface HydrogenCustomCartFragment {}` so codegen'd fragment types flow through every cart method.

### 3.7 For solidifront

"Extensible base cart actions/queries" is satisfiable by neither implementation as-is. The Effect-native shape:
- A `CartOperations` service (`Context.Tag`) whose members are the operations — the natural generalization of
  classic's `*Default(options)(args)` currying.
- A `CartOperationsLive` `Layer` built from the default documents; consumers override individual members with a
  replacement `Layer` and *can* delegate to the default, because the default is a value rather than a `switch`
  arm or a spread-away key.
- `CartAction` becomes an open tagged union (`Data.TaggedEnum`); the request parser becomes an extensible
  `Schema` union.
- Ship all 21 classic operations, not preview's 8. `cartBuyerIdentityUpdate` first.
- Encode the auto-create-on-write behaviour *in the service*, so overrides inherit it instead of losing it.

Keep from preview: the optimistic transaction registry and per-key pending/error state; the fragment-composition
trick; the read-then-write discount caveat; the 250-line cap; the form/JSON dual protocol including
`increase`/`decrease`/`set`; and the "only set the cookie if the browser already owned the cart" guard.
Take cookie configurability from classic.

---

## 4. Customer auth / session

`src/customer-account/**` — `client.ts` (431), `session.ts` (1,279), `errors.ts`, `graphql.ts`,
`type-resolver.ts`, `index.ts`. Exported as `@shopify/hydrogen/customer-account`, **ESM-only** (no `require`
condition, `package.json:40-43`).

### 4.1 What the domain requires

A separate GraphQL endpoint with its own schema and version, behind OAuth 2.0 + PKCE against Shopify's identity
service. Build an authorize URL, handle the callback, exchange the code, store tokens securely, refresh them,
answer "am I logged in", log out *through Shopify*, and thread the resulting identity into pricing and the cart.

### 4.2 Public surface

Values (`src/customer-account/index.ts:1-45`): `createCustomerAccountClient` (`client.ts:84`),
`createCustomerSession` (`session.ts:206`), `createCustomerAccountServerHandlers` (`session.ts:383`), `gql`
(`graphql.ts:71`), `CUSTOMER_ACCOUNT_API_VERSION`, the four path constants
(`CUSTOMER_ACCOUNT_LOGIN_PATH = "/account/login"`, `..._AUTHORIZE_PATH = "/account/authorize"`,
`..._REFRESH_PATH = "/account/refresh"`, `..._LOGOUT_PATH = "/account/logout"`, `session.ts:12-15`), and four
error classes (`errors.ts`): `CustomerAccountApiError`, `CustomerAccountAuthenticationError`,
`CustomerAccountTimeoutError`, and `CustomerAccountOAuthError` — the last of which extends plain `Error`, **not**
`CustomerAccountApiError`, a distinction the authorize route depends on (`session.ts:520`).

```ts
// session.ts:71-77
type CreateCustomerSessionOptions = {
  shopId: string; customerAccountApiClientId: string;
  customerAccountApiUrl?: string; fetch?: typeof globalThis.fetch; defaultTimeoutInMs?: number;
};
// session.ts:166-172
type CreateCustomerAccountServerHandlersOptions = {
  customerSession: CustomerSession;
  defaultPostLoginRedirectPathname?: string;  // "/"
  loginFailedRedirectPath?: string;           // "/account?login=failed"
  origin?: string | ((request: Request) => string);
  postLogoutRedirectUri?: string;             // "/"
};
```

`createCustomerSession` is constructed at **module scope**; request-scoped session managers are passed **into**
its methods. `shopId` must be a numeric string (`/^\d+$/`, `client.ts:364-368`) — not a GID, not a domain.

### 4.3 The OAuth flow, verified

**Endpoints** (`createCustomerAccountEndpoints`, `session.ts:1212-1225`). Base is
`https://shopify.com/authentication/{shopId}`, overridable, HTTPS-enforced.

| Purpose | URL |
| --- | --- |
| authorize | `https://shopify.com/authentication/{shopId}/oauth/authorize` |
| token | `https://shopify.com/authentication/{shopId}/oauth/token` |
| logout | `https://shopify.com/authentication/{shopId}/logout` |
| expected `iss` | `https://shopify.com/authentication/{shopId}` |

Note the auth base URL carries **no API version segment**; only the GraphQL endpoint is versioned.

**Grant types: two only** — `authorization_code` and `refresh_token` (`session.ts:26-27`).
**There is no RFC-8693 token-exchange grant** anywhere in the package. This is a change from classic Hydrogen,
which performed a second `urn:ietf:params:oauth:grant-type:token-exchange` call.

**`prepareLoginUrl`** (`session.ts:280-312`): marks the response personalized; resolves origin from
`options.origin ?? sessionManager.getSessionOrigin()` and **throws unless `https:`** (`normalizeOrigin`,
`session.ts:1239-1245`); generates `state`, `nonce`, `codeVerifier` as three independent 32-byte
`crypto.getRandomValues` base64url values (`session.ts:37, 1189-1197`); computes
`codeChallenge = base64url(SHA-256(verifier))` via `crypto.subtle.digest` (`session.ts:1184-1187`); sanitizes
`returnTo` (default `/account`); writes `pendingLogin: {state, nonce, codeVerifier, returnTo, origin, createdAt}`
into the session; builds the URL with `client_id`, `scope`, `response_type=code`, `redirect_uri`, `state`,
`nonce`, `code_challenge`, `code_challenge_method=S256`.

- `scope = "openid email customer-account-api:full"` (`session.ts:28`).
- `redirect_uri = ${origin}/account/authorize` — **hardcoded, not configurable** (`session.ts:304`).
- Optional params (`session.ts:1148-1156`): `locale`, `region_country` (from `requestContext.i18n.country`),
  `acr_values`, `login_hint`, `login_hint_mode`.

**Callback** (`handleOAuthCallback` / `completeOAuthCallback`, `session.ts:314-333, 586-630`): reads `code` +
`state`; `getPendingLogin` throws `"missing_pending_login"` if absent/incomplete/expired — the pending-login TTL
is **10 minutes** (`session.ts:32-36, 1121-1132`); `assertOAuthCallbackParams` throws
`"missing_callback_params"` or `"state_mismatch"` (a plain `!==`, **not constant-time**); exchanges the code;
validates the `id_token`; **overwrites** the session key with `{tokens}`, dropping `pendingLogin`. Any throw
triggers `clearPendingLogin()` then rethrow (`session.ts:329-332`).

**Token exchange** (`session.ts:672-719`): `POST {tokenUrl}` form-encoded with
`grant_type=authorization_code, client_id, redirect_uri, code, code_verifier`. **Public-client PKCE — no client
secret is ever sent.** Headers: `Content-Type`, `User-Agent: Hydrogen ${__HYDROGEN_VERSION__}`, `Origin`. Init:
`cache: "no-store"`, `redirect: "manual"`, `signal`. HTTP 400/401 → `"token_exchange_rejected"`; other non-OK →
`"token_exchange_failed"`. The response must carry non-empty `access_token`, positive finite `expires_in`,
`refresh_token`, and `id_token`, else `"invalid_token_response"` (`session.ts:922-940`).

**`id_token` validation** (`validateIdTokenClaims`, `session.ts:985-1017`): checks `nonce`, `iss`, `aud`
(equals-or-includes the client id), and `exp`.
> **The JWT signature is never verified.** No JWKS fetch, no `crypto.subtle.verify`, no `alg` check — the test
> helper mints `{alg:"none"}` tokens. Defensible, because the token arrives over a direct TLS back-channel from
> the token endpoint rather than via the browser, but worth knowing before copying.

No claims are surfaced — no `sub`/customer-id accessor. `parseJwtPayload` is module-private.

**Logout** (`session.ts:335-357`): reads `idToken`, then unconditionally
`await sessionManager.removeSessionItem("customerAccount")`, then returns
`{logoutUrl}?id_token_hint={idToken}&post_logout_redirect_uri={absoluteUri}` — or, with no `id_token`, a purely
local redirect with no Shopify round-trip.

### 4.4 Session storage is bring-your-own

Hydrogen ships **no** storage. It defines two structural interfaces and calls them. The exact interface an app
must implement (`src/core/request-routing/route-types.ts:6-12`):
```ts
type ShopifyRouteSessionManager = {
  getSessionOrigin(): Awaitable<string>;
  getSessionItem(key: string): Awaitable<unknown>;
  setSessionItem(key: string, value: unknown): Awaitable<void>;
  removeSessionItem(key: string): Awaitable<void>;
  commit?(): Awaitable<HeadersInit | void>;   // optional
};
```
`Awaitable<T> = T | Promise<T>`, so sync or async both work. `WritableCustomerSessionManager` aliases this;
`ReadonlyCustomerSessionManager` is `{getSessionItem}` only (`session.ts:47-52`).

The read/write split is **type-enforced**: `isLoggedIn`/`getAccessToken` take the readonly type;
`getOrRefreshAccessToken`/`prepareLoginUrl`/`handleOAuthCallback`/`logout` require the writable one, with four
`@ts-expect-error` cases in `session.type-test.ts:64-91` proving it.

Single storage key `"customerAccount"` (`session.ts:17`), holding
`{tokens?: {accessToken?, refreshToken?, idToken?, expiresAt?}, pendingLogin?: {...}}`, read back defensively
(`session.ts:1138-1146`). Writes are narrow: `writeTokens` merges; `clearTokens` preserves `pendingLogin`;
`clearPendingLogin` preserves `tokens`; only `logout` removes the whole key.

**Encryption: none in the package.** Raw JWTs and opaque tokens are handed to your session manager as plain
values. The reference adapter is `examples/shared/customer-session.ts` —
`EncryptedCookieCustomerSession`, AES-GCM with a 12-byte IV, key `SHA-256(secret)`, cookie
`__Host-hydrogen_customer_session` with `HttpOnly; Secure; SameSite=Lax; Path=/`, versioned
`v1.<iv>.<ciphertext>`, secret ≥ 32 chars, hard 4096-byte ceiling. Its own comment recommends opaque
server-side sessions for production, and it is **not** shipped in the npm package (`files: ["README.md", "bin",
"dist", "skills"]`).

### 4.5 Refresh

Lazy and on-demand only, through `getOrRefreshAccessToken` (`session.ts:242-278`) or a full-page
`GET /account/refresh`. **It is not automatic on GraphQL requests** — `createCustomerAccountClient` never touches
the session; you pass it a token per call.

Staleness is baked in at write time, not compared at read time: `expiresAt = Date.now() + (expires_in - 120) *
1000` (`EXPIRY_BUFFER_IN_SECONDS = 120`, `session.ts:31, 975-983`). So a token goes stale 2 minutes early.

**Single-flight dedup: yes.** `refreshFlights: Map` lives in the `createCustomerSession` closure
(`session.ts:231`), keyed `` `${origin}\n${refreshToken}` `` (`session.ts:740`), deleted in a `finally`.
Two parallel calls produce one `fetch` (`session.test.ts:330-349`). Caveats: it is per-instance and per-process,
so it does not dedupe across isolates/regions, and it keys on the *old* refresh token, so it does not prevent
rotation races across processes.

Refresh request body is exactly `grant_type=refresh_token, client_id, refresh_token` — no `redirect_uri`, no
`scope`, no secret. Failure taxonomy (`RefreshResult`, `session.ts:188-191, 801-831`): 400/401 → `invalid` →
`clearTokens()`; any other non-OK, parse failure, throw, abort, or timeout → `transient`, tokens untouched.
**In all failure cases `getOrRefreshAccessToken` resolves `undefined` and never throws**, so callers cannot
distinguish "logged out" from "Shopify is down". If the refresh response omits `refresh_token`/`id_token`, the
current values carry forward (`session.ts:822-826`).

The three-way read API is worth copying exactly:
- `isLoggedIn(readonlyManager, requestContext)` — true if a *usable* access token **or** any non-empty refresh
  token exists (`hasCustomerSession`, `session.ts:1093-1097`). Its own JSDoc warns: *"Not an authorization check
  for private Customer Account data."*
- `getAccessToken(readonlyManager, ...)` — returns only a currently usable token, **never refreshes**.
- `getOrRefreshAccessToken(writableManager, ...)` — refreshes.

So an expired-but-refreshable session reports `isLoggedIn() === true` while `getAccessToken()` returns
`undefined`. That is the "refresh dance", and the app must implement it: detect the combination, redirect once
to `/account/refresh?return_to=…`, with a one-shot guard param (`skills/hydrogen-customer-account/SKILL.md:53-55`).

**All four session reads call `requestContext.markResponseAsPersonalized(...)` first**, which makes
`applyResponseHeaders` force `cache-control: private, no-store, max-age=0, must-revalidate` and delete
`*cdn-cache-control` / `surrogate-control` (`src/core/headers.ts:83-91`). Fail-safe, but note the consequence:
**merely calling `isLoggedIn()` makes a page uncacheable**, even when it returns false.

### 4.6 Route handlers

`createCustomerAccountServerHandlers` (`session.ts:383-451`) returns four `CallableRouteHandler`s:
`GET /account/login`, `GET /account/authorize`, `GET /account/refresh`, `POST /account/logout`. Cross-cutting:
every result is a redirect (or a 403 error) with `cache-control: no-store` forced; session cookies are committed
via `await sessionManager.commit?.()` and merged into the redirect headers; `handleShopifyRouteHandlers` turns
redirects into **HTTP 303** with an **absolute** `Location`, because "framework proxy runtimes like Next.js can
require absolute URLs".

Logout enforces CSRF via `isSameOriginPost` (`session.ts:632-650`): prefer `Origin`, fall back to `Referer`
origin, **missing both → 403** before any session mutation or commit.

`authorize` catches only `CustomerAccountOAuthError` → redirect to `loginFailedRedirectPath`; anything else
propagates.

> **Solid Router trap.** `skills/hydrogen-request-handlers/SKILL.md`: "Link and submit to Customer Account routes
> ... with plain HTML `<a>`/`<form>`, never the framework's client-side navigation component ... The login and
> logout handlers return raw HTTP redirects to external Shopify URLs, which client-nav cannot process."
> `examples/solid-start/src/routes/account.tsx:75-82, 104-110` shows both done correctly. Solidifront must
> document this.

### 4.7 The CAAPI GraphQL client

Endpoint `https://shopify.com/{shopId}/account/customer/api/{version}/graphql` (`client.ts:109`) — note the path
shape differs from the OAuth base. `POST`, `cache: "no-store"`, `redirect: "manual"`, headers `Authorization`
(the access token **raw, with no `Bearer ` prefix** — asserted at `client.test.ts:144`), `Content-Type`,
`Origin`, `User-Agent`.

Differences from the Storefront client worth noting:

| Aspect | Customer Account | Storefront |
| --- | --- | --- |
| Auth | per-call `accessToken` | client-lifetime token header |
| Client types | one | three |
| Caching | none, always `no-store` | full `CachingStrategy` |
| Personalization | always marks the response personalized | never; captures subrequest headers instead |
| Hydrogen request headers | **not** applied — no cookie, no tracking headers, no request-group id | all applied |
| Auto i18n variables | `language` only | `country` **and** `language` |
| Browser guard | always throws | only for `private*` types |
| Retries | none | none |

Origin derivation (`client.ts:420-431`) requires `requestContext.url`; `http:` is upgraded to `https:` **only**
for `localhost`, `127.0.0.1`, `::1`, `[::1]`. The OAuth side has **no** such exemption — HTTPS is structurally
required, with `normalizeOrigin` throwing *"Use a public HTTPS tunnel for local Customer Account login."*
Hence the examples' `mkcert` + `https://localtest.me:5173/account/authorize` setup.

### 4.8 First-party vs app-built

| Concern | Hydrogen preview |
| --- | --- |
| Authorize URL, PKCE, state/nonce, code exchange, refresh single-flight, logout URL | first-party |
| The four route handlers, `return_to` sanitization, logout CSRF | first-party |
| Typed CAAPI client, four error classes, schema, ts-plugin, `gql check` | first-party |
| GraphiQL dev tab for CAAPI (`interceptors/graphiql.ts:45-66`) | first-party, opt-in |
| **Token storage** (the 5-method interface) | **app-built** |
| **Encryption / cookie flags / size limits** | **app-built** (example only) |
| Request-scoped wiring (middleware, `locals`, `applyResponseHeaders`) | app-built |
| Read-only vs writable manager plumbing | app-built |
| **All account UI** — `SKILL.md:62`: "Hydrogen ships no account UI yet — the app owns it." Zero components. | app-built |
| Login/logout links as full-document navigations | app-built |
| The refresh dance and its one-shot guard | app-built |
| Failure UX for `?login=failed` | app-built |
| All customer/order/address GraphQL documents | app-built |
| **Buyer identity → SFAPI pricing / cart** | **not possible** (§0.2 item 5) |

**Runtime constraints.** Web Crypto (`crypto.getRandomValues`, `crypto.subtle.digest`), `btoa`/`atob`,
`AbortSignal.any` (**the tightest constraint** — Node ≥ 20.3, Chrome 116+), `TextEncoder`, `DOMException`,
`Response.body.cancel()`, and a bundler-injected `__HYDROGEN_VERSION__`. Both factories throw if
`typeof document !== "undefined"` — server, worker, or edge only.

### 4.9 Classic, for contrast

`Shopify/hydrogen@main:packages/hydrogen/src/customer/customer.ts`.
```ts
createCustomerAccountClient({
  session, customerAccountId, shopId, customerApiVersion = DEFAULT_CUSTOMER_API_VERSION,
  request, waitUntil, authUrl, customAuthStatusHandler, logErrors = true,
  loginPath = '/account/login', authorizePath = '/account/authorize',
  defaultRedirectPath = '/account', language, useCustomAuthDomain,
}): CustomerAccount
```
Returns `{i18n: {language}, login, logout, authorize, isLoggedIn, handleAuthStatus, getAccessToken, getApiUrl,
query, mutate, setBuyer, getBuyer}`. (It is `setBuyer`/`getBuyer`, **not** `setBuyerIdentity`.)

Same OAuth shape as preview — authorization code + PKCE S256, public client, `state`/`nonce`, `id_token` nonce
check, `expiresAt = now + (expires_in - 120)s` — with these differences:

| | classic | preview |
| --- | --- | --- |
| Session | one object with `get/set/unset/commit/destroy?` (`HydrogenSession`, structurally a React Router `Session` subset) | two interfaces, read-only vs writable, type-enforced |
| Second token exchange | **yes** — `exchangeAccessToken` when `shopId` is absent | none |
| Refresh | `checkExpires()` in `auth.helpers.ts`, per-request `Locks` | in-closure single-flight `Map` |
| Routes | app writes 4 one-line route files calling `customerAccount.*` | `createCustomerAccountServerHandlers()` supplies them |
| `isLoggedIn()` | **performs refresh** via `checkExpires` | read-only, never refreshes |
| State mismatch | one automatic recovery re-login (`oauth_recovery=true`, `oauth-recovery.` state prefix) | throws `"state_mismatch"` |
| Buyer → cart | `setBuyer()`/`getBuyer()` consumed by `cartCreateDefault` | **nothing** |
| Dev-domain guard | `checkTunnelDomain()` throws 400 unless host ends `.tryhydrogen.dev` or `useCustomAuthDomain: true` | HTTPS-origin check only |
| Session storage | still app-built (skeleton ships a cookie session) | app-built |

Requests go to `getCustomerAccountUrl(URL_TYPE.GRAPHQL)` with `Authorization: <accessToken>` (again no `Bearer`),
`Origin`, and `User-Agent: Shopify Hydrogen ${LIB_VERSION}`. `query`/`mutate` call `getAccessToken()` and
**throw a redirect** when unauthenticated; a 401 clears the session and throws the login redirect. That is a
meaningfully different ergonomic from preview, where the app owns the whole refresh dance.

`HydrogenSession`'s *types* import from `react-router`, but nothing in `customer.ts` is React-coupled at runtime.

**For solidifront:** the domain maps almost perfectly onto Effect. `CustomerSession` becomes a service; the
session manager a `Layer` (cookie / KV / DB); refresh a `Semaphore`-guarded `Effect.cached` — which also fixes
preview's per-process limitation if backed by a shared store; the four routes a `Layer` of handlers. Take
preview's read-only/writable split and its `isLoggedIn`/`getAccessToken`/`getOrRefreshAccessToken` trichotomy
(clearer than classic's refresh-inside-`isLoggedIn`), classic's `setBuyer`/`getBuyer` → cart threading, and beat
both by returning a **typed** refresh outcome instead of collapsing "logged out" and "Shopify is down" into
`undefined`.

---

## 5. Analytics

### 5.1 What the domain requires

Three obligations, often conflated. (1) **Shopify's own analytics** — merchants expect the admin's analytics and
Shopify Pixels (Shopify-owned *and* app-installed) to work on a headless storefront, which means loading
Shopify's scripts and emitting the standard events with expected payloads. (2) **Consent** gating all of it.
(3) **Third-party destinations** — GA4, Meta, Klaviyo.

### 5.2 The event bus

`src/core/analytics/bus.ts` (295 lines). Single export, `setupStorefrontAnalytics(options)`
(`bus.ts:135`), which is **not** re-exported from the package — its only caller is
`src/core/analytics/cdn/bootstrap.ts:8`, compiled into an inline `<script>`. **Apps never call it; they read
`window.Shopify.analytics`.**

```ts
// src/core/analytics/types.ts:174-184
export type StorefrontAnalytics = {
  publish: <E extends AnalyticsEventName>(event: E, ...payload: PublishPayloadArgs<E>) => void;
  subscribe: <E extends AnalyticsEventName>(event: E, cb: (p: PayloadFor<E>) => void) => () => void;
  addDestination: (destination: StorefrontAnalyticsDestination) => () => void;
  destroy: () => void;
  getConfig: () => StorefrontAnalyticsConfig;
};
```

There is no `emit`. Payloads are table-driven (`AnalyticsEventMap`, `types.ts:134-146`) with conditional arity
(`types.ts:148-149`), so `publish(PAGE_VIEWED)` typechecks with no argument but `publish(PRODUCT_VIEWED)` does
not. Custom `custom_*` events are **explicitly unsupported** at both type and runtime level
(`bus.ts:82-88`).

On publish, payloads are normalized: `withDefaultShop` injects `shop` from config (`bus.ts:36-50`);
`withInferredUrl` fills `url` from `window.location.href` for the five URL-inferred events
(`bus.ts:17-23, 52-64`); subscriber callbacks are individually try/caught (`bus.ts:181-187`).

**Hard single-instance guard** (`bus.ts:136-140`):
```ts
if (typeof window !== "undefined" && window.Shopify?.analytics) {
  throw new Error("Analytics bus already initialized. Only one setupStorefrontAnalytics() instance is allowed. ...");
}
```
The doc comment explains why: the CDN analytics script binds to the global on first load and will not re-bind.
`destroy()` deletes the global only if it is still the same instance.

Framework-agnostic — zero framework imports — but **DOM-coupled** (`window`, `document`) and browser-only
effective, with `typeof` guards at `bus.ts:28, 136, 218, 257, 272`. It is **not reactive**: a plain callback
registry, not a signal.

### 5.3 The event catalogue

`src/core/analytics/events.ts:1-13` — eight events, one place:
```ts
export const AnalyticsEvent = {
  PAGE_VIEWED: "page_viewed", PRODUCT_VIEWED: "product_viewed",
  COLLECTION_VIEWED: "collection_viewed", CART_VIEWED: "cart_viewed",
  SEARCH_VIEWED: "search_viewed", CART_UPDATED: "cart_updated",
  PRODUCT_ADD_TO_CART: "product_added_to_cart",
  PRODUCT_REMOVED_FROM_CART: "product_removed_from_cart",
};
```

**There is no checkout event.** No `checkout_started`, no `checkout_completed`, no `payment_info_submitted` —
checkout happens on Shopify's own domain and is out of scope for this bus. That is a notable answer to the
brief's "standard commerce events (… checkout)" question: *the storefront library does not own checkout
analytics.*

Payloads (`src/core/analytics/types.ts:60-143`): `PageViewPayload` (all optional),
`ProductViewPayload {products: Array<ProductPayload & OtherData>}`,
`CollectionViewPayload {collection: {id, handle}}`, `CartViewPayload {cart: AnalyticsCart | null}`,
`SearchViewPayload {searchTerm, searchResults?}`, `CartUpdatePayload {cart, prevCart}`,
`CartLineUpdatePayload {cart, prevCart, prevLine?, currentLine?}`. `ProductPayload` (`types.ts:75-85`) is
`{id, title, price, vendor, variantId, variantTitle, quantity: number, sku?, productType?}`. `AnalyticsCart` is
deliberately decoupled from `CartData` and accepts **both** connection shapes (`nodes` or `edges`).

**A critical asymmetry: the five view events are never published by the library.** Zero `publish()` call sites
for them exist in `src/`. App code publishes them from route lifecycle hooks — the reference is
`examples/solid-start/src/app.tsx:26-37`. The three cart events are published **only** from `cart-tracker.ts`,
and app code is explicitly forbidden from publishing them.

Separately and confusingly, `src/core/shopify-scripts/page-view.ts:42` dispatches a **DOM CustomEvent**
`document.dispatchEvent(new StandardEvents.PageViewEvent({page}))`, dynamically importing
`https://cdn.shopify.com/storefront/standard-events.js`. That is a different channel from bus `page_viewed`.

### 5.4 `cart-tracker.ts` — derivation is diffing

`export function trackCartAnalytics(store: Pick<CartStore, "getState"|"subscribe">): () => void`
(`cart-tracker.ts:25`). It reads `window.Shopify?.analytics` and **throws** if absent: *"Shopify analytics bus is
not available. Render ShopifyScripts before calling trackCartAnalytics()."* (`cart-tracker.ts:134`).

`toAnalyticsCart` (`:141-182`) projects `CartState` and returns `null` when `!cart.id` or `hasPendingCartWork`
— so optimistic in-flight state never produces events. **It reads `cart.lines.nodes` directly** (`:150`), so the
app's cart query must select `nodes`, not `edges`.

Three-layer dedupe: `updatedAt` vs `prevCart.updatedAt`; a `localStorage` `cartLastUpdatedAt` `{id, updatedAt}`
record (try/caught for Safari private mode); and `lastEventId`. Then `cart_updated` fires first, followed by
per-line diffing: quantity increase → `product_added_to_cart` with `{prevLine, currentLine}`; decrease →
`product_removed_from_cart` with both; disappeared line → removed with `prevLine` only; new line → added with
`currentLine` only.

Side effect: `syncShopifyCurrency` (`:193-215`) mutates `window.Shopify.currency = {active: CODE}`.

Two hazards for solidifront: the `localStorage` key is **un-namespaced and cross-tab**, so two storefronts on one
origin interfere; and `trackCartAnalytics` throws if scripts have not rendered, which in Solid means it must run
strictly inside `onMount`.

### 5.5 Destinations — the extension seam

`src/core/analytics/destination-manager.ts` (242 lines). A destination is (`types.ts:167-172`):
```ts
export type StorefrontAnalyticsDestination = {
  name: string;
  setup: (ctx: { subscribe; getConfig }) => void | (() => void) | Promise<void | (() => void)>;
};
```
`addDestination` returns a remover; `setup` returns its own teardown, sync or async. Names must be unique.
As used in `examples/solid-start/src/lib/analytics.ts:12-34`:
```ts
window.Shopify.analytics.addDestination({
  name: "example-console-logger",
  setup({ subscribe }) {
    const unsubs = events.map((e) => subscribe(e, (payload) => { /* ... */ }));
    return () => { for (const u of unsubs) u(); };
  },
});
```

**Replay buffer.** `MAX_REPLAY_BUFFER_SIZE = 500`, FIFO. Each buffered entry carries a monotonic sequence; each
destination carries a `nextReplaySequence` cursor advanced even when it has no subscriber for that event —
guaranteeing **exactly-once** delivery per destination. A destination registered late still receives the whole
buffer, because `finishSetup` calls `replay()` immediately.

**Consent gates destinations, not `subscribe`.** `bus.ts:161-166` wires
`canTrack: () => !waitingForDefaultBannerInteraction && hasAnalyticsConsent()` into the manager. `types.ts:176`
and `bus.test.ts:185` state it explicitly: the bus "delivers events regardless of consent state
(consent-agnostic bus)". Only destinations are gated. That is a subtle and important design decision —
**do not assume `subscribe` is safe for third-party forwarding.**

### 5.6 Consent

**Hydrogen preview's consent config is one field** (`types.ts:22-24`):
```ts
export type ConsentConfig = { mode?: "default-banner" | "custom-banner" | "no-banner" };
```
**There is no `checkoutDomain` and no `storefrontAccessToken`** anywhere in the rewrite — verified by grep.
This is a **tokenless headless** flow: `global.ts:124-129` sets
`customerPrivacy.config = {isHeadless: true}` and `consentStatus: "pending"`; `global-script.ts:18` sets
`consentDomain = window.location.host` at runtime; the initial request is
`setTrackingConsent({headlessStorefront: true}, cb)` (`consent-script.ts:59`).

That **diverges from the current public docs** (https://shopify.dev/docs/api/customer-privacy), which say a
headless storefront must supply `checkoutRootDomain`, `storefrontRootDomain`, and `storefrontAccessToken` to
`setTrackingConsent()`, and reference consent-tracking-api **v0.1**. Hydrogen preview loads
`cdn.shopify.com/shopifycloud/consent-tracking-api/**v0.2**/consent-tracking-api.js` (or
`.../privacy-banner/storefront-banner.js` when `mode === "default-banner"`). Either the docs lag or v0.2 changed
the contract — flagged in §7.

Gating (`hasAnalyticsConsent`, `bus.ts:66-80`) is conservative: requires `consentStatus === "loaded"`, rejects
explicit `currentVisitorConsent().analytics === "no"`, then requires `analyticsProcessingAllowed()`. Everything
try/caught → `false`.

`shouldWaitForDefaultBannerInteraction` (`bus.ts:106-118`) suppresses the *initial* consent event when a default
banner is showing and no interaction has occurred; catch → `true` (wait). The replay is driven by a `document`
listener on `"visitorConsentCollected"` (`bus.ts:215-254`), and `replay(clearWhenBlocked)` **permanently wipes
the buffer and stops recording** when consent is denied on an interaction event.

Also relevant and **unused by Hydrogen**: SFAPI ≥ 2025-10 supports `@inContext(visitorConsent: ...)`
(https://shopify.dev/docs/api/storefront/2026-04) — "the `@inContext` directive can contextualize any query or
mutation with visitor consent information". Solidifront already has `upsertInContextWithVisitorConsent.ts`.

### 5.7 Script loading

Two deliberately separate halves.

**SSR half.** `getShopifyScriptTags(options): ShopifyScriptTagDescriptors` (`src/core/shopify-scripts/index.ts:59`)
is a **pure function returning plain data** — no DOM, SSR-safe. Descriptors are
`{tagName: "script" | "link"; attributes?; innerHTML?}` with **serialized HTML** attribute names
(`crossorigin`, not `crossOrigin`) precisely so any framework can render them. Order is load-bearing:

1. preconnect `cdn.shopify.com`, preconnect `shop.app`, prefetch `standard-events.js`
2. inline `shopify-global-bootstrap`
3. `shopify-standard-actions` (module)
4. dev-only standard-events inspector
5. optional `shopify-inbox`
6. `shopify-consent` (async — privacy-banner or consent-tracking-api)
7. inline `shopify-consent-bootstrap` (**must immediately follow 6**)
8. inline `shopify-analytics-bus` (**must follow 7**)
9. `shopify-storefront-analytics` (async, default on)
10. conditional PerfKit (only when `storefrontId` is truthy and `shopId` ends in digits)

`renderShopifyScriptTags(options): string[]` serializes them for frameworks that want raw HTML. The three inline
scripts are build-time-compiled: `asInlineScript` is a type-level identity function; the tsdown plugin
`packages/hydrogen/plugins/inline-shopify-analytics-bus.ts` bundles each target as a minified browser **IIFE**
and rewrites the import into a function that JSON-injects its config. That is why the bus exists before
hydration.

**Client half.** `initializeShopifyScripts({navigate, routes, webMcp})`
(`src/core/shopify-scripts/initialize.ts:14`) does four things: `configureShopifyRouting`,
`initializeDeprecatedCookies`, `initializeShopifyPageViewEvents`, and (feature-detected on
`"modelContext" in document || navigator`) `loadShopifyWebMcpTools`. WebMCP is the **only** script injected via
client JS rather than SSR HTML.

> **SSR hazard for a Solid adapter.** `page-view.ts` and `utils/navigation.ts` use bare `window`/`document` with
> **no** `typeof` guards. `initializeShopifyScripts()` **must not run during SSR render** — it will throw.
> React uses `useEffect`, Vue `onMounted`, and the SolidStart example `onMount`
> (`examples/solid-start/src/app.tsx:43`). Also note `utils/navigation.ts:39-51` **monkey-patches
> `window.history.pushState`/`replaceState`** when the Navigation API is unavailable, which will interact with
> Solid Router's own history handling on Safari and older browsers.

### 5.8 The adapter contract, distilled

React (`src/react/shopify-scripts.tsx`, 72 lines) versus Vue (`src/vue/shopify-scripts.ts`, 96 lines) isolates
exactly what a Solid adapter needs:

1. Re-export `ShopifyScriptsProps = ShopifyScriptTagsOptions & Pick<ShopifyRoutesOptions, "navigate"|"routes"> &
   {webMcp?: boolean}` — identical in both.
2. A `ShopifyScripts` component that splits `{navigate, routes, webMcp}` from tag options, calls
   `getShopifyScriptTags(tagOptions).tags` during render, and maps descriptors to element nodes.
3. A mount-only effect calling `initializeShopifyScripts(...)` — Solid's `onMount`.
4. **Attribute mapping: Solid behaves like Vue, not React.** All three React-specific workarounds are
   unnecessary — the `crossorigin`→`crossOrigin` rename, `suppressHydrationWarning` for `nonce`, and a no-op
   `onLoad` attached solely to defeat React 19's async-script hoisting (which would otherwise let CDN scripts
   run before the inline bootstraps). Solid takes lowercase HTML attributes and `innerHTML` as a first-class
   prop, exactly as `examples/solid-start/src/entry-server.tsx:36` already does.
5. Optionally `useCartAnalytics()`: `onMount(() => onCleanup(trackCartAnalytics(store)))`.
6. **Nothing else.** There is no adapter-level analytics API; `publish`/`subscribe`/`addDestination` are consumed
   directly off `window.Shopify.analytics` in every framework.

The SolidStart example splits SSR tag rendering (server entry, module scope) from client init (a null-rendering
`<ShopifyRoutes/>` component's `onMount`) — arguably a **cleaner split than React's and Vue's single
component**, and worth preserving in a real binding.

### 5.9 Classic analytics, for contrast

`Shopify/hydrogen@main:packages/hydrogen/src/analytics-manager/`.

**The event catalogue is identical** (`analytics-manager/events.ts`) — same eight names — plus one preview
dropped: `CUSTOM_EVENT: 'custom_' as \`custom_${string}\``. Preview **explicitly rejects** `custom_*` events at
both type and runtime level (`bus.ts:82-88`). If solidifront wants custom events, follow classic.

```ts
export const Analytics = {
  CartView: AnalyticsCartView, CollectionView: AnalyticsCollectionView,
  CustomView: AnalyticsCustomView, ProductView: AnalyticsProductView,
  Provider: AnalyticsProvider, SearchView: AnalyticsSearchView,
};
```
All six are React components. **`Analytics.PageView` is not exported** — the Provider renders it automatically.
Each `*View` is a wrapper over one internal `AnalyticsView` that returns `null` and publishes inside a
`useEffect` keyed on `[publish, url, shop?.shopId]`. That is exactly the shape a Solid version collapses into
`createEffect` over a location memo.

`<Analytics.Provider>` renders
`<AnalyticsContext.Provider>{children}<AnalyticsPageView/><CartAnalytics/><ShopifyAnalytics/><PerfKit/></...>`.
Props: `cart`, `shop` (both accept a Promise), `consent`, `canTrack?`, `customData?`, `cookieDomain?`.

**Consent config is where classic and preview genuinely disagree.** Classic's
`Consent = Partial<Pick<CustomerPrivacyApiProps, 'checkoutDomain' | 'sameDomainForStorefrontApi' |
'storefrontAccessToken' | 'withPrivacyBanner' | 'country'>> & {language?}` — and it `errorOnce`s when
`checkoutDomain` or `storefrontAccessToken` are missing. Preview's `ConsentConfig` is `{mode?}` and passes
`{headlessStorefront: true}` instead. **Both load consent-tracking-api v0.2**
(`https://cdn.shopify.com/shopifycloud/consent-tracking-api/v0.2/consent-tracking-api.js`) or
`.../privacy-banner/storefront-banner.js`. So the v0.1 references on
https://shopify.dev/docs/api/customer-privacy are simply stale; the `checkoutDomain`/`storefrontAccessToken`
requirement is real in classic and apparently superseded in preview's headless mode — resolved partially, see
§7.3.

`useCustomerPrivacy(props)` is a **React hook**; `getCustomerPrivacy()` and `getPrivacyBanner()` are plain
functions reading `window.Shopify.customerPrivacy` / `window.privacyBanner`. **There is no
`<ShopifyCookieBanner>` component** — the banner is Shopify's own SDK, driven imperatively via
`privacyBanner.loadBanner()` / `.showPreferences()`.

Pub/sub in classic is module-level functions over a module-scoped `Map`, with a `register(key) => {ready()}`
gate (`waitForReadyQueue`) so nothing publishes until all registrants are ready, and `publish` nulled out when
`canTrack()` is false. Preview replaced that with the replay-buffer + per-destination cursor design (§5.5),
which is strictly better: late registrants get history rather than nothing.

Framework-agnostic in classic: `getShopAnalytics` (a plain async function running `SHOP_QUERY` with
`CacheLong`), `sendShopifyAnalytics`, `getClientBrowserParameters`, `getShopifyCookies`, `getTrackingValues`,
`AnalyticsEventName`, `AnalyticsPageType`, `ShopifySalesChannel`. React-coupled: the six `Analytics.*`
components, `useAnalytics`, `useCustomerPrivacy`, `useShopifyCookies`, and `ShopifyAnalytics.tsx`.

**For solidifront:** preview's subsystem is reusable with a ~30-line binding and has the better bus. Take
`custom_*` events from classic. Effect-native improvements: model destinations as `Layer`s with `Scope`d
teardown instead of returned unsubscribe functions, and use `@inContext(visitorConsent:)` so consent affects
*pricing and cart context*, not only event emission — classic already threads `visitorConsent` into cart
mutations (§1.3), so this is a proven path, not speculation.

---

## 6. Localization / markets

### 6.1 The request context is the whole design

`src/core/request-context.ts` (303 lines, no framework imports).

```ts
// request-context.ts:36-45 — exactly three fields
export type I18nConfig = {
  language: ShopifyLanguageCode;
  country: ShopifyCountryCode;
  /** Optional app route prefix for localized paths, for example "/es-es". */
  pathPrefix?: string;
};
type NormalizedI18nConfig<I18n extends I18nConfig = I18nConfig> =
  Omit<I18n, "pathPrefix"> & { pathPrefix: string };
```

- **No `currency`, no `market`, no `locale`.** `currency` exists only downstream on `ShopifyScriptsI18n`.
- The code types are the **intersection** of the two APIs' enums (`request-context.ts:33-34`):
  `type ShopifyLanguageCode = Extract<StorefrontLanguageCode, CustomerAccountLanguageCode>`, same for country.
- Extra keys **are preserved**, because the factory is generic over the literal:
  `createShopifyRequestContext<const I18n extends I18nConfig>`. `client/client.type-test.ts:273, 287` proves
  `i18n: {..., market: 'spain' as const}` survives to `client.i18n.market` typed `'spain'`. So a market handle is
  an app-owned passthrough field that Hydrogen never interprets.

The interface (`request-context.ts:58-113`), with a `__hydrogenShopifyRequestContextBrand: never` forcing use of
the factory:

| Member | Purpose |
| --- | --- |
| `i18n: NormalizedI18nConfig` | public; also re-exposed as `client.i18n` |
| `getForwardedRequestHeaders(): Headers` | public |
| `applyResponseHeaders(headers): void` | public; the response finalizer |
| `applyStorefrontRequestHeaders(headers): void` | stamps SDK/tracking/group headers on SFAPI subrequests |
| `captureSubrequestHeaders(headers): void` | collects `Set-Cookie` / `Server-Timing` from SFAPI |
| `markResponseAsPersonalized(reason): void` | forces private cache headers on the final response |
| `cookie?`, `uniqueToken?`, `visitToken?`, `legacyTokens?` | `_shopify_y` / `_shopify_s` equivalents |
| `readonly buyerIp?`, `requestGroupId`, `signal?`, `url?`, `storefrontOrigin?` | |

Construction (`request-context.ts:129-246`) is overloaded so that passing `buyerIp: string` returns
`ShopifyRequestContextWithBuyerIp`. `request` is deliberately loose (`request-context.ts:30`):
`Pick<Request, "headers"> & Partial<Pick<Request, "method"|"signal"|"url">>` — the concession that makes RSC-style
frameworks with only `headers()` work. It throws if `country`/`language` are missing or `buyerIp` is empty;
normalizes `pathPrefix` to `""` or `/leading-no-trailing`; derives `url` from `request.url ??
headers.get("x-storefront-url")`; derives `requestGroupId` from
`Custom-Storefront-Request-Group-ID` → `x-request-id` → `request-id` → `crypto.randomUUID()`; and bootstraps
tracking tokens from cookie → header → generated UUID.

`applyResponseHeaders` (`request-context.ts:211-244`) sets `powered-by: Shopify, Hydrogen`, replays captured
`Set-Cookie` and `Server-Timing`, applies private cache headers when personalized, and appends `_y;desc=…` /
`_s;desc=…` Server-Timing metrics **only for HTML/document responses** (sniffed via `sec-fetch-dest` / `accept`).

Per-request: yes — captured headers and the personalization reason live in per-call closures.
The usage pattern is identical in every example (`examples/solid-start/src/middleware.ts:40-46, 71`): resolve
locale → `createShopifyRequestContext` → pass to client and `handleShopifyRoutes` → `applyResponseHeaders` on the
way out.

### 6.2 Locale resolution: there is none

**No locale-resolution code exists anywhere in `core/`** — no path parsing into a locale, no subdomain lookup,
no cookie read, no `Accept-Language` parsing, no `localization` query, no static config.
`"accept-language"` appears only as an allowlisted proxy header (`src/core/headers.ts:23, 98`);
`localization` appears only in generated schema doc comments.

`skills/hydrogen-markets/SKILL.md:12, 14`:
> "Markets are an application routing concern plus Storefront API context. Hydrogen does not prescribe how a
> storefront chooses a market… The Hydrogen part is request-scoped `i18n` on `createShopifyRequestContext`."

The skill ships three copy-paste resolvers the *app* owns — subdomain (`SKILL.md:102-114`), per-market domain
(`122-135`), path prefix (`143-174`) — plus the rule at line 200: "Treat geolocation as a hint, not truth."
And the core rule: "Do not pass `country` or `language` in every query call. Resolve the market once at the
request boundary, set `i18n` when creating the request context, and let the client inject the context variables
into queries that declare them."

The only thing Hydrogen does with `pathPrefix` is string surgery, in `src/core/standard-routes/path.ts`:
`normalizePathPrefix` (8-13), `prependPathPrefix` (1-6), and `stripI18nPathPrefix` (55-66) — case-insensitive,
so `/fr-ca/products/x` matches the `/products/:productHandle` template.

### 6.3 `@inContext` coverage

SFAPI `2026-04` supports four contextualizations (https://shopify.dev/docs/api/storefront/2026-04):

| Argument | Since | Hydrogen preview | solidifront |
| --- | --- | --- | --- |
| `country` | — | injects the **variable** only | `upsertInContextWithLocale` (directive + variable) |
| `language` | 2022-04 | injects the **variable** only | `upsertInContextWithLocale` |
| `buyer: {customerAccessToken, companyLocationId}` | 2024-04 | **no** | `upsertInContextWithBuyer` |
| `visitorConsent` | 2025-10 | **no** | `upsertInContextWithVisitorConsent` |
| `preferredLocation` | — | **no** | no |

The CAAPI client injects **language only** (`customer-account/client.ts:307-311`), guarded on
`document.variableNames.has("language")`.

`country`/`language` are stripped from the caller's variable type (`client/types.ts:153-154`):
```ts
type AutoAddedVariableNames = "country" | "language";
type UserVariables<Doc> = Omit<VariablesOfDoc<Doc>, AutoAddedVariableNames>;
```
`buyer` and `preferredLocation` are not in that list, so they pass through as ordinary user variables — an app
*can* wire them, but must declare and pass them by hand on every document.

Market handles are never used; `Localization.market` exists only in generated schema types and is
**deprecated** in `2026-04` (https://shopify.dev/docs/api/storefront/2026-04/objects/Localization). For building
locale switchers, the `localization` query returns
`availableCountries { isoCode name availableLanguages { isoCode endonymName } }`
(https://shopify.dev/docs/api/storefront/2026-04/queries/localization) —
`@solidifront/vite-plugin-generate-shopify-locales` already consumes this at build time.

**`buyerIp` is not buyer identity** and *is* plumbed: `client/client.ts:169-176` sets
`Shopify-Storefront-Buyer-IP`; `interceptors/sfapi-proxy.ts:9-21` deletes any client-supplied value then re-sets
it from `requestContext.buyerIp`, throwing if a private client has none.

### 6.4 Standard routes

`src/core/standard-routes/defaults.ts:19-30` — the ten standard route identities:
```
product              /products/:productHandle
collection           /collections/:collectionHandle
collectionList       /collections, /products
page                 /pages/:pageHandle
policy               /policies/:policyHandle
blog                 /blogs/:blogHandle
article              /blogs/:blogHandle/:articleHandle
productInCollection  /collections/:collectionHandle/products/:productHandle
cart                 /cart
search               /search
```
Supported placeholders are exactly six (`articleHandle`, `blogHandle`, `collectionHandle`, `pageHandle`,
`policyHandle`, `productHandle`); unknown `:foo` is left literal. Page-template names map
`productInCollection → "product"`, `collectionList → "list-collections"`, `/ → "index"`.

Templates are prefix-free by contract; the prefix is applied at build time and stripped at match time.
`matchStandardRouteUrl` tries **Shopify defaults first, then app templates**, so `/products/x` keeps `product`
identity. `getStandardRouteTarget` (`redirects.ts:14-33`) only redirects for routes the app **explicitly
overrode** — `/products/x` never redirects unless the app configured a custom `product` template — and
`isStandardRouteSelfRedirect` prevents loops.

Customization is `createShopifyRouteTemplates(routes)` (`build.ts:38-42`), an identity function existing only to
pin literal types. The result feeds `handleShopifyRedirects({routeTemplates})`, `<ShopifyScripts routes=…>`, and
`getPredictiveSearchItemUrl`. `getStandardRoute` / `matchStandardRouteUrl` / `resolveStandardRouteUrl` are
internal, but are exposed to the browser as `shopify.routes.match` / `.resolve` via
`src/core/shopify-scripts/global.ts:80-81`.

### 6.5 Request routing — the interceptor pattern

```ts
// src/core/request-routing/route-types.ts:71-78
export type HydrogenRouteHandler<TExtra extends object = object> =
  (options: HydrogenRoutesOptions & TExtra) => null | Promise<Response>;
export type HydrogenRouteInterceptor<TExtra extends object = object> =
  (url: URL, ...args: Parameters<HydrogenRouteHandler<TExtra>>) => ReturnType<HydrogenRouteHandler<TExtra>>;
```
`null | Promise<Response>` is deliberate — **null is returned synchronously** so the caller falls through to
framework routing without awaiting. Hence the skill rule: "Call `handleShopifyRoutes` without awaiting it
immediately."

Fixed pre-routing order (`handle-shopify-routes.ts:11-19`):
`handleShopifyApiProxy` → `handleSfapiProxy` → **`handleShopifyRouteHandlers`** → `handleCheckoutRedirect` →
`handleMcpProxy` → `handleAgentProxy` → `handleAjaxApi`. First non-null wins, then
`safeApplyResponseHeaders`. A guard throws if `options.requestContext !== options.storefrontClient.requestContext`.
The dev variant appends `handleGraphiql`, selected via the `"development"` export condition
(`src/core/development.ts:4`).

Post-404 redirect chain (`handle-shopify-redirects.ts:22-37`), each try/caught and swallowed:
`handleAdminRedirect` → `handleStandardRouteRedirects` → `handleQueryParamRedirect` → `handleUrlRedirects`
(the last hitting SFAPI `urlRedirects(first: 1, query: "path:…")`).

Highlights: `handleCheckoutRedirect` matches `/checkout` and cart permalinks
`/cart/{variantId}:{quantity}[,…]`, resolves `cart.checkoutUrl`, merges query params, and forces
`payment=shop_pay` by default. `handleAjaxApi` matches locale-prefixed `/cart.js`, `/cart/add|update|change|clear`
and rewrites `.js` → `.json`. Both `handleAgentProxy` and `handleAjaxApi` are locale-prefix-aware via
`/^(?:\/[a-z]{2}(?:-[a-z]{2})?)?/i`.

**The interceptor list is a private module-level const, and neither `createProxyInterceptor` nor the individual
interceptors are exported.** The only supported extension point is the `handlers` array:
```ts
export function createShopifyRouteHandler<const TPathname extends string, const TMethod extends string>(
  pathname: TPathname, method: TMethod,
  handler: (context: ShopifyRouteHandlerContext) => Promise<ShopifyRouteHandlerResult>,
): ShopifyRouteHandler<TPathname, TMethod>
```
Result union: `{type:"json", data}` | `{type:"redirect", location}` | `{type:"error", error:{code,message}, status?}`.
Matching is **exact-pathname only** — no params, no wildcards. Built-in producers are
`createCartServerHandlers()`, `createPredictiveSearchServerHandlers()`,
`createCustomerAccountServerHandlers()`.

Minor API-surface gap worth noting if solidifront mirrors this: `ShopifyRouteSessionManager` is re-exported from
`registered-routes.ts:19` but is **missing** from the `core/index.ts` public type list.

### 6.6 Money

`src/core/money/` — `formatMoney(money, options)` (`format.ts:373-388`), overloaded
`MoneyV2 → FormattedMoney` and `readonly MoneyV2[] → FormattedMoneyRange`. **`options.locale` is required**
(`types.ts:12-35`) — nothing derives it from `i18n`; the app supplies the BCP-47 tag from its resolved market.
Uses `Intl.NumberFormat` + `formatToParts` + `formatRange` with a manual `min – max` fallback. Caching is a
module-scoped `Map<string, Intl.NumberFormat>` keyed `` `${locale}:${JSON.stringify(options)}` `` —
**unbounded, no eviction** (`money/cache.ts:12-23`). Values are lazily computed behind `#private` fields;
malformed currency codes degrade to `"19.99 USDC"` rather than throwing; range values must share a currency.
Framework-agnostic: only `Intl`.

### 6.7 Classic localization, for contrast

Classic also does **not** resolve locale in the library. The current skeleton hardcodes it
(`templates/skeleton/app/lib/context.ts`):
```ts
const hydrogenContext = createHydrogenContext({
  env, request, cache, waitUntil, session,
  // Or detect from URL path based on locale subpath, cookies, or any other strategy
  i18n: {language: 'EN', country: 'US'},
  cart: {queryFragment: CART_QUERY_FRAGMENT},
}, additionalContext);
```
The `getLocaleFromRequest` pattern lives in two *scaffolding* places, not the library:
- **CLI assets** — `packages/cli/assets/i18n/{subfolders,domains,subdomains}.ts`, injected by `h2 setup markets`.
  `subfolders.ts` is the canonical path-prefix resolver: uppercase the first path segment, test
  `/^[A-Z]{2}-[A-Z]{2}$/i`, split into `[language, country]`, and return `{language, country, pathPrefix}`.
  `domains.ts` maps the TLD instead.
- **The markets cookbook recipe** — `cookbook/recipes/markets/ingredients/.../app/lib/i18n.ts`: a
  `SUPPORTED_LOCALES` list, `.data` suffix stripping for React Router single-fetch, plus React hooks
  `useSelectedLocale()` / `useLocalizedPath()`.

So the answer across both Hydrogens is the same: **locale resolution is scaffolded, never shipped.** Solidifront
shipping it as a library feature (`createLocaleMiddleware` + a generated locale table) is a deliberate
divergence and a real one.

Other classic APIs in this area and their coupling:
- `getSelectedProductOptions(request)` — a **pure function**, trivially portable: iterate
  `new URL(request.url).searchParams` into `SelectedOptionInput[]`.
- `<CartForm>` — React + React Router (`useFetcher`). Its `CartForm.ACTIONS` union is a useful catalogue of the
  cart intents a UI needs: `AttributesUpdateInput | BuyerIdentityUpdate | Create | DiscountCodesUpdate |
  GiftCardCodesUpdate | GiftCardCodesAdd | GiftCardCodesRemove | LinesAdd | LinesUpdate | LinesRemove |
  NoteUpdate | SelectedDeliveryOptionsUpdate | MetafieldsSet | MetafieldDelete | …DeliveryAddresses…`.
  Preview's `createCartFormRegister` covers a strict subset.
- `useOptimisticCart` (`useFetchers()`), `useOptimisticVariant` (`useNavigation()`), `VariantSelector`,
  `Pagination` — all React **and** React Router coupled, and the hardest things to port. Preview replaced all of
  them with framework-agnostic stores (`createCartStore`, `createProductFormStore`, `createCollectionStore`),
  which is the single clearest architectural win of the rewrite and the strongest reason for solidifront to
  follow preview rather than classic on the client side.

**For solidifront.** Keep the locale middleware — neither Hydrogen ships one. Adopt the request-context shape:
resolve once at the request boundary into a request-scoped context (an Effect `Layer` providing `I18n`), never
per query. Port `handleShopifyRoutes` — cart permalinks, `/cart.js`, and `/checkout` are hit by installed apps
and marketing links, and a storefront that 404s them looks broken. And take preview's store-based client model
over classic's fetcher-based hooks: the stores are already framework-agnostic, and Solid signals are a better
host for them than React's.

---

## 7. Open questions / could not verify

1. **Classic Hydrogen was read remotely, not locally.** Only the `preview` branch is fetched into the submodule.
   All *classic* claims come from `Shopify/hydrogen@main` via the GitHub API plus shopify.dev, not from a
   working tree. They are cited by path and quoted, but not compiled or tested. To pull them local:
   `git -C references/hydrogen fetch origin main`. Two sub-packages were **not** read: the token-refresh
   internals in `packages/hydrogen/src/customer/auth.helpers.ts` (`checkExpires`/`refreshToken`/`Locks` —
   described from call sites only) and `Shopify/graphql-codegen/src/{sources,patch}.ts`. `[UNVERIFIED]`

2. **Preview's docs contradict its source on variable precedence — and classic behaves the other way.**
   `skills/hydrogen-storefront-client/SKILL.md` says "User-provided values take precedence over auto-injected
   ones", but preview's `client.ts:326-336` spreads `userVariables` first and *then* assigns
   `variables.country`/`variables.language`, so **the injected values win**. Classic explicitly guards
   (`if (!variables?.country && /\$country/.test(document))`), so **caller values win there**. One of the two is
   a bug. Check `client.test.ts` before fixing solidifront's precedence rule.
   `[UNVERIFIED — documented behaviour contradicts source]`

3. **Consent script version: docs are stale; the config contract genuinely differs.** Both classic and preview
   load consent-tracking-api **v0.2**, so https://shopify.dev/docs/api/customer-privacy documenting v0.1 is
   simply out of date. But the *config* differs for real: classic requires `checkoutDomain` +
   `storefrontAccessToken` and `errorOnce`s without them; preview passes `{headlessStorefront: true}` with
   `ConsentConfig = {mode?}` and has neither field anywhere. Whether v0.2 introduced a token-free headless mode
   that classic has not adopted, or preview depends on unreleased behaviour, is unresolved. This matters: get it
   wrong and consent silently fails, which is a compliance problem, not a bug. `[UNVERIFIED]`

4. **Cart cookie hardening — preview looks like a regression.** Preview's `createCartCookie`
   (`src/core/cart/cookie.ts:25-29`) emits `cart=<id>; Path=/; SameSite=Lax; Max-Age=1209600` with **no `Secure`
   and no `HttpOnly`**, hardcoded, with no rationale comment. Classic's `cartSetIdDefault(cookieOptions?)`
   accepts the full `{maxage, expires, samesite, secure, httponly, domain, path}` set. Omitting `HttpOnly` may be
   deliberate in preview (the browser cart store may read it), but the missing `Secure` and the loss of
   configurability both look like oversights. Solidifront should make these explicit options.

5. **`id_token` signature is never verified** (§4.3). Defensible over a TLS back-channel, but if solidifront
   ever accepts an `id_token` from a less-trusted path, this must not be copied.

6. **Refresh single-flight is per-process only** (§4.5). Keyed on the *old* refresh token, in an in-memory `Map`
   inside one `CustomerSession` instance. Behaviour under refresh-token rotation across multiple isolates or
   regions is untested and likely racy. Not verified against a real deployment. `[UNVERIFIED]`

7. **Does a first-party Solid binding ship?** `examples/README.md` is explicit that examples are not supported
   templates; only `templates/react-router` and `templates/nextjs` are distributed; there is no `solid.md` in
   any skill's `references/`. The example's own "Open questions" treats Solid bindings as undecided. This is the
   single biggest strategic unknown for solidifront and is worth asking directly at
   https://github.com/Shopify/hydrogen/discussions.

8. **Preview stability and timeline.** Root README: "APIs will change and some pieces are still landing."
   Version `2026.10.0-preview.0` on a HEAD date of `2026-08-14` — versioned ahead of the calendar. No RC date
   found.

9. **`Localization.market` deprecation.** Marked deprecated in `2026-04` with no replacement identified in the
   returned documentation chunk. What replaces market introspection is unverified. `[UNVERIFIED]`

10. **Effect port cost is unquantified.** Nothing in preview is Promise-hostile (plain async + `AbortSignal`), so
    `Effect.tryPromise` wrapping is mechanical. But `core/cart/cart.ts` holds mutable state in closures plus a
    module-level `Set`, and the analytics subsystem holds six module-level mutable singletons and a
    throw-on-double-init global. How much survives a `Layer`-scoped port is unknown.

11. **Analytics event payload details not exhaustively cross-checked against Shopify Pixels' expectations.** The
    payload types are read from source, but whether omitting an optional field degrades a merchant's admin
    analytics or an installed pixel was not tested. `[UNVERIFIED]`
