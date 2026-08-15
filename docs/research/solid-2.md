# Solid 2.0 — what changes, and what it means for a library shipping a Vite plugin and SSR utilities

**Research date:** 2026-08-14 (revised same day — see §0)
**Primary source A — source code:** `references/solid` submodule, branch `next`
**Exact commit read:** `15975306e524f197e2231ba6bd2c259c0dc39362` (committed 2026-08-12 16:09:14 -0700, `docs: sweep beta-era wording to RC across READMEs and 2.0 docs`)
**Primary source B — official docs:** `https://v2.solidjs.com` — the full Solid 2.0 documentation site, 141 pages (enumerated at `https://v2.solidjs.com/sitemap.xml`; index at `https://v2.solidjs.com/llms.txt`).

Published artifacts read directly (obtained via `npm pack` and read from the extracted tarball — the actual shipped files, not docs *about* them):

- `npm:@solidjs/vite-plugin@3.0.0-next.28` — `package/README.md`, `package/package.json`, `package/dist/types/src/*.d.ts` (published 2026-08-12T22:54:59Z)
- `npm:@solidjs/start@2.0.0` — `package/package.json` (published 2026-08-04)
- `npm:@solidjs/router@2.0.0-next.16` — `package/README.md`, `package/package.json` (published 2026-08-12T23:09:01Z)

Where a claim comes from the npm tarball rather than the submodule or the docs site, the citation says so. Anything I could not establish is in **Open questions / could not verify** at the bottom — it is not paraphrased into confidence.

---

## 0. Corrections to the first version of this document

The first draft of this file was written from the submodule and npm tarballs only. **I missed `v2.solidjs.com` entirely** — a complete, official, 141-page Solid 2.0 documentation site with a dedicated `/migration/from-solid-start` page. That was a research failure, not a gap in the sources. Several findings that were already reported upstream need explicit correction:

| # | First draft said | Corrected | Impact |
|---|---|---|---|
| **C1** | Treated `v2.solidjs.com` as a secondary source and cited only its landing page. | It is the **primary official source** and it confirms nearly all source-derived findings, while adding material the source tree does not contain. | Method, not conclusions. |
| **C2** | Implied solidifront could migrate `packages/start` in place. | **Wrong.** The official guide opens: "This is **not a SolidStart upgrade**… **Do not install Solid 2 into an existing SolidStart application**." The prescribed path is a *separate* Solid 2 app from a template, migrated incrementally, with the old app kept runnable. (`https://v2.solidjs.com/migration/from-solid-start`) | **Changes the project plan**, not just the dependency list. See §14. |
| **C3** | Did not mention `filesystem-routing`. | File-system routing is a **separate, router-neutral npm package** — `filesystem-routing@0.2.1`, `github.com/solidjs/filesystem-routing`, peer-dep `vite ^6\|\|^7\|\|^8` only (verified `npm view`). SolidStart's `FileRoutes` maps to `fileRoutes(pageRoutes)` from it. It also supplies **API routes** via `filesystem-routing/api`. | A new required dependency I had omitted from the stack. |
| **C4** | Ranked start mode + server functions as the **#1 most unstable** thing, citing the plugin README's "(experimental)". | The docs say server functions and start-mode serving are "**part of the Solid 2.0 RC surface**", with only "lower-level handler hooks and codec extensions" subject to change (`https://v2.solidjs.com/building-apps/server-functions`). The README and the docs disagree; I now report both and downgrade the risk. | **Materially less scary than I reported.** See §11. |
| **C5** | Open question: "does a disposed owner's in-flight Promise still resolve into the graph?" | Partly closed. There is a **public `isDisposed(node: Owner): boolean`** API whose documented purpose is exactly "ignore late work after the owner's component or reactive scope has been removed" (`https://v2.solidjs.com/reference/solid-js/advanced/owner-introspection/is-disposed`). The framework does **not** cancel for you; you guard. The underlying "is the resolution discarded" question is still not documented. | Load-bearing for the Effect bridge. See §6, §8. |
| **C6** | Did not mention async dependency-tracking limits. | **Major omission.** "Dependency tracking is synchronous. An async computation registers reactive reads made before its first `await`. Reads made after an `await` do not create dependency edges… **Read every reactive input before the first async gap.**" Dev builds turn unresolved post-`await` reads into errors reaching `Errored`. (`https://v2.solidjs.com/concepts/async-reactivity`) | **The single biggest constraint on an Effect-based data layer.** See §8. |
| **C7** | Said the deprecated `cache()` alias "is gone". | It is a **rename**: `cache()` → `query()` (`https://v2.solidjs.com/migration/from-solid-router`). Same function, new name. | Minor. |
| **C8** | Said nothing about deployment targets. | Provider integrations are documented and first-class: `@cloudflare/vite-plugin` (points `wrangler.jsonc` at `virtual:solid-ssr-handler`), `@netlify/vite-plugin`, Nitro v3 (adopts Solid's `ssr` environment). (`https://v2.solidjs.com/building-apps/deployment`) | Directly relevant — Shopify Oxygen is Workers-based. |

Everything else in the first draft was **confirmed** by the docs site. In particular: `@solidjs/start` 2.0 targets Solid 1.x and has no Solid 2 successor; start mode replaces it; middleware is fetch-style; `locals` typing moves to `@solidjs/web`; cookies are codec-only; `createAsync`/`createAsyncStore` are removed. Confirmations are marked **[both]** below where they matter.

---

## 1. What this means for solidifront

These are the decisions this research forces. Each links to the section that justifies it.

### D1 — `@solidjs/start` and `vinxi` are both dead ends. There is no SolidStart for Solid 2.0.

`@solidjs/start@2.0.0` shipped stable on 2026-08-04 and depends on `"solid-js": "^1.9.14"` and `"vite-plugin-solid": "^2.11.13"` (npm:@solidjs/start@2.0.0 `package/package.json`). It is the **Solid 1.x** framework, de-vinxi'd (h3 v2 + srvx + Vite 8 Environment API instead). It cannot host Solid 2.

The Solid 2.0 replacement for SolidStart is **a mode of the Vite plugin**: `@solidjs/vite-plugin`'s `start: true` option, described in its own README as "the serving layer that **replaces SolidStart**" (npm:@solidjs/vite-plugin@3.0.0-next.28 `package/README.md`, §`options.start`).

solidifront currently peer-depends on `@solidjs/start: ^1.2.0` and `vinxi: ^0.5.8`, and `@solidifront/start`'s `defineConfig` wraps `@solidjs/start/config`'s `defineConfig` (`/home/kookikodes/dev/solid-js/solidifront/packages/start/src/config/defineConfig.ts:2-5,83`). **That entire wrapper layer has no successor.** The Solid 2 shape is a plain `vite.config.ts` with `solid({ start: {...}, ssr: true })` (`references/solid/examples/hackernews/vite.config.ts:20`) **[both]**.

**And the official guidance is stronger than "rewrite the wrapper".** `https://v2.solidjs.com/migration/from-solid-start` opens by ruling out in-place migration: "This is **not a SolidStart upgrade**… **Do not install Solid 2 into an existing SolidStart application.**" The prescribed path is: scaffold a separate Solid 2 app from a template, migrate platform deps first (core reactivity, routing, meta), then move features one route-group or server-feature at a time, keeping the old app runnable and comparing behaviour at each step. For solidifront that means `packages/start` is a **new package built alongside the old one**, not an edit of it. See §14.

→ §4, §9, §13

### D2 — solidifront's plugin becomes a *sibling* of `@solidjs/vite-plugin`, not a wrapper of a framework config.

The Solid 2 plugin exports a **`Plugin[]`**, not a single plugin, and it now owns entries, dev serving, the build, the server-function endpoint, middleware composition, and (optionally) typed env (npm:@solidjs/vite-plugin@3.0.0-next.28 `package/dist/types/src/index.d.ts` — `export default function solidPlugin(options?: Partial<Options>): Plugin[]`). It also exposes an explicit **third-party integration contract** — `start.external`, `serverFunctions.devMiddleware: false`, `serverFunctions.configure`, `start.setup`, `start.middleware`, and the `virtual:solid-ssr-handler` / `virtual:solid-server-function-handler` / `virtual:solid-server-function-manifest` virtual modules. solidifront should target those seams rather than re-implementing them.

Two of solidifront's four current plugins survive nearly unchanged in shape (`resolveId`/`load` virtual modules — the locales plugin at `/home/kookikodes/dev/solid-js/solidifront/packages/plugins/vite-plugin-generate-shopify-locales/src/index.ts:93-113`, and the middleware virtual module at `/home/kookikodes/dev/solid-js/solidifront/packages/start/src/config/plugins/solidifrontMiddlewareSetup.ts:206-214`). What dies is the *framework-config* layer.

→ §4

### D3 — the storefront-context middleware must be rewritten to a web-standard `(request, next) => Response` function, and `vinxi/http` cookie helpers must go.

Solid 2 middleware is `(request, next) => Response | Promise<Response>`, configured as `solid({ start: { middleware: './src/middleware.ts' } })` and composed with `composeMiddleware` from `@solidjs/web` (`references/solid/documentation/solid-2.0/12-ssr-http.md:256-276`; npm:@solidjs/vite-plugin@3.0.0-next.28 `package/dist/types/src/ssr/index.d.ts` — `StartOptions.middleware`). It runs **inside the request-event scope**, so `getRequestEvent()!.locals.storefront = ...` works exactly as it does today.

But `getCookie`/`setCookie`/`getHeader` from `vinxi/http` (used at `/home/kookikodes/dev/solid-js/solidifront/packages/start/src/middleware/createLocaleMiddleware.ts:8,31-32` and `createStorefrontMiddleware.ts:14,38`) have no Solid 2 equivalent as ambient helpers — that was ruled on explicitly and declined. The replacement is `parseCookieHeader(event.request.headers.get("cookie"))` / `event.response.headers.append("set-cookie", serializeCookie(...))` (`references/solid/documentation/solid-2.0/12-ssr-http.md:139-171`, 288).

→ §9

### D4 — the `event.locals` type-augmentation target changes package, and solidifront's codegen for it must be rewritten.

solidifront generates `declare module "@solidjs/start/server" { interface RequestEventLocals { locale, storefront } }` (`/home/kookikodes/dev/solid-js/solidifront/packages/start/src/config/plugins/solidifrontMiddlewareSetup.ts:111-168`). In Solid 2 the blessed target is `declare module "@solidjs/web" { interface RequestEventLocals { ... } }` — a plain exported interface, and Start's ambient `App.RequestEventLocals` namespace is explicitly retired (`references/solid/documentation/solid-2.0/12-ssr-http.md:67-84`; `references/solid/.changeset/web-request-event-locals.md`).

→ §9

### D5 — every router-side async utility solidifront uses is either gone or renamed.

`createAsync` (`/home/kookikodes/dev/solid-js/solidifront/packages/start/src/localization/components/LocaleContext.tsx:3,47`) and `createAsyncStore` (`.../storefront/hooks.ts:1,23`) **are removed** in `@solidjs/router` 2.x: "`createAsync` / `createAsyncStore` are gone — read `query()` results with Solid 2 primitives: `createMemo`, `createProjection`, `createOptimistic`, `createOptimisticStore`" (npm:@solidjs/router@2.0.0-next.16 `package/README.md`, §Migration from 0.x → Data APIs). Confirmed by `https://v2.solidjs.com/migration/from-solid-router`, which maps `createAsync` → `createMemo` and `createAsyncStore` → `createProjection` "for deeply reactive objects/arrays" **[both]**.

`cache()` (used at `.../localization/utils/fetchLocale.ts:1,14`) is a **rename to `query()`**, not a removal — corrected from the first draft (C7). `json()` → `respond()` from `@solidjs/web`. `redirect`/`reload` move from `@solidjs/router` to `@solidjs/web`. `useSubmission` (singular) is removed in favour of `useSubmissions()` + optimistic primitives.

The reading pattern is now plain Solid (`https://v2.solidjs.com/routing/solid-router/data`):

```js
import { createMemo } from "solid-js";
const user = createMemo(() => getUser(params.id));   // getUser is a query()
return <h1>{user().name}</h1>;
```

→ §10

### D6 — decide where the Effect `ManagedRuntime` lives, because Solid 2 gives you two owners and they have different lifetimes.

solidifront currently parks a module-scope `ManagedRuntime.make(Layer.empty)` memo map (`/home/kookikodes/dev/solid-js/solidifront/packages/start/src/middleware/Runtime.ts:4`) and builds a per-request `extendedRuntime` inside the middleware. In Solid 2 there are three candidate homes with sharply different semantics:

1. **`event.locals`** — per-request, torn down by the HTTP handler, no reactive ownership. This is what the current code effectively does and it still works.
2. **The Solid owner tree** — `createRoot` is now **owned by its parent by default**; detaching requires `runWithOwner(null, ...)` (`references/solid/documentation/solid-2.0/02-signals-derived-ownership.md:17-45`). A runtime created under a component's owner is finalized when that subtree disposes.
3. **Module scope, explicitly detached** — `runWithOwner(null, () => ...)` is now the *documented* way to say "global lifetime" (ibid. :37-45).

Solid 2 has no built-in cancellation channel for async computations (no `AbortSignal` handed to the compute); the documented pattern is a returned cleanup from the effect apply phase (`references/solid/packages/solid-signals/src/signals.ts:468-476`). Anything that maps Effect fiber interruption onto Solid disposal has to be built on `onCleanup` / effect-cleanup, not on a framework-provided signal.

**New (missed in the first draft): `isDisposed(node: Owner): boolean` is public API**, and its documented purpose is precisely this problem — "ignore late work after the owner's component or reactive scope has been removed". The canonical guard shape is (`https://v2.solidjs.com/reference/solid-js/advanced/owner-introspection/is-disposed`):

```ts
function onSettleSafe(fn: () => void) {
  const owner = getOwner();
  queueMicrotask(() => {
    if (owner && isDisposed(owner)) return;
    runWithOwner(owner, fn);
  });
}
```

That is the pattern for resuming an Effect fiber's continuation back into the graph. Combined with `bindToOwner` (§6), it gives a complete Scope↔owner bridge without needing framework cancellation.

### D6b — **the async dependency-tracking rule may be a blocker for the obvious Effect integration. Design around it first.**

This is the largest thing the first draft missed (C6). From `https://v2.solidjs.com/concepts/async-reactivity`:

> "Dependency tracking is synchronous. An async computation registers reactive reads made before its first `await`. Reads made after an `await` do not create dependency edges…"
>
> "**Read every reactive input before the first async gap.**"

Dev builds escalate unresolved post-`await` reads into **errors** that reach `Errored`; production builds "may leave them pending without retry capability".

The naive Effect integration — an `Effect.gen` that reads Solid signals wherever it needs them, run inside a `createMemo` — **silently loses reactivity** for every read after the first yield/await, and errors in dev. Any solidifront primitive that runs Effect programs inside a computation must hoist all reactive reads into a synchronous prelude before handing off to the Effect runtime. This should be an explicit design constraint on the API, and probably enforced by shape (e.g. `useStorefrontQuery(() => ({ ...all reactive inputs }), (inputs) => Effect...)`) rather than left to callers.

→ §6, §8

### D7 — solidifront's env plugin is largely subsumed; check before rebuilding it.

`solidifrontEnvSetup` hand-rolls `SHOPIFY_*` env validation with an Effect `Schema` and rewrites `src/global.d.ts` (`/home/kookikodes/dev/solid-js/solidifront/packages/start/src/config/plugins/solidifrontEnvSetup.ts:78-169`). Start mode ships first-party typed env: a root `env.ts` default-exporting `{ server, client }` maps of **Standard Schema** validators, exposed as `virtual:env/server` / `virtual:env/client`, with a generated `solid-env.d.ts`, a client-graph leak error, and a build-time scan for server values appearing in client chunks (npm:@solidjs/vite-plugin@3.0.0-next.28 `package/README.md` §`env`; `package/dist/types/src/start-env.d.ts`) **[both]**.

The docs strengthen this: "The validators may come from **different Standard Schema libraries** because the plugin reads the shared Standard Schema interface" — the contract is the interface, not a blessed library list (`https://v2.solidjs.com/building-apps/environment`). Zod is what the official template uses; no library is privileged. Effect Schema implements Standard Schema, so solidifront's existing schemas are very likely drop-in. **Still not empirically verified by me** — worth a 20-minute spike before deciding to delete `solidifrontEnvSetup`.

Two details worth keeping: `virtual:env/server` **also exposes the public client values**, not just server ones; and the leak scan only catches validated server strings of 8+ characters appearing quoted in non-vendor chunks — it is a backstop, "not a guarantee that a client value is secret" (ibid.).

Related: the plugin also always claims bare `server-only` / `client-only` specifiers as build-time boundary markers (`package/dist/types/src/boundary-modules.d.ts`). That is directly useful for pinning Effect layers that must never reach the browser.

### D8 — the JSX compiler is native by default; solidifront's library build pipeline is affected.

`compiler` defaults to `"native"` (`@dom-expressions/compiler`, with a `compiler-wasm32-wasi` fallback); `"babel"` is an escape hatch (npm:@solidjs/vite-plugin@3.0.0-next.28 `package/README.md` §`options.compiler`). `babel-preset-solid@2.0.0-rc.0` still exists and still wraps `@dom-expressions/babel-plugin-jsx`, but with a new `moduleName: "@solidjs/web"` and a new built-ins list including `Loading`, `Reveal`, `Repeat`, `Errored` (`references/solid/packages/babel-preset-solid/index.js:5-25`). solidifront ships JSX through `tsup-preset-solid` (`/home/kookikodes/dev/solid-js/solidifront/packages/start/tsup.config.ts:5,9-39`) — that preset is 1.x-era and will need to be re-pointed or replaced.

### D9 — pin exact versions. `@solidjs/vite-plugin` publishes prereleases to the `latest` npm tag.

`npm view @solidjs/vite-plugin dist-tags` → `{"next":"3.0.0-next.28","latest":"3.0.0-next.28"}`. A bare `npm i -D @solidjs/vite-plugin` installs a `next.28` prerelease. Meanwhile `solid-js`'s `latest` is still `1.9.14` and 2.0 lives on `next` (`2.0.0-rc.0`). Version skew across the coordinated release is a real hazard — see §11.

### D10 — file-system routing and API routes are now a third-party-shaped dependency: `filesystem-routing`.

Missed in the first draft (C3). `filesystem-routing@0.2.1` (`github.com/solidjs/filesystem-routing`, verified via `npm view`) is described as "**Router-neutral** file-system routing: scans a route directory into a neutral route manifest with pluggable conventions and delivery adapters". Its only peer dep is `vite ^6 || ^7 || ^8` — it does not depend on Solid or on a router.

It supplies two things solidifront currently gets from SolidStart:

- **Page routes.** `fileRoutes()` from `filesystem-routing/vite` scans `src/routes` (default), serves a `virtual:file-routes` manifest exporting `routes` (flat) and `pageRoutes` (nested, route-groups stripped), tree-shakes picked exports, and hot-updates in dev. Options include `dir`, `extensions`, `codeSplitting`, `httpMethods`, `components`. Consumed as `createRouter({ routes: fileRoutes(pageRoutes) })` via `@solidjs/router/fs`. SolidStart's `FileRoutes` component must **not** be carried over — "Solid Router 2 has a different contract". (`https://v2.solidjs.com/reference/filesystem-routing/vite`, `https://v2.solidjs.com/migration/from-solid-start`)
- **API routes.** Enabled with `fileRoutes({ httpMethods: true })`, then dispatched **from middleware**: `export default [createAPIHandler(routes)]` using `createAPIHandler` from `filesystem-routing/api`. Route modules export uppercase verbs (`export const GET: APIHandler = ...`). Unmatched methods fall through to the next middleware; `HEAD` falls back to `GET`. (`https://v2.solidjs.com/building-apps/middleware-and-api-routes`)

**Note the architectural consequence:** API routes are *middleware*, not a separate framework concept. If solidifront wants to expose Shopify webhook/proxy endpoints, it composes into the same middleware array as the storefront-context injector, and ordering between them is solidifront's to define.

Being at `0.2.1` with a `latest`-only dist-tag, this package is young — factor it into §11.

### D11 — the deployment story is provider Vite plugins, and Workers is a documented target.

Relevant because Shopify Oxygen is Workers-based. `https://v2.solidjs.com/building-apps/deployment`:

- Build emits `dist/client/` + `dist/server/server.js`; the latter exports named `handleRequest(request)` and a default Fetchable `{ fetch(request) }`.
- **Cloudflare:** `@cloudflare/vite-plugin` associates the Worker with Solid's `ssr` environment, with `wrangler.jsonc` pointing at `virtual:solid-ssr-handler`.
- **Netlify:** `@netlify/vite-plugin` turns the server entry into a streaming Netlify Function.
- **Nitro v3:** adopts Solid's `ssr` environment, giving presets and route rules with no custom server entry.
- **Bun / Deno:** start the module that default-exports the Fetchable.

Pair this with `serverFunctions: { devMiddleware: false }` (§4.4) so server functions run in workerd with real bindings in dev, matching production.

**No replacement exists** for: Nitro tasks and storage, framework route prerendering, islands and SolidStart rendering modes, Nitro WebSocket support, and the SolidStart dev toolbar — the migration guide lists these under "Removed features" and says to "resolve these with host-specific integrations or alternate libraries" (`https://v2.solidjs.com/migration/from-solid-start`). Check whether solidifront or its consumers rely on prerendering in particular.

---

## 2. Release / version status (verified 2026-08-14 via `npm view`)

| Package | `latest` | `next` | Targets |
|---|---|---|---|
| `solid-js` | `1.9.14` | `2.0.0-rc.0` (2026-08-12) | core |
| `@solidjs/web` | `2.0.0-rc.0` | `2.0.0-rc.0` | web runtime, SSR, request event, server functions |
| `@solidjs/signals` | `2.0.0-rc.0` | `2.0.0-rc.0` | reactive core |
| `babel-preset-solid` | `1.9.12` | `2.0.0-rc.0` | JSX (babel path) |
| `@solidjs/vite-plugin` | `3.0.0-next.28` | `3.0.0-next.28` | **renamed from `vite-plugin-solid`**; Vite 6/7/8 |
| `@dom-expressions/compiler` | `0.50.0-next.25` | `0.50.0-next.42` | native JSX compiler |
| `@solidjs/router` | `1.0.0` (2026-07-28, `solid-js ^1.8.6`) | `2.0.0-next.16` (`solid-js ^2.0.0-rc.0`) | routing |
| `@solidjs/meta` | `0.29.4` | `1.0.0-next.2` | head management |
| `@solidjs/start` | `2.0.0` (2026-08-04, **`solid-js ^1.9.14`**) | — | Solid **1.x** metaframework |
| `vinxi` | `0.5.11` | — | superseded everywhere |

The submodule's own changeset prerelease tag is `rc` (`references/solid/.changeset/pre.json` — `"mode": "pre", "tag": "rc"`), and the repo README says: "You're on the **`next`** branch — Solid 2.0… **Solid 2.0 (Release Candidate)**" (`references/solid/README.md:15-23`). `@solidjs/signals`' README states "**Status:** Release Candidate — this package is the reactive foundation of SolidJS 2.0. The API is frozen barring showstoppers before the final release." (`references/solid/packages/solid-signals/README.md:5`).

The monorepo pins `@solidjs/vite-plugin: 3.0.0-next.27` and `@dom-expressions/*: 0.50.0-next.42` as devDependencies (`references/solid/package.json`), and excludes both from pnpm's `minimumReleaseAge` (`references/solid/pnpm-workspace.yaml`) — i.e. the core team itself is consuming these as fast-moving prereleases.

The 2.0 package set is (`references/solid/README.md:120-133`):

| Package | Purpose |
|---|---|
| `solid-js` | core runtime — components, flow controls, context, hydration, **stores** |
| `@solidjs/signals` | reactive primitives |
| `@solidjs/web` | web runtime: `render`/`hydrate`, SSR, request event, HTTP exchange, server functions, `Portal`, `Dynamic` |
| `@solidjs/h`, `solid-html`, `@solidjs/universal`, `solid-element`, `babel-preset-solid` | alternate factories / renderers / compile |

---

## 3. Import-path and API changes (1.x → 2.0), condensed

Full list: `references/solid/documentation/solid-2.0/MIGRATION.md` (983 lines) and `references/solid/packages/solid/CHEATSHEET.md` (665 lines, ships inside the npm package as `node_modules/solid-js/CHEATSHEET.md`).

**Subpaths removed** (`MIGRATION.md:939-946`):
`solid-js/web` → `@solidjs/web`; `solid-js/store` → `solid-js` (stores are core exports now); `solid-js/h` → `@solidjs/h`; `solid-js/html` → `@solidjs/html`; `solid-js/universal` → `@solidjs/universal`; `solid-js/jsx-runtime` → `@solidjs/web/jsx-runtime`. `jsxImportSource` must become `"@solidjs/web"` — `solid-js` no longer exports a JSX namespace (`MIGRATION.md:65-98`; `references/solid/README.md:96-105`).

**Renames** (`MIGRATION.md:948-961`): `Suspense`→`Loading`, `SuspenseList`→`Reveal`, `ErrorBoundary`→`Errored`, `mergeProps`→`merge`, `splitProps`→`omit`, `createSelector`→`createProjection`, `unwrap`→`snapshot`, `onMount`→`onSettled`, `equalFn`→`isEqual`, `getListener`→`getObserver`, `classList`→`class` (object/array), `Context.Provider`→`<Context value={...}>`.

**Removed** (`MIGRATION.md:963-983`): `createResource`, `startTransition`/`useTransition`, `batch`, `createComputed`, the `on()` helper, `onError`/`catchError`, `produce` (now default), `createMutable`/`modifyMutable`, `from`/`observable`, `createDeferred`, `indexArray`, `Index`, `resetErrorBoundaries`, `enableScheduling`, `writeSignal`, `use:` directives, `attr:`/`bool:`/`on:`/`oncapture:` namespaces, `/*@once*/`.

**Behavioural changes that will bite a library author** (`MIGRATION.md:100-201`, `CHEATSHEET.md:637-658`):

- **Writes are microtask-batched and reads do not see them until flush.** `setCount(1); count() // still 0`. `flush()` forces it. `batch` is gone.
- **`createEffect` is two-argument only** — `(compute, apply)`. The single-arg form is a hard error with a dedicated diagnostic (`references/solid/packages/solid-signals/src/signals.ts:486-495` — `@deprecated ... See [MISSING_EFFECT_FN]`, typed `never`).
- **Writing a signal/store from inside an owned reactive scope throws in dev.** Opt out narrowly with `{ ownedWrite: true }` (`references/solid/documentation/solid-2.0/01-reactivity-batching-effects.md:18-41`).
- **Top-level reactive reads in a component body warn in dev**, including prop destructuring (ibid. :43-79).
- `createMemo`'s second argument is now `options`, not an initial value.
- `useContext` on a default-less context returns `T` (not `T | undefined`) and throws `ContextNotFoundError` (§7).

---

## 4. The compiler / plugin story (the important one)

### 4.1 The package renamed and became a `Plugin[]`

`vite-plugin-solid` → **`@solidjs/vite-plugin`**, repo `github.com/solidjs/solid-vite-plugin`, current `3.0.0-next.28`, supporting **Vite 6, 7, 8** (Vite 3–5 dropped). Peer deps: `solid-js ^2.0.0-rc.0`, `@solidjs/web ^2.0.0-rc.0`, `vite ^6 || ^7 || ^8` (npm:@solidjs/vite-plugin@3.0.0-next.28 `package/package.json`, `package/README.md` header + Requirements).

Public surface (`package/dist/types/src/index.d.ts`):

```ts
export default function solidPlugin(options?: Partial<Options>): Plugin[];
export { serverFunctions };            // standalone factory for meta-frameworks
export { devStylePatch };              // dev CSS/HMR reconciliation script
export type { ServerFunctionsOptions, ServerFunctionsFilter, StartOptions };
```

`Options` = `{ include, exclude, dev, ssr, start, compiler, hot (deprecated → refresh), extensions, babel, solid, typescript, serverFunctions, refresh }`.

### 4.2 The JSX transform contract

- Default backend is **`compiler: "native"`** — `@dom-expressions/compiler` (a native binary, with automatic `@dom-expressions/compiler-wasm32-wasi` fallback on platforms without one, e.g. WebContainers).
- `compiler: "babel"` runs `babel-preset-solid` instead and **only** swaps the JSX transform; the `lazy()` module-URL transform and the HMR refresh transform are native in both modes.
- With `compiler: "native"` the plugin is "normally fully Babel-free"; **supplying custom `babel` options reintroduces a Babel support pass ahead of the native JSX transform to host them** (`package/dist/types/src/index.d.ts`, `Options.babel` JSDoc). That is the hook for a third-party Babel plugin, and it explicitly costs you the Babel-free path.
- `options.solid` passes `@dom-expressions/compiler` / `babel-plugin-jsx` options through to whichever backend is selected, merged over Solid's defaults.
- The defaults being merged over are visible in the submodule: `moduleName: "@solidjs/web"`, `builtIns: ["For","Show","Switch","Match","Loading","Reveal","Portal","Repeat","Dynamic","Errored"]`, `contextToCustomElements: true`, `wrapConditionals: true`, `generate: "dom"` (`references/solid/packages/babel-preset-solid/index.js:5-25`).
- HMR: the refresh transform is native and drives a **dev-only `solid-js/refresh` runtime entry that ships inside Solid itself**; the standalone `solid-refresh` package is no longer used (`package/README.md` §Note on HMR; corroborated by `references/solid/.changeset/add-refresh-subpath.md`).

### 4.3 Start mode — the SolidStart replacement, inside the plugin

`start: true` (sugar for `start: {}`) turns the plugin into the serving layer. `ssr: true` alongside selects SSR start mode; without it, client mode (experimental). Objects on `ssr` are now a config-time error — the old `ssr: {...}` options moved to `start: {...}`.

`StartOptions` (`package/dist/types/src/ssr/index.d.ts`):

| Option | Meaning |
|---|---|
| `app` | root component module; default `src/App.{tsx,jsx,ts,js}` |
| `document` | document shell; default `src/Document.{tsx,jsx}`, else a built-in |
| `entryServer` / `entryClient` | authored entries (must come in pairs); otherwise generated |
| `middleware` | server-only module default-exporting one or an array of `(request, next) => Response` |
| `setup` | server-only `(event, App) => Component \| void`, run per request after middleware and immediately before `renderToStream` — the seam for routers that must build a request-bound instance |
| `env` | Standard-Schema typed env → `virtual:env/server` / `virtual:env/client` |
| `external` | hand the whole server side to a host integration |

Production output: `dist/client` + `dist/server/server.js`, whose entry is **`virtual:solid-ssr-handler`** exporting named `handleRequest(request): Promise<Response>` and a default `{ fetch(request) }` Fetchable (Workers/Nitro/Netlify/Bun/`deno serve` shape). `vite preview` runs the built artifact with no server file.

### 4.4 The integration seams a third-party plugin actually gets

This is the answer to "what hooks does a third-party Vite plugin have to integrate with":

1. **Ordinary Vite plugin composition.** `solid()` returns an array; you add your own plugins around it. `enforce: 'pre'` plugins (`boundaryModules`, `startEnv`) are already in the array.
2. **`start.external: true`** — the whole-server handover. Solid skips its server-build wiring and stands its dev middlewares down, but still provides generated entries, the client manifest, and `virtual:solid-ssr-handler`.
3. **Automatic provider detection.** If a provider plugin replaces the dev `ssr` environment with a non-runnable one, Solid detects it and stands down without any flag. The detection is presence-checking `environment.runner` rather than `instanceof RunnableDevEnvironment`, deliberately, to survive duplicate `vite` copies in workspace installs (`package/dist/types/src/environment.d.ts`).
4. **`serverFunctions.devMiddleware: false`** — endpoint-only handover, so a host (e.g. `@cloudflare/vite-plugin`) dispatches server functions in *its* environment with real bindings. The host loads `virtual:solid-server-function-handler` and calls `handleServerFunctionRequest(request)` — identical contract to production. A host owning dev dispatch should side-effect import `virtual:solid-server-function-manifest`.
5. **`serverFunctions.configure: './src/server-config.ts'`** — a server-only module pinned into the handler graph, evaluated **before any dispatch on every surface**. This is the documented home for `configureServerFunctionsServer({...})` registration, and it is immune to the dev-restart race where app-graph registration only loads on the first page render. (`references/solid/examples/notes/vite.config.ts:5-11` uses it for the router's single-flight collector.)
6. **`start.setup`** — a per-request hook `(event, App) => Component | void`, run inside the request scope after middleware, before `renderToStream`. **This is the closest thing to a per-request DI seam in the whole system** and is directly relevant to injecting a request-scoped Effect runtime.
7. **`serverFunctions()` standalone export** — for meta-frameworks that need to control plugin ordering; it never installs the dev middleware.
8. **`registerDevAssetResolver(root, resolver)` and the HTTP bridge at `GET /@solidjs/vite-plugin/dev-manifest?key=…`** — for hosts evaluating server modules outside the Vite process (`package/dist/types/src/dev-manifest.d.ts`).
9. **`buildApp` hook (Vite 7.1+)** — with `ssr` enabled the plugin orders builder-mode app builds client-first, because server builds read the client manifest.

### 4.5 Virtual module names to know

`virtual:solid-ssr-handler`, `virtual:solid-server-function-handler`, `virtual:solid-server-function-manifest`, `virtual:solid-manifest`, `virtual:env/server`, `virtual:env/client`. Plus the claimed bare specifiers `server-only` and `client-only`.

**Collision risk for solidifront:** its middleware virtual module is `@solidifront/start/middleware:internal` → `\0@solidifront/start/middleware:internal` (`/home/kookikodes/dev/solid-js/solidifront/packages/start/src/config/plugins/solidifrontMiddlewareSetup.ts:19-20`), which does not collide. But note the Solid plugin claims `server-only`/`client-only` at `enforce: 'pre'` and will shadow the React-ecosystem packages of the same name.

---

## 5. Reactivity: what actually changed

- **Microtask batching by default**; `flush()` / `flush(fn)` to drain synchronously. `batch` removed. (`01-reactivity-batching-effects.md:84-106`)
- **Split effects**: `createEffect(compute, apply, options?)`. All compute halves in a batch run before any apply half. The apply half runs **untracked** and returns cleanup. `createRenderEffect` is the same split but runs synchronously during render. (`01-…:108-133`, `217-234`)
- **`createEffect` error handling** via an `EffectBundle` second argument `{ effect, error }`. Rethrowing from `error` escalates to the nearest error boundary; an *uncaught throw in the effect phase* is treated as an unhandled application error and **permanently halts the reactive system if there is no boundary** (`references/solid/packages/solid-signals/src/signals.ts:437-448`). That is a hard constraint for anything running Effect programs in the apply phase.
- **Lazy memos + `unobserved`**: `createMemo(fn, { lazy: true })` defers first compute *and* opts into autodisposal when the subscriber count hits zero; non-lazy owned memos live for their owner's lifetime; unowned memos autodispose. `unobserved` fires when a signal/memo loses all subscribers (`01-…:134-172`).
- **Stores moved into `solid-js`**, setters are draft-first (`produce` is the default), `snapshot` replaces `unwrap`, `storePath(...)` is the opt-in path-setter compat shim, `deep(store)` for deep tracking, `reconcile(value, key)` for identity-preserving updates (`MIGRATION.md:381-447`, `04-stores.md`).
- **New primitives**: `Repeat`, `action(fn)`, `createOptimistic`/`createOptimisticStore`, `createProjection(fn, seed)`, `isPending(fn)`, `latest(fn)`, `refresh(target)`, `affects(target, key?)`, `resolve(fn)`, `dynamic(source)`, `clientOnly(...)`, `httpStatus`/`httpHeader`, `ssrSource`, `deferStream`, `renderToStream(...).readable` (`MIGRATION.md:664-690`).

---

## 6. Ownership, cleanup, and disposal (for the Effect `Scope` mapping)

**This is where the 1.x mental model diverges most quietly.**

### The owner tree

Every reactive node lives in an owner tree used for both disposal and context propagation (`references/solid/packages/solid-signals/README.md:199-222`). Owner shape internals: `_firstChild` / `_nextSibling` / `_prevSibling` / `_parent` / `_context` / `_disposal` / `_cleanup` (`references/solid/packages/solid-signals/src/core/owner.ts`).

**Changed from 1.x: `createRoot` is owned by its parent by default.** A root created inside an existing owned scope is disposed when that parent disposes. You still get the `dispose` callback (`02-signals-derived-ownership.md:17-31`; implementation `references/solid/packages/solid-signals/src/core/owner.ts:355-361`):

```ts
export function createRoot<T>(
  init: ((dispose: () => void) => T) | (() => T),
  options?: { id?: string; transparent?: boolean }
): T {
  const owner = createOwner(options);
  return runWithOwner(owner, () => init(() => owner.dispose()));
}
```

**Detaching is now explicit**: `runWithOwner(null, fn)` is the documented way to create a module singleton or an external integration with global lifetime (`02-…:33-45`). The RFC states the motivation directly: "In 1.x it's easy to accidentally create unowned reactive graphs (especially in library code), which leads to leaks and confusing cleanup" (`02-…:11`).

`runWithOwner(owner, fn)` sets the owner **and disables tracking** for the duration (`references/solid/packages/solid-signals/src/core/core.ts:1093,1108-1110`), and warns `RUN_WITH_DISPOSED_OWNER` in dev if the owner is already disposed (ibid. :1094-1105).

### Disposal order — precise

`disposeChildren(node, self, zombie?)` (`references/solid/packages/solid-signals/src/core/owner.ts:63-131`):

1. If already flagged `REACTIVE_DISPOSED`, return (idempotent).
2. Set `REACTIVE_DISPOSED` on self; snap pending/`isPending` companions so a disposed source cannot latch a spinner forever.
3. Remove each child from the scheduler heaps and unlink its dependency edges, then recurse into it. **Children are disposed depth-first, in `_firstChild` → `_nextSibling` order** (i.e. registration order, not reverse).
4. Splice self out of the parent's sibling chain (O(1), skipped during batch/zombie disposal).
5. `runDisposal(node)` — run the `onCleanup` callbacks registered on this owner (`_disposal`, a single `Disposable` or an array). **Arrays are iterated forward — registration order, FIFO, not LIFO** (`owner.ts:133-146`). This is the opposite of the `defer`/`Scope.addFinalizer` convention in most effect systems, and matters for any Solid-owner ↔ Effect-`Scope` bridge.
6. **Last**, if the node has an effect-returned cleanup (`node._cleanup`), run it — "Final effect-returned cleanup fires at true disposal, **after `_disposal`** to mirror rerun ordering (compute-phase teardown first, cleanup last)" (source comment, `owner.ts:123-131`).

`dispose(node)` also removes the node from every scheduler heap first, because a still-queued node would be recomputed by the next flush and `recompute()` rewriting `_flags` would clear `REACTIVE_DISPOSED` — resurrecting it (`owner.ts:52-56`, referencing issue #2983).

### `onCleanup` — what changed and what it's for now

`onCleanup(fn)` still exists and "runs before the next compute and on disposal" (`CHEATSHEET.md:520-525`), but it has been **demoted to a library/internals primitive**:

- The cheatsheet puts it under "Advanced / escape hatches" and says explicitly: "For component-level setup-and-teardown, **use `onSettled` and return a cleanup**; `onCleanup` is for library/primitive internals where the cleanup is tied to a reactive run, not a component lifecycle" (`CHEATSHEET.md:130`, `520-525`).
- `01-reactivity-batching-effects.md:268`: "**`onCleanup`** remains for reactive lifecycle cleanup inside computations. But is not expected to be used inside side effects."
- Two dev diagnostics guard it (`references/solid/packages/solid-signals/src/signals.ts:68-95`):
  - `NO_OWNER_CLEANUP` — **warns** (does not throw) if called with no owner; the callback will never run.
  - `CLEANUP_IN_FORBIDDEN_SCOPE` — **throws**: "Cannot use `onCleanup` inside `createTrackedEffect` or `onSettled`; return a cleanup function instead."
- The JSDoc names the exact library idiom for binding an external resource's disposal to a captured owner (`signals.ts:55-67`):

```ts
function bindToOwner<T extends { dispose(): void }>(owner: Owner, resource: T): T {
  runWithOwner(owner, () => onCleanup(() => resource.dispose()));
  return resource;
}
```

That is the shape an Effect `Scope`↔Solid-owner bridge should take.

### `onMount` → `onSettled`

`onSettled(fn)` replaces `onMount` and **returns a cleanup function** rather than a previous value. It works in component bodies (after first reactive settle) and in event handlers (defer until the triggered transition settles). Critically: "Unlike other tracked scopes these primitives cannot create nested primitives which is a breaking change from Solid 1.x" (`01-…:255-266`, and the `CONFIG_CHILDREN_FORBIDDEN` flag enforcing it at `signals.ts:80-95`). So `onSettled` is **not** a place to construct an Effect runtime that itself creates Solid primitives.

### 1.x → 2.0 delta summary for ownership

| | 1.x | 2.0 |
|---|---|---|
| `createRoot` default lifetime | detached | **owned by parent** |
| detaching | default | `runWithOwner(null, fn)`, explicit |
| component setup/teardown | `onMount` + `onCleanup` | `onSettled(() => { …; return cleanup })` |
| `onCleanup` role | general lifecycle | reactive-run cleanup, library internals |
| `onCleanup` inside `onSettled` | fine | **throws** (`CLEANUP_IN_FORBIDDEN_SCOPE`) |
| effect cleanup | `onCleanup` inside the effect | return a function from the effect **apply** phase |
| cleanup ordering | — | `_disposal` callbacks first, effect-returned cleanup last |

---

## 7. Context in 2.0

### Two layers

**`@solidjs/signals`** ships the low-level, owner-targeted primitives (`references/solid/packages/solid-signals/src/core/context.ts`):

```ts
export interface Context<T> { readonly id: symbol; readonly defaultValue: T | undefined }
export function createContext<T>(defaultValue?: T, description?: string): Context<T>
export function getContext<T>(context: Context<T>, owner: Owner | null = getOwner()): T   // @internal
export function setContext<T>(context: Context<T>, value?: T, owner: Owner | null = getOwner()): void // @internal
```

Both `getContext`/`setContext` are marked `@internal` and documented as "Exposed here for cross-package wiring (e.g. hydration-aware context plumbing)". `getContext` throws `NoOwnerError` with no owner and `ContextNotFoundError` when unset with no default. `setContext` **copies** the owner's context record (`owner._context = { ...owner._context, [id]: value }`) precisely so child values don't leak to parents.

**`solid-js`** ships the user-facing `createContext` / `useContext`. The provider is the context itself:

```jsx
const Theme = createContext("light");
<Theme value="dark">{props.children}</Theme>   // NOT <Theme.Provider>
```

(`MIGRATION.md:628-641`, `02-signals-derived-ownership.md:47-67`.)

### The typing change that removes boilerplate

`createContext<T>()` (no default) is typed `Context<T>` — `useContext` returns `T` directly and **throws `ContextNotFoundError`** if no provider is mounted. The runtime already did this in 1.x; the type said `T | undefined`, which is why the ecosystem is full of `useX`-with-throw wrappers. Those are now dead code (`02-…:69-91`, `MIGRATION.md:642-662`).

### How a library provides a per-app or per-request value

The RFC is blunt about the boundary (`02-…:89`, echoed at `CHEATSHEET.md:345-347`):

> If you want truly app-wide state, **don't use Context** — a module-scope signal/store *is* a global. Context is for scoping state to a subtree.

So:

- **Per-app / per-subtree** → `createContext` + `<Ctx value={...}>` around the subtree.
- **Truly global** → module scope, and if it creates reactive primitives, `runWithOwner(null, ...)`.
- **Per-request on the server** → **not context**. The request event (§9).

### Does context survive SSR/hydration?

Context is carried on the owner (`owner._context`), and the server builds a full owner tree during SSR — but a **lean SSR-specific owner runtime** replaced the upstream signals owner for the server: a forward-only linked list with cleanup hooks and an id, plus a freelist that recycles owners at end-of-render (`references/solid/.changeset/lean-ssr-owner-runtime.md`). Context **values are not serialized** by context machinery; what crosses the wire is the serialized *values of async computations*, governed per-primitive by `ssrSource` (§8). A context value on the client comes from the client re-running the provider, not from the server's context record.

Relevant sharp edge for libraries that create reactive nodes during hydration: hydration ids are positional, so a client-only node created while hydrating shifts every later sibling's id. The supported fix is the `transparent: true` option (integration tier, accepted by effects and memos) — "this is how `@solidjs/router` wires link state and scroll restoration" (`05-async-data.md:188`).

---

## 8. Async primitives — the `createResource` successor

### The contract

There is no resource primitive. **Any computation may return a `Promise` or an `AsyncIterable`** (`05-async-data.md:17-32`):

```js
const user = createMemo(() => fetchUser(params.id));   // 1.x: createResource(id, fetchUser)
```

A read of an unresolved value follows the "not ready" path through the reactive graph to the nearest `<Loading>` boundary. Library authors can signal the same state manually by `throw new NotReadyError()` (`CHEATSHEET.md:580-581`).

Async iterables are first-class: `createMemo(async function* () { for await (const v of src) yield v; })` is the documented replacement for `from()`/`observable()` (`MIGRATION.md:904-935`). This is the natural bridge for an Effect `Stream`. Note the migration guide's own admission: "There's no drop-in replacement" for the *outbound* direction (`observable()`); you build an adapter over `createEffect`, and "This is a known gap … I expect this to move into @solid-primitives" (`MIGRATION.md:921-935`).

### State surface

| 1.x resource | 2.0 |
|---|---|
| `resource()` | `memo()` |
| `resource.loading` | `<Loading>` for initial readiness; `isPending(() => expr)` for in-flight *changes* |
| `resource.error` | `<Errored>` boundary, or the effect `error` option — **one path only**, no inline branching |
| `refetch()` | `refresh(target)` |
| `mutate()` | `createOptimistic` / `createOptimisticStore` + `action(...)` |

**The `isPending` trap** (`05-…:68-107`, `MIGRATION.md:330-333`): `isPending` is *not* `.loading`. It is true when a tracked **input changed** and the new answer hasn't landed, or when in-flight work declared it via `affects()`. A bare `refresh()` or a poll is **silent** — it re-asks the same question. To make a reload read as pending you must write `affects(user); refresh(user)`. Also: `isPending(fn)` **performs the read**, so its placement relative to `<Loading>` matters.

### ⚠️ Async dependency tracking is synchronous — the constraint I missed first time (C6)

From `https://v2.solidjs.com/concepts/async-reactivity`:

> "Dependency tracking is synchronous. An async computation registers reactive reads made before its first `await`. Reads made after an `await` do not create dependency edges…"
>
> "**Read every reactive input before the first async gap.**"

Behaviour on violation: **dev builds convert unresolved post-`await` reads into errors that reach `Errored`**; production builds "may leave them pending without retry capability".

This is a structural constraint on every async primitive solidifront builds:

```js
// ❌ storeDomain read after the await — no dependency edge, dev error
const product = createMemo(async () => {
  const client = await getClient();
  return fetchProduct(storeDomain(), handle());   // both reads are invisible
});

// ✅ hoist every reactive read into the synchronous prelude
const product = createMemo(() => {
  const domain = storeDomain();
  const h = handle();
  return (async () => fetchProduct(domain, h))();
});
```

For an Effect-based data layer this is the dominant design pressure — see D6b in §1. Blast radius not fully mapped (open question #13).

### Cancellation

**There is no framework-supplied cancellation channel.** No `AbortSignal` is handed to a compute function. I grepped `packages/solid-signals/src` for `AbortSignal`/`abort` — the only hits are internal mapArray abort-pass comments and one JSDoc example. The documented pattern is manual, from the effect apply phase (`references/solid/packages/solid-signals/src/signals.ts:468-476`):

```ts
createEffect(
  () => userId(),
  id => {
    const ctrl = new AbortController();
    fetch(`/users/${id}`, { signal: ctrl.signal });
    return () => ctrl.abort();     // cleanup before next run / disposal
  }
);
```

For async **iterables** the runtime does forward cancellation: "Forward async iterator cancellation through hydration and SSR wrappers so generators close when hydration adapters or SSR serializers stop consuming them" (`references/solid/.changeset/fix-async-iterator-cancellation-wrappers.md`). So an `AsyncIterable`-shaped source *does* get a close signal via generator return; a bare `Promise`-shaped source does not.

**The guard for late work is `isDisposed`** (`https://v2.solidjs.com/reference/solid-js/advanced/owner-introspection/is-disposed`):

```ts
function onSettleSafe(fn: () => void) {
  const owner = getOwner();
  queueMicrotask(() => {
    if (owner && isDisposed(owner)) return;
    runWithOwner(owner, fn);
  });
}
```

Its stated purpose is to "ignore late work after the owner's component or reactive scope has been removed". Between this, `bindToOwner` (§6), and `AsyncIterable`-shaped sources, a complete Effect `Scope`↔owner bridge is constructible — but every piece of it is solidifront's to build.

**Implication for an Effect-based library:** if you want fiber interruption on disposal, you must own the plumbing — either return the interrupt from an effect apply cleanup, register it with `onCleanup` on a captured owner (the `bindToOwner` shape in §6), or expose Effect programs as `AsyncIterable`s so generator close maps to interruption. Do not assume Solid will cancel your Promise.

### Mutations

`action(fn)` wraps generator/async-generator mutations with transition coordination: "Each invocation runs as a single transaction: every write between yields batches into one atomic update, and nothing commits until the action completes or the next `yield` resolves" (`references/solid/packages/solid-signals/README.md:115`). The canonical shape (`MIGRATION.md:365-379`) is optimistic write → `yield` server call → `refresh(source)`.

### SSR/hydration policy is per-primitive

Two option fields accepted anywhere computation options are (`05-…:155-188`):

- **`ssrSource`**: `"server"` (default — client seeds from the serialized server value and the compute does **not** re-run; no duplicate fetch on load), `"hybrid"` (seed then re-run), `"client"` (server never runs the compute; deferred to after hydration — and read outside a `<Loading>` boundary this is a **render error**).
- **`deferStream: true`** — hold the SSR shell flush until this primitive's first value resolves. Server-only.
- **`loadingValue` / `seedLoadingValue`** — declare a provisional first paint instead of suspending.
- **`transparent: true`** — integration tier; makes a node invisible to hydration id allocation.

---

## 9. Per-request state on the server — the storefront-context mechanism

This is the section that matters most for solidifront's current architecture. The design detail is in `references/solid/documentation/solid-2.0/12-ssr-http.md`; the user-facing contract is at `https://v2.solidjs.com/building-apps/middleware-and-api-routes`. The two agree throughout **[both]**.

### The shape

```ts
export interface RequestEventLocals { [key: string | number | symbol]: any }
export interface RequestEvent { request: Request; locals: RequestEventLocals }
export interface ResponseStub {
  status?: number; statusText?: string; headers: Headers;
  committed?: boolean;   // set by the integration once the head has been derived/sent
}
```
(`12-ssr-http.md:56-65`, `102-111`.)

- **`getRequestEvent()`** — from **`@solidjs/web`** (was `solid-js/web`). Reads the current event anywhere under a request scope; returns `undefined` outside one (`12-…:86`).
- **`provideRequestEvent(event, cb)`** — from **`@solidjs/web/storage`**. Establishes the scope, backed by an `AsyncLocalStorage` parked on `globalThis[RequestContext]` under a **registered symbol** so separately bundled copies of the runtime agree. It **throws on the client**. It lives on its own subpath specifically because it imports `node:async_hooks` (`references/solid/packages/solid-web/storage/src/index.ts:1-38`).
- **`createRequestEvent(request, init?)`** — builds the canonical stub-backed event; `init` spreads over the defaults so a framework can extend the shape (`12-…:245`).
- **`createSSRResponse(result, event, options?)`** and **`commitEventResponse(response, event?)`** — the two exits for the response-head lifecycle (`12-…:229-254`).
- **`composeMiddleware([...])`** — composes `(request, next) => Response` middleware **inside** the request scope (`12-…:256-276`).

### The full server handler shape

```tsx
import { renderToStream, createRequestEvent, createSSRResponse } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";

export function handleRequest(request: Request): Promise<Response> {
  const event = createRequestEvent(request);
  return provideRequestEvent(event, () =>
    createSSRResponse(renderToStream(() => <App />), event)
  );
}
```
(`12-…:233-243`.)

In start mode you never write this: "Each request is scoped with `provideRequestEvent`, so `getRequestEvent()` works during the render" and "Every dispatch runs under a stub-backed request event (`createRequestEvent` from `@solidjs/web`), and page responses go through the runtime's response-head lifecycle (`createSSRResponse`)" (npm:@solidjs/vite-plugin@3.0.0-next.28 `package/README.md` §`start`).

### Middleware — exactly the storefront-injection pattern, spelled out

The plugin README's own example is structurally identical to what solidifront does today:

```ts
// src/middleware.ts
import { getRequestEvent } from '@solidjs/web';

export default async function auth(request: Request, next) {
  getRequestEvent().locals.user = await userFromCookie(request);
  const response = await next();
  response.headers.set('server-timing', 'app');
  return response;
}
```
(npm:@solidjs/vite-plugin@3.0.0-next.28 `package/README.md` §`middleware`.)

The official contract (`https://v2.solidjs.com/building-apps/middleware-and-api-routes`) — note `next` returns `Promise<Response>` here, slightly tighter than the plugin README's union:

```ts
type Middleware = (
  request: Request,
  next: (request?: Request) => Promise<Response>
) => Response | Promise<Response>;
```

Load-bearing properties (`12-…:271-275`; `package/dist/types/src/ssr/index.d.ts` `StartOptions.middleware`; docs as above):

- The chain **fronts every request the plugin dispatches** — page SSR *and* the server-function endpoint *and* API routes, in dev, production, and `vite preview`. The endpoint shares the chain's event, "so `locals` decoration is visible to server functions too." The docs restate this: "The event provides the same `locals` object and response stub that server functions and page renders access."
- Middleware runs **in array order** before the handler and **unwinds in reverse order**.
- **Nothing reaches the wire until the outermost middleware returns**, so headers on the returned `Response` stay mutable through the whole unwind, streamed bodies included. Error middleware is a plain `try { return await next(); } catch { … }`.
- Pass a modified `Request` to `next(request)` to substitute it downstream; return a `Response` without calling `next()` to short-circuit. **"Do not call `next()` more than once from the same middleware invocation."**
- A non-page request (anything but an HTML-accepting GET) that no middleware handled falls back to Vite's own pipeline in dev.

**Authorization warning, stated twice in the docs** and worth propagating into solidifront's own docs: "Middleware can populate `event.locals`, but this alone does not authorize requests." Authorization must be re-checked inside every protected server function and API handler (`https://v2.solidjs.com/migration/from-solid-start`, `https://v2.solidjs.com/building-apps/sessions-and-auth`). A storefront-context middleware that attaches an authenticated customer token to `locals` is authentication, not authorization.

### Typing `locals`

Module-augment the interface exported from `@solidjs/web` (`12-…:67-84`):

```ts
declare module "@solidjs/web" {
  interface RequestEventLocals { user: User }
}
```

The RFC documents two TypeScript sharp edges worth encoding in solidifront's codegen: the augmenting file **must be a module** (a bare `.d.ts` needs `export {}`, or `declare module` becomes an ambient *declaration* that replaces the package's types wholesale), and a `foo.d.ts` sitting next to a `foo.ts` is treated as compiled output and silently dropped (`12-…:79-84`). solidifront currently writes `.solidifront/types/middleware.d.ts` and mutates the consumer's tsconfig (`.../solidifrontMiddlewareSetup.ts:111-199`) — the mechanism is fine, the augmentation *target* changes from `@solidjs/start/server` to `@solidjs/web`.

### Cookies

Core ships **only the codec** — `parseCookieHeader(header)` / `serializeCookie(name, value, opts)` over native `Headers`. Ambient `getCookie`/`setCookie`/`deleteCookie` helpers were designed, briefly added, and then **cut before release** on an explicit ruling: "cookies are not core API — core owns the exchange and the codec, nothing ambient" (`12-…:139-171`, `301`). Reads are a request-only view (an appended `Set-Cookie` does not read back). Writes are `Headers.append` on `event.response.headers`. Post-`committed` writes **throw in the dev build** and `console.error` + no-op in production. Multi-`Set-Cookie` is guaranteed to travel entry-by-entry via `getSetCookie()` + append everywhere core materializes a head.

Sessions are ruled app-layer, twice, and a fully built first-party session primitive was retired before shipping. The blessed recipe is `@remix-run/cookie` + the request event (`12-…:169-227`).

### Response head from the render tree

`httpStatus(code, text?)` and `httpHeader(name, value, { append? })` from `@solidjs/web`, called bare in component/reactive-scope bodies. They are **scope-tied declarations, not mutations**: each write is recorded in a per-header ledger, and disposing the scope removes only that scope's entry and replays the survivors in original write order (`references/solid/.changeset/web-http-declaration-ledger.md` — this replaced an earlier snapshot-restore model that silently dropped a survivor's `Set-Cookie`). Both are no-ops on the client and no-ops once the head is `committed`.

**`httpHeader` is a shell-time API.** Anything below a `<Loading>` boundary that resolves after the shell flush is past `committed` and its header declarations are contractual no-ops. If a header matters it belongs to the shell, or to a `deferStream`-held source (`12-…:133-135`).

Start's `<HttpStatusCode code={404} />` / `<HttpHeader />` components are gone; core ships functions only (`12-…:284`, 295).

### Server functions

`"use server"` moved out of the metaframework into `@solidjs/web/server-functions`, compiled by the plugin's `serverFunctions` option (`10-server-functions.md:15`, `references/solid/.changeset/add-server-functions-subpath.md`). Notes relevant to solidifront (which has five `"use server"` sites today):

- The runtime resolves per environment: browser gets the fetch transport, node/worker/deno gets registration + the in-process SSR callable + `handleServerFunctionRequest(request) => Response`.
- Event scoping **defaults to the same `AsyncLocalStorage`** that `provideRequestEvent` parks on the global, so middleware-set `locals` are visible inside server function bodies without extra wiring.
- **Arguments are plain JSON by default.** Dates, Maps, Sets, typed arrays, and cycles **throw with a directed message** unless you `enableRichArguments()` from `@solidjs/web/server-functions/rich-args` (~5 KB gz, opt-in at the module-graph level). *Results* always travel through the codec. (`10-…:45`, `references/solid/.changeset/rc-api-freeze-pass.md`.)
- **Thrown plain errors are sanitized in production by default** — the client gets a generic `Error("Internal Server Error")`. Opt out per-error with `markSafeError(error)`, or use `respond(error, { status })`. The dev/prod line keys on the **build variant** (the `development` export condition), not `NODE_ENV`. (`10-…:93-104`.)
- `wrapInvocation(run, context)` is the per-invocation seam for framework policy (auth guards, logging) and the **configured** hook also wraps direct SSR calls (`10-…:63`). This is a plausible home for an Effect runtime boundary.
- Validation is deliberately in **neither core nor the router** — "the body is the boundary", and the directive's dead-code elimination makes schemas server-only by construction (`10-…:202-208`).
- Response helpers `redirect` / `reload` / `respond` export from `@solidjs/web` core (both builds). `respond()` is the rename of the router's `json()`.

---

## 10. Router

`@solidjs/router@2.0.0-next.16` peer-depends on `solid-js ^2.0.0-rc.0` and `@solidjs/web ^2.0.0-rc.0` (npm:@solidjs/router@2.0.0-next.16 `package/package.json`). It is a **complete API rewrite**, not a port. From its README:

- **`createRouter({ routes, history?, preload?, base? })` is the only setup path.** The component-based `<Router><Route/></Router>` API is removed; routes are config objects. The instance *is* the provider component.
- **No `<A>` component** — plain `<a href>` with lowercase attributes (`replace`, `noscroll`, `state`), decorated with `aria-current` / `data-active` / `data-pending` by compiler-claimed anchors. `activeClass`/`inactiveClass` → CSS attribute selectors.
- **Typed `paths`** proxy inferred from the route tree; typed search params via Standard Schema.
- `<Navigate>`, `useCurrentMatches`, `<HashRouter>`, `<MemoryRouter>`, `<StaticRouter>` all removed or replaced by history adapters (`hashHistory()`, `memoryHistory(url)`).
- **`query()` stays** as the cached-read/invalidation primitive with `.key` / `.keyFor(x)`; `cache()` (the deprecated alias) is gone.
- **`createAsync` / `createAsyncStore` are gone** — read `query()` results with `createMemo` / `createProjection` / `createOptimistic*`.
- **`useSubmission` (singular) is gone**; `useSubmissions()` returns *settled* history, and in-flight/optimistic UI moves to Solid's optimistic primitives fed by `action(...).onSubmit(...)`.
- `redirect` / `reload` now import from `@solidjs/web`; `json(data, init)` → `respond(data, init)`.
- Server integration is `createFlightDataCollector(Router)` from `@solidjs/router/server`, installed via the plugin's `serverFunctions.configure` module — "This policy previously lived inside SolidStart; the router now owns it."

**Does it affect libraries?** Yes, structurally: a library can no longer assume a `<Router>` JSX tree, and anything that hooked `createAsync`/`useSubmission` needs a new shape. But the router is now genuinely optional for SSR — the request event, response head, middleware, and server functions all live in `@solidjs/web`.

Versioning is confusing and worth flagging: the published `2.0.0-next.16` README's migration section calls the target release **"1.0"** throughout, while `@solidjs/router@1.0.0` (published 2026-07-28) peer-depends on `solid-js ^1.8.6`. Treat the README's "1.0" as stale text for what is shipping as 2.x.

---

## 11. What is genuinely unstable right now

> **⚠️ Corrected from the first draft (C4).** I originally ranked start mode + server functions as the most unstable thing in the stack, on the strength of the plugin README's "(experimental)" labels. **The official docs contradict that**, and they are the newer, more authoritative source. I have downgraded the risk and reordered this list. If the earlier ranking was relayed to the maintainer, this supersedes it.
>
> `https://v2.solidjs.com/building-apps/server-functions` states plainly: "Server functions and start-mode serving are **part of the Solid 2.0 RC surface**. Lower-level handler hooks and codec extensions remain subject to change before stable release."
>
> So the experimental boundary runs *below* the feature, not around it: `"use server"`, the endpoint, `start: true`, middleware, and the generated entries are RC-grade. `configureServerFunctionsServer` hooks, `wrapInvocation`, `transformResult`, the codec, and `serverFunctions.components` are the churning parts. That is a very different risk profile — solidifront can build on start mode and middleware, and should avoid the handler hooks.

Ordered roughly by how badly it would hurt to depend on it.

1. **Server components — `serverFunctions: { components: true }` / `@solidjs/web/frames`.** Now the clear #1. Explicitly outside the 2.0 stability guarantee: "the subpath, its API, and the underlying wire format are NOT covered by 2.0's stability guarantees and may change between prereleases. Expect a separate stabilization announcement." Every `/frames` export carries `@experimental` JSDoc, and the docs reference confirms `components` is "experimental", default `false`. (`references/solid/.changeset/frames-server-components-experimental.md`; `references/solid/.changeset/rc-api-freeze-pass.md`; `https://v2.solidjs.com/reference/vite-plugin-solid/server-functions`) **solidifront should not touch this.**

2. **`filesystem-routing@0.2.1`** — new in this revision. A `0.2.x` package with only a `latest` dist-tag, carrying both page routing and API routing. Young, and solidifront's API-route surface would sit on it.

3. **`@solidjs/vite-plugin` version churn.** The feature set is RC-grade per the docs, but the *package* is `3.0.0-next.28`, a prerelease also tagged `latest`, and the `ssr: {...}` → `start: {...}` option move landed as recently as `3.0.0-next.23`. The risk here is **config-shape churn between prereleases**, not the feature being unfinished. Pin exactly.

4. **Client start mode specifically.** The plugin README still labels this "(experimental)" and the docs do not clearly re-grade it. SSR start mode is the well-trodden path.

5. **Server-function handler hooks and the codec** — the layer the docs explicitly exclude from RC: `configureServerFunctionsServer`, `wrapInvocation`, `transformResult`, `createEvent`, `handleNoJS`, `collectFlightData`, and the seroval codec configuration. Tempting as an Effect-runtime boundary (§9); don't build on it yet.

6. **`@solidjs/web/serialization`.** "marked integration-facing — exempt from the 2.0 stability guarantee, per-export." Only `createPlugin` / `OpaqueReference` are application-facing; the rest is plumbing you should leave alone (`references/solid/.changeset/rc-api-freeze-pass.md`; `10-…:45`).

7. **`@solidjs/router` 2.x** — `next.16`, README still self-describes as "1.0", data-layer semantics (submissions-as-history) changed inside the prerelease line.

8. **`@solidjs/meta` 2.x** — only `1.0.0-next.2` exists; I did not read it. Note the docs list head management in **two** places: `@solidjs/meta` (`Title`, `Meta`, `Link`, `Script`, `Style`, `Stylesheet`, `Base`, `Head`) *and* `@solidjs/web` (`useHead`, `HeadTag`). I did not establish which is canonical for 2.0 — see open questions.

9. **`@dom-expressions/compiler` native backend** — `0.50.0-next.42` on `next` while `latest` is `next.25`. The plugin README itself frames `compiler: 'babel'` as the bug-report escape hatch: "if the native output ever differs from what you expect, set `compiler: 'babel'` and file an issue — the behavioral diff between the two modes is the bug report."

10. **`start.setup` and `serverFunctions.configure`** — both are recent, narrowly-scoped seams with a single known consumer each (the router). Useful, but young.

11. **Integration-tier core exports** — `createResponseStub`, `getExpectedRedirectStatus`, `commitEventResponse`, `transparent: true`, `registerDevAssetResolver`. Documented, but explicitly "integrator tier" (`12-…:254`).

**What is comparatively safe to build against** (upgraded from the first draft):

- `@solidjs/signals` — RC, "API is frozen barring showstoppers".
- The core reactivity / store / control-flow surface in `solid-js`.
- The `@solidjs/web` HTTP exchange: `getRequestEvent`, `RequestEvent`/`RequestEventLocals`, `ResponseStub`, `provideRequestEvent`, `httpStatus`/`httpHeader`, `parseCookieHeader`/`serializeCookie`, `composeMiddleware`, `redirect`/`reload`/`respond`. RFC 12 says "Everything here is **shipped** in the 2.0 prerelease line", and it went through an explicit RC API-freeze pass.
- **`"use server"` and the `/_server` endpoint**, and **start-mode serving including `start.middleware`** — "part of the Solid 2.0 RC surface" per `https://v2.solidjs.com/building-apps/server-functions`. This is the C4 correction: these are the load-bearing pieces for solidifront and they are RC-grade.

---

## 12. Migration guide, codemod, breaking-change list

- **Migration guide:** `references/solid/documentation/solid-2.0/MIGRATION.md` (983 lines) — the canonical before/after guide, ending in a quick rename/removal map at `:937-983`.
- **One-page API reference:** `references/solid/packages/solid/CHEATSHEET.md` (665 lines). It **ships inside the `solid-js` npm package**, reachable as `node_modules/solid-js/CHEATSHEET.md`, and its last section is an explicit "AI footgun list" of 1.x→2.0 corrections (`references/solid/README.md:109-116`).
- **Design rationale:** twelve RFCs in `references/solid/documentation/solid-2.0/` (01 reactivity/batching/effects, 02 signals/derived/ownership, 03 control flow, 04 stores, 05 async data, 06 actions/optimistic, 07 DOM, 08 dev diagnostics, 09 TypeScript/JSX, 10 server functions, 11 server components, 12 SSR/HTTP).
- **Per-change record:** `references/solid/.changeset/` holds ~380 changeset files at this commit — the finest-grained changelog available.
- **Codemod: none exists.** Confirmed from both sides now — nothing in the README, MIGRATION.md, CHEATSHEET.md or changesets, and `https://v2.solidjs.com/migration/from-solid-1` states migration "requires manual refactoring following the prescribed order and verification steps" with no automated tool offered. **[both]**

### The official docs site (`https://v2.solidjs.com`) — the map

This is the source I missed on the first pass (C1). 141 pages; the structurally important ones for solidifront:

| Area | Pages |
|---|---|
| **Migration** | `/migration/from-solid-start`, `/migration/from-solid-1`, `/migration/from-solid-router`, `/migration/from-solid-meta`, `/migration/from-react` |
| **Building apps** | `/building-apps/` → `app-structure`, `middleware-and-api-routes`, `server-functions`, `sessions-and-auth`, `environment`, `deployment`, `head-and-metadata`, `styling-and-assets` |
| **Concepts** | `/concepts/` → `reactivity`, `async-reactivity`, `stores`, `boundaries`, `components-and-jsx`, `rendering-and-ssr` |
| **Plugin reference** | `/reference/vite-plugin-solid/` → `options`, `start`, `server-functions`, `modules` |
| **filesystem-routing** | `/reference/filesystem-routing/` → `vite`, `api`, `conventions`, `core`, `manifest`, `tree` |
| **Router** | `/routing/solid-router/*` and `/reference/solid-router/*`; `/routing/tanstack` for the TanStack alternative |
| **Guides** | `/guides/avoid-unnecessary-effects`, `/guides/testing` |

Also: `https://github.com/solidjs/solid-start/discussions/2281` (SolidStart v2 stable announcement — confirms it targets Solid v1, and says only that the team will "carry this foundation forward as we move towards Solid v2 in future releases").

---

## 13. SolidStart → Solid 2.0 migration, mapped to `packages/start`

The governing constraint first, because it changes the shape of the work (C2):

> "This is **not a SolidStart upgrade**… **Do not install Solid 2 into an existing SolidStart application.**"
> — `https://v2.solidjs.com/migration/from-solid-start`

The official sequence is: record baseline behaviour → scaffold a separate Solid 2 target from a template → migrate platform dependencies first → move features incrementally, one route group or server feature at a time → test each slice (direct SSR, client nav, refresh, build, preview) → deploy to a real host. **Keep the old application runnable throughout.**

Templates (`https://v2.solidjs.com/getting-started/project-shapes`, `/migration/from-solid-start`), each a superset of the last: `bare` (Solid only, static), `basic` (+ router, FS routes, per-page titles, testing; still static), `fullstack` (+ streaming SSR, server functions, sessions, API routes), `fullstack-tanstack` (TanStack Router + TanStack Query). For solidifront, `fullstack` is the reference shape.

### Dependency-by-dependency map

| `packages/start` depends on today | Solid 2.0 replacement | Confidence |
|---|---|---|
| `@solidjs/start ^1.2.0` | **None — package does not exist for Solid 2.** Its serving role is `@solidjs/vite-plugin` `start` mode; its API surface is redistributed to `@solidjs/web` (request event, HTTP, server functions), `@solidjs/router` 2 (data/actions), and `filesystem-routing` (FS + API routes). | Verified |
| `vinxi ^0.5.8` | **None.** No Vinxi, no Nitro, no H3 in the Solid 2 stack. | Verified |
| `@solidjs/router ^0.15.3` | `@solidjs/router@2.0.0-next.16` — full API rewrite (§10). | Verified |
| `solid-js ^1.9.9` | `solid-js@2.0.0-rc.0` + **new peer** `@solidjs/web@2.0.0-rc.0`. | Verified |
| `vite` (via Start) | `vite ^6 \|\| ^7 \|\| ^8`; examples use `^8`. `buildApp` ordering needs 7.1+. | Verified |
| `esbuild-plugin-solid` | **No 2.0 successor found.** Not referenced anywhere in the submodule, the plugin tarball, or the docs site. The JSX path is `@dom-expressions/compiler` (native) or `babel-preset-solid@2.0.0-rc.0`. | Not found — see open questions |
| `tsup-preset-solid` | **No 2.0 successor found.** Same reasoning; it also encodes the 1.x `solid` export condition + `solid-js/web` layout, both of which changed. | Not found — see open questions |
| `@graphql-codegen/*`, `@shopify/*` | Unaffected by Solid 2. | — |

### API-by-API map

| `packages/start` uses | Solid 2.0 replacement |
|---|---|
| `defineConfig` wrapping `@solidjs/start/config` | Plain `vite.config.ts`: `solid({ start: {...}, ssr: true, serverFunctions: true })`. No framework config object. |
| `createMiddleware` (h3-shaped) from `@solidjs/start/middleware` | `start: { middleware: "./src/middleware.ts" }`; default-export a `(request, next) => Response \| Promise<Response>` or an array of them. |
| `getCookie` / `setCookie` / `getHeader` from `vinxi/http` | `parseCookieHeader(event.request.headers.get("cookie"))` and `event.response.headers.append("set-cookie", serializeCookie(...))`, both from `@solidjs/web`. No ambient helpers — cut deliberately. |
| `getRequestEvent` from `solid-js/web` | `getRequestEvent` from `@solidjs/web`. |
| `event.locals` | Unchanged in spirit; same object, now reachable from middleware, page render, server functions and API routes alike. |
| ts-morph codegen writing `declare module "@solidjs/start/server" { interface RequestEventLocals … }` | Same technique, retarget to `declare module "@solidjs/web"`. Honour the two documented sharp edges (§9): the augmenting file must be a module, and must not share a basename with a sibling `.ts`. |
| `App.RequestEventLocals` ambient namespace / `@solidjs/start/env` type reference | Retired. The docs say explicitly: "**Never** copy SolidStart's `@solidjs/start/env` type reference." |
| `"use server"` (5 sites) | Same directive; runtime is now `@solidjs/web/server-functions`, enabled by `serverFunctions: true`. Endpoint still `/_server`. |
| `createAsync`, `createAsyncStore` | `createMemo`, `createProjection`. |
| `cache()` | Renamed `query()`. |
| `json()` | `respond()` from `@solidjs/web`. |
| `redirect` / `reload` from `@solidjs/router` | Same names, from `@solidjs/web`. |
| `FileRoutes` component | `fileRoutes(pageRoutes)` from `@solidjs/router/fs` + `filesystem-routing`. Do not port the component. |
| Env validation + `src/global.d.ts` rewrite | Likely subsumed by `start.env` + `virtual:env/server` + generated `solid-env.d.ts` (D7). |
| `entry-server.tsx` / `entry-client.tsx` | **Delete before the first build.** The plugin generates both. "Old SolidStart entries cannot serve as start-mode entries due to incompatible imports and exports." Replace with `src/App.tsx` (no `<html>`/`<head>`/`<body>`) and `src/Document.tsx` (full document + `<HydrationScript />`). Never carry over `props.assets`, `props.scripts`, or the `#app` mount wrapper. |
| Locale/storefront virtual modules (`resolveId`/`load`) | Mechanism unchanged — ordinary Vite plugin hooks compose fine alongside `solid()`'s `Plugin[]`. |

### What solidifront loses with no replacement

From the migration guide's "Removed features" list: Nitro tasks and storage, framework route prerendering, islands and SolidStart rendering modes, Nitro WebSocket support, and the SolidStart dev toolbar. "Resolve these with host-specific integrations or alternate libraries." **Route prerendering is the one to check** — if any solidifront consumer prerenders storefront pages at build time, that capability has to be rebuilt or sourced from the host.

---

---

## 14. Open questions / could not verify

Re-checked against the docs site. Three of the original nine are now closed, two partly closed, and four new ones opened.

### Closed by this revision

- ~~**#3 — is the `@solidjs/vite-plugin` tarball trustworthy given the stale GitHub README?**~~ **Closed.** `https://v2.solidjs.com/reference/vite-plugin-solid/{options,start,server-functions,modules}` independently confirms the tarball's `.d.ts` and README on every option, default, virtual module and marker module I checked. The GitHub default branch is stale; the **docs site and the tarball agree and are the source of truth**.
- ~~**#5 — `onCleanup` ordering within one owner.**~~ **Closed as far as it can be:** FIFO/registration order in the source (`owner.ts:137-141`), and the docs page confirms it is *not* a stated guarantee — `https://v2.solidjs.com/reference/solid-js/advanced/specialized-reactivity/on-cleanup` documents timing and forbidden scopes but says nothing about ordering. **Treat FIFO as an implementation detail; don't rely on it.**
- ~~**#2 — does Effect Schema satisfy `start.env`?**~~ **Mostly closed.** The docs state the plugin "reads the shared Standard Schema interface" and validators "may come from different Standard Schema libraries", with no privileged list. Effect Schema implements Standard Schema, so this should work. Still unproven empirically — a spike, not a research question.

### Partly closed

- **#4 — in-flight Promise vs. owner disposal.** The *practical* half is answered: `isDisposed(node: Owner): boolean` exists precisely to "ignore late work after the owner's component or reactive scope has been removed", and the documented pattern captures the owner, guards with `isDisposed`, then `runWithOwner`s back in. **The framework does not cancel for you.** What remains unanswered: whether the runtime *itself* discards a disposed node's pending resolution, or whether a late resolve can still write into the graph. `https://v2.solidjs.com/concepts/async-reactivity` covers reactivity patterns and explicitly does not cover "lifecycle cleanup mechanics for async operations". The internal notes (`packages/solid-signals/INTERNALS-ASYNC-STATE.md`, `SPEC-ASYNC-SEMANTICS.md`) are still the place to look; I read only their headings.
- **#1 — is a SolidStart-on-Solid-2 planned?** The docs now make the *present* answer unambiguous (start mode replaces it; the migration guide is titled "From SolidStart" and treats it as a prior framework). The *future* intent remains ambiguous — the Start v2 announcement still says the team will "carry this foundation forward as we move towards Solid v2 in future releases", and no `next` dist-tag exists on `@solidjs/start`. For solidifront's purposes this no longer blocks a decision.

### Still open

- **#6 — head management has two candidate homes and I did not resolve which is canonical.** The docs ship both `@solidjs/meta` (`Title`/`Meta`/`Link`/`Script`/`Style`/`Stylesheet`/`Base`/`Head`, at `1.0.0-next.2` on npm) **and** `@solidjs/web` head APIs (`useHead`, `HeadTag`). There is also a `/migration/from-solid-meta` page I did not read. If solidifront touches head tags, resolve this first.
- **#7 — where a typed Effect runtime handle should live on the request event** (`locals` vs. extending the event via `createRequestEvent(request, init)`). Both remain documented as possible; still no guidance aimed at libraries rather than frameworks.
- **#8 — Vite version floor.** Plugin says 6/7/8; examples use 8; `buildApp` ordering is gated at 7.1+. Unresolved whether start mode needs 8 in practice.
- **#9 — test story for a library.** `https://v2.solidjs.com/guides/testing` exists and I did not read it. The plugin auto-injects vitest config, defaults to client posture, and server-posture tests opt in via `test.environment: 'node'`.

### New, opened by this revision

- **#10 — `esbuild-plugin-solid` and `tsup-preset-solid` have no identified 2.0 successors.** Neither appears in the submodule, the plugin tarball, or anywhere on the docs site. solidifront uses both to build its published packages. Checked npm during this revision: `tsup-preset-solid` → `latest: 2.2.0`, **no `next` tag**; `esbuild-plugin-solid` → `latest: 0.6.0`, **no `next` tag**, peer `solid-js >= 1.0` (nominally permits 2.0, but it was authored against 1.x's `solid-js/web` module name, which the JSX transform no longer targets). By contrast `solid-refresh` *does* have `next: 0.8.0-next.7` — and the plugin no longer uses it at all (§4.2). **The Solid 2 library-authoring build story is genuinely unestablished from what I read.** Next step: look at how `@solidjs/router` and `@solidjs/meta` build their own 2.0 prereleases — they are the closest analogues to solidifront's position as a Solid-2 library publishing JSX.
- **#11 — how `filesystem-routing` and `@solidjs/vite-plugin` order against each other.** The docs show them side by side in the `plugins` array but "don't explicitly detail direct composition". solidifront would be inserting a third plugin set into that array; ordering constraints are unknown.
- **#12 — does `useAction` survive in Router 2?** The published `@solidjs/router@2.0.0-next.16` README documents a `useAction` section; the docs migration table does not mention it. Minor, but solidifront should check before relying on it.
- **#13 — the async dependency-tracking rule's exact blast radius (C6).** I have the rule and the dev/prod behaviour, but not: whether `untrack`ed post-`await` reads are exempt, whether store property reads behave the same as signal reads, and precisely what "may leave them pending without retry capability" means in production. **This is the highest-value unknown for the Effect integration** — it should be settled experimentally before any API is designed.
