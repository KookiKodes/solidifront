# Solidifront — current state audit

**Date of audit:** 2026-08-14
**Branch:** `next` (HEAD `73a3b35`, "Updated effect version", 2025-12-18)
**Scope:** every workspace package in `pnpm-workspace.yaml`. `references/` (git submodules of solid, effect, hydrogen, alchemy) is explicitly **excluded** — it is vendored upstream source, not this repo's code.

All npm metadata below was obtained by running `npm view <pkg> version deprecated time.modified dist-tags` on 2026-08-14. All file references are real paths in this repo. Claims I could not verify are labelled `[UNVERIFIED]`.

---

## What should not survive the restructure

Blunt version first. The reasoning and evidence for each line is in the sections below.

### 1. `vinxi` — and therefore the entire `@solidifront/start` runtime layer

`@solidjs/start` shipped **2.0.0 on 2026-08-04** (`npm view @solidjs/start version` → `2.0.0`). Its dependency tree no longer contains vinxi in any form:

```
$ npm view @solidjs/start@1.2.0 dependencies    # what solidifront targets
  '@vinxi/plugin-directives': '^0.5.0',
  '@vinxi/server-components': '^0.5.0',
  '@tanstack/server-functions-plugin': '1.121.21',
  ...

$ npm view @solidjs/start@2.0.0 dependencies    # current
  h3: '^2.0.1-rc.26',
  srvx: '^0.12.4',
  'oxc-parser': '^0.141.0',
  'vite-plugin-solid': '^2.11.13',
  ...
$ npm view @solidjs/start@2.0.0 peerDependencies
  { '@solidjs/router': '>=0.16.0 <2.0.0-0', vite: '^8 || ^9' }
```

`@solidifront/start` imports `getCookie` / `getHeader` / `setCookie` from `vinxi/http` in three files — `packages/start/src/middleware/createLocaleMiddleware.ts:8`, `packages/start/src/middleware/createStorefrontMiddleware.ts:14`, `packages/start/src/localization/hooks/createCountrySelector.tsx:11`. Those imports resolve to nothing under SolidStart 2. The locale middleware, the storefront middleware, and the country selector are all built on an API that the target framework has deleted.

vinxi itself is **not** npm-deprecated (`npm view vinxi deprecated` → empty) and its GitHub repo is **not archived** (`gh api repos/nksaraf/vinxi` → `"archived": false`), but its last publish is `0.5.11` on **2026-01-19** and its last repo push was **2026-03-21** with 123 open issues. It is a dead-end regardless of its formal status: the one framework that consumed it has moved off it.

**Corollary version incompatibilities in the same package.json (`packages/start/package.json`):**

| Declared | Reality |
|---|---|
| `@solidjs/start: ^1.2.0` | latest `2.0.0` |
| `@solidjs/router: ^0.15.3` | latest `1.0.0`; SolidStart 2 peer floor is `>=0.16.0` — solidifront is **below the floor** |
| `vinxi: ^0.5.8` (hard dep + peer dep) | removed from SolidStart 2 |
| `vite: ^7.1.10` (devDep) | SolidStart 2 peers `^8 \|\| ^9` |
| `solid-js: ^1.9.9` | latest `1.9.14`, `next: 2.0.0-rc.0` — and the whole point of the restructure is Solid 2 |

**Important correction to the obvious remedy: "upgrade to `@solidjs/start@2.0.0`" is not the Solid 2 path.** That release depends on `solid-js: ^1.9.14` — it is a **Solid 1.9** framework. Per the sibling research in `docs/research/solid-2.md`, there is no SolidStart for Solid 2.0 at all; start mode moved into `@solidjs/vite-plugin`. So `@solidjs/start@2.0.0` is a lateral move that fixes the vinxi problem but does not get you to Solid 2, and the eventual target is a different package entirely. Everything above about vinxi being dead still holds — it is the *destination* that changes.

There are **three incompatible Vite majors** inside one workspace: `packages/storefront-client` devDeps `vite: ^6.4.0`, `packages/start` and the locales plugin want `vite: ^7.1.10`, SolidStart 2 wants `^8 || ^9`.

### 2. `@solidifront/codegen` — already dead, still load-bearing

It is **already npm-deprecated**, by its own author:

```
$ npm view @solidifront/codegen version dist-tags time.modified deprecated
version = '2.0.0'
dist-tags = { latest: '2.0.0' }
time.modified = '2025-10-20T02:26:11.900Z'
deprecated = 'Deprecated in favor of Shopify related codegen packages'
```

`packages/codegen/package.json:11` also carries a (non-standard, inert) `"deprecated": true` field. The last commit touching it is `1f3f4d5` "Deprecated" (2025-10-19).

Except it is not actually removed. Two things still depend on it:

- **`packages/start/scripts/afterBuild.ts`** — run as part of `@solidifront/start`'s `build` script — reaches sideways into the filesystem at `path.resolve("..", "codegen")` (line 6) and copies four vendored files out of it (`storefront.schema.json`, `customer-account.schema.json`, `types/storefront-api-types.d.ts`, `types/customer-account-api-types.d.ts`). This coupling is **not declared as a workspace dependency**, so `turbo`'s `build: { dependsOn: ["^build"] }` does not order it. Building `@solidifront/start` on a clean checkout works only by luck of directory layout.
- **`packages/plugins/vite-plugin-generate-shopify-locales/src/locales/index.d.ts:5`** — the *shipped, published* type declaration for the plugin's `/locales` subpath export — does `import type { CountryCode, CurrencyCode, LanguageCode } from "@solidifront/codegen/storefront-api-types"`. `@solidifront/codegen` is **not** a dependency of that package (`packages/plugins/vite-plugin-generate-shopify-locales/package.json` deps are `@solidifront/storefront-client` and `vite`). Anyone installing `@solidifront/vite-plugin-generate-shopify-locales@1.2.8` from npm gets a `.d.ts` with an unresolvable import. That breaks `@solidifront/start`'s locale middleware types too, since `packages/start/src/middleware/createLocaleMiddleware.ts:1-5` imports `IsoCode`/`Locale`/`Localizations` from that same subpath.

The vendored schemas are also stale by construction. `packages/codegen/copy-files.json` fetches them from `https://raw.githubusercontent.com/Shopify/hydrogen/main/packages/hydrogen-react/storefront.schema.json` — a manual `copy-files-from-to` pull with no automation. On-disk mtime and last commit for `storefront.schema.json`, `customer-account.schema.json`, `types/*.d.ts` is all **2025-10-04**. Ten months stale, three Shopify API versions behind.

### 3. The hard-coded Shopify API version list — this is actively breaking the library right now

`packages/storefront-client/src/schemas.ts:45-78`:

```ts
export const ValidVersion = S.Literal(
  "2024-01","2024-04","2024-07","2024-10",
  "2025-01","2025-04","2025-07","2025-10","unstable",
);
export const LatestVersion = ValidVersion.pipe(S.pickLiteral("2025-04"));
```

Per Shopify's own versioning page (https://shopify.dev/docs/api/usage/versioning), a new version ships every quarter and each gets a minimum of 12 months. The release table lists supported versions **2025-07 through 2027-01**, with:

- `2025-07` — accessible until **2026-07-16 15:00 UTC** → **already expired** as of this audit
- `2025-10` — accessible until **2026-10-16 15:00 UTC** → **expires in ~2 months**
- `2026-01`, `2026-04`, `2026-07`, `2026-10`, `2027-01` — supported, and **none of them are in `ValidVersion`**

So: the library's *default* API version (`2025-04`) is past end-of-support. The only named version in the closed literal union that Shopify still serves is `2025-10`, and that dies in October. Because `ValidVersion` is a closed `S.Literal` union and `ClientOptions` is annotated `parseOptions: { onExcessProperty: "error" }`, a consumer **cannot** pass `2026-07` — the schema decode rejects it. The library actively prevents you from using a supported Shopify API version.

This is not a one-file problem. `packages/start/src/config/plugins/solidifrontEnvSetup.ts:15,23-28` imports `validVersions` from the client and uses it to validate the consumer's `SHOPIFY_PUBLIC_STOREFRONT_VERSION` env var, so the staleness propagates into app config validation.

**Resolved definitively** by a credential-free `publicApiVersions` query against `mock.shop` on 2026-08-14:

```json
[{"handle":"2025-10","supported":true},
 {"handle":"2026-01","supported":true},
 {"handle":"2026-04","supported":true},
 {"handle":"2026-07","supported":true,"displayName":"2026-07 (Latest)"},
 {"handle":"2026-10","supported":false,"displayName":"2026-10 (Release candidate)"},
 {"handle":"unstable","supported":false}]
```

**Four supported versions; latest is `2026-07`. `ValidVersion` can express exactly one of them — `2025-10` — and that one expires 2026-10-16.** The default, `2025-04`, is served only by Shopify's fall-forward behaviour ("When a version is retired, Shopify falls forward and responds using the oldest accessible stable version" — https://shopify.dev/docs/api/usage/versioning), which means solidifront users are getting a different API version than they asked for. *(Corrected 2026-08-16: not silently — `x-shopify-api-version` echoes the version actually served, so this is detectable on every response and is now checked at runtime. See `otel-and-testing.md` §8.4.1, [#12](https://github.com/KookiKodes/solidifront/issues/12), ADR-0005.)*

That same query is free, needs no credentials, and should become a nightly canary. See `docs/research/otel-and-testing.md` §8.4.

**Do not reintroduce a hand-maintained version enum.** Whatever replaces this needs the version to be an opaque string validated against a fetched/generated source, or simply a template-typed `` `${number}-${number}` | "unstable" ``.

### 3b. The build-vs-buy question nobody has asked

Shopify ships an official, actively maintained, **dependency-free** Storefront client:

```
$ npm view @shopify/storefront-api-client version time.modified dependencies
version = '2.0.0'
time.modified = '2026-08-10T21:28:28.765Z'
dependencies = { '@shopify/graphql-client': '^2.0.0' }

$ npm view @shopify/graphql-client version dependencies
version = '2.0.0'
dependencies = {}
```

Two packages, zero transitive dependencies, published four days before this audit. Against that, `@solidifront/storefront-client` ships `effect` + `@effect/platform` + `graphql` + `typescript` to do the same HTTP POST.

This does **not** mean delete it. Solidifront's genuine value-add is the Effect service surface, the tagged status errors, schema-validated options, and `@inContext` auto-injection — none of which the official client has. But the restructure should decide explicitly whether the rewritten client **wraps** `@shopify/storefront-api-client` or keeps re-implementing retry, header assembly and status mapping. Bugs #1, #3 and #15 in the table below are all in code that the official client already handles.

### 4. The build-time codegen plugins in `@solidifront/start/config`

`packages/start/src/config/plugins/` contains three Vite plugins that, at Vite `config()`/`buildStart()` time, **write into the consumer's source tree**:

- `solidifrontEnvSetup.ts:87-164` rewrites `./src/global.d.ts` via ts-morph and `project.saveSync()`
- `solidifrontCodegenSetup.ts:196-240` rewrites the consumer's `./.graphqlrc.ts`, including AST-surgery that relocates top-level config members into a `projects` block
- `solidifrontMiddlewareSetup.ts:172-199` **parses and rewrites the consumer's `tsconfig.json`** with `JSON.parse` → `JSON.stringify`, destroying comments and formatting
- `packages/start/src/config/utils.ts:5-43` generates `./src/middleware.ts` if absent

Two of these three plugins register **the same Vite plugin name**: `solidifrontCodegenSetup.ts:248` and `solidifrontEnvSetup.ts:76` both return `name: "vite-plugin-solidifront-codegen-setup"`. That is a copy-paste bug; duplicate plugin names break Vite's plugin diagnostics and any name-based ordering.

And the worst of it — `solidifrontMiddlewareSetup.ts:82-85` interpolates the **private Shopify Storefront access token** into a generated source file as a string literal:

```ts
.conditionalWriteLine(
  middlewares.storefront,
  `createStorefrontMiddleware({ storeName: "${env.SHOPIFY_PUBLIC_STORE_NAME}", apiVersion: "${env.SHOPIFY_PUBLIC_STOREFRONT_VERSION}", privateAccessToken: "${env.SHOPIFY_PRIVATE_STOREFRONT_TOKEN}" }),`,
)
```

The result is written to `.solidifront/middleware/virtual.ts` and also served by the plugin's `load()` hook for the virtual module `@solidifront/start/middleware:internal`. In this working tree that file currently contains a real-format token:

```
examples/basic/.solidifront/middleware/virtual.ts:8
  createStorefrontMiddleware({ storeName: "awesome-bryt-development", apiVersion: "unstable", privateAccessToken: "shpat_903785…" }),
```

The file is gitignored (`examples/basic/.gitignore` lists `.solidifront`) and `git ls-files examples/basic/.solidifront/` returns nothing, and `git log -S "shpat_903785…"` finds no commit — **the token was never committed**. But it is sitting in plaintext in a generated source file that Vite's module graph can reach. **Rotate that token anyway**, and do not carry this design forward: a server-only secret must never become a string literal in a module.

### 5. `@solidifront/storefront-client`'s dependency list

`packages/storefront-client/package.json`:

```json
"dependencies": {
  "@effect/platform": "^0.93.8",
  "effect": "^3.19.12",
  "graphql": "^16.12.0",
  "typescript": "^5.9.3"
}
```

- **`typescript` is a runtime `dependency`.** The whole TypeScript compiler, as a production dependency of a package that is meant to run in a browser. Nothing in `src/` imports it.
- **`graphql` is a runtime dependency** for exactly one reason: `src/services/InContext.ts:4` uses `parse`/`print` from graphql-js to AST-rewrite operations at request time. graphql-js is a large parser to ship to a browser to do a string transform that codegen could do at build time.
- Effect is pinned to `^3.19.12` / `@effect/platform ^0.93.8`. Current: `effect` latest `3.22.1` (modified 2026-08-14), `@effect/platform` latest `0.97.1`. Meanwhile `.gitmodules` pins the `references/effect` submodule to branch **`main`**, checked out at `4.0.0-rc.109`, and `npm view effect dist-tags` shows `rc: '4.0.0-rc.109'`, `beta: '4.0.0-beta.107'`. The repo's stated direction is Effect 4; the code is Effect 3.

  Note for the migration: **`@effect/platform` has no 4.x line.** `npm view @effect/platform dist-tags` → `{ latest: '0.97.1', snapshot: … }` only — no `beta`/`rc`, unlike `effect` and `@effect/opentelemetry`. In v4 the HTTP stack moved into core at `effect/unstable/http/*` (and OTLP into `effect/unstable/observability/*`). So `packages/storefront-client`'s `@effect/platform` dependency does not get a version bump on the Effect 4 migration — it gets **deleted**, and every `@effect/platform/Http*` import is rewritten to `effect/unstable/http/*`. See `docs/research/effect-4.md`.

### 6. Dead weight that should just be deleted

- **`packages/utils/`** — an empty directory. No `package.json`, no files, mtime 2024-11-10. It is matched by the `packages/*` workspace glob. Commit `9bb3d61` (2025-10-19) says "Brought back utils due to it's need within @solidifront/start" — whatever was brought back is not there.
- **`apps/`** — an empty directory matched by the `apps/*` workspace glob. Last touched 2024-08-11.
- **`packages/start/src/index.tsx`** — **0 bytes**. It is the file the root `tsconfig.json` explicitly names in `include`, and `packages/start/package.json` points `main`/`module` at `./dist/server.js` and `types` at `./dist/index.d.ts` — but the `exports` map has **no `"."` entry**, so the root specifier `@solidifront/start` resolves to nothing under Node's exports resolution.
- **`packages/storefront-client/src/services/index.ts`** — 0 bytes.
- **`packages/storefront-client/src/data/FetchBodyResponse.ts:8-11`** — the `FetchBodyResponse` class is exported and never used; only the `IFetchBodyResponse` interface is consumed (by `ClientResponse.ts:2`).
- **`packages/storefront-client`'s `latestVersion` export** (`src/index.ts:45`) — nothing in the workspace imports it.
- **`packages/start/src/localization/utils/fetchLocale.ts`** — a verbatim duplicate of `src/localization/utils/server.ts`'s `getLocale`, except it calls `cache()` from `@solidjs/router` (the pre-0.15 name for `query()`, which `server.ts` correctly uses). Its only importer is `createCountrySelector.tsx`, which is itself dead.
- **`packages/start/src/localization/hooks/createCountrySelector.tsx`** — 44 lines. The exported hook body is:
  ```ts
  export const createCountrySelector = () => {
    const locale = useLocale();
  };
  ```
  It returns nothing and uses nothing. The `updateLocale` action above it is never exported or referenced. The file is not re-exported from any entry point.
- **`packages/start/src/storefront/hooks.ts:29-103`** — 71 of the file's 103 lines are commented-out code (`createMutationAction`, `createCombinedOperations`).
- **Unused runtime dependencies of `@solidifront/start`**: `esbuild-plugin-solid` and `isomorphic-fetch` are declared in `dependencies` and imported by **zero** files in `src/` or `scripts/`. `isomorphic-fetch` is a `fetch` polyfill (last published **2023-10-23**) for a runtime where `fetch` has been global since Node 18 — which is this package's own `engines.node: ">=18"`.

### 7. `examples/basic` does not build

`examples/basic/src/graphql/storefront/mutations.ts:1` imports `createMutationAction` from `@solidifront/start/storefront`. That export does not exist — the only occurrences of the identifier in the entire workspace are inside the commented-out block at `packages/start/src/storefront/hooks.ts:29-96`. The example is a compile error against the current library.

### 8. No CI, and the test suite cannot run in CI even if there were

- There is **no `.github/` directory**. No workflows, no CI, no release automation beyond `changeset publish` run by hand.
- `turbo.json` defines exactly three tasks: `build`, `lint`, `dev`. There is **no `test` task and no `typecheck` task**, so the `typecheck` scripts in all four packages and the single `test` script are never run by any pipeline.
- **No package defines a `lint` script**, so `turbo lint` (and the root `pnpm lint`) is a no-op.
- The one test suite, `packages/storefront-client/tests/`, hits a **live Shopify store**. `tests/queries.test.ts:14-22` constructs a real client from `process.env.SHOPIFY_PUBLIC_STORE_NAME` / `SHOPIFY_PRIVATE_STOREFRONT_TOKEN` and asserts on real API responses. Those come from `packages/storefront-client/.env`, which is gitignored. There are no mocks, no fixtures, no MSW. The tests are unrunnable by anyone but the author, and they consume Storefront API rate limit on every run.
- Formatting is configured **twice and contradictorily**: root `package.json` has `prettier ^3.3.3` + a `format` script, and `biome.json` has `formatter.enabled: true` with `indentStyle: "tab"`. Both are active. There is a `.prettierignore` and a Biome `files.includes`.
- **Nothing validates the published artifacts**, and it shows: two of the three published packages ship `exports` maps whose targets do not exist in the tarball (details in "What is actually on npm right now", below). `@solidifront/start@0.5.5` has no working `"."` entry, no resolvable `types`, and 2.4 MB of unreachable vendored schema. `@solidifront/vite-plugin-generate-shopify-locales@1.2.8` has no types at its main entry at all. A single `publint`/`arethetypeswrong` step in CI would have caught every one of these.
- The root **`README.md` is the unmodified `create-turbo` starter README**. It documents "a Next.js app called `docs`", "another Next.js app called `web`", `@repo/ui`, `@repo/eslint-config` — none of which exist. There is no project-level documentation of what solidifront is.

---

## Package-by-package

### Inventory

| Package | Version | Published | Source LOC (ts/tsx, excl. `.d.ts`) | Files | Commits (all time) | Last commit |
|---|---|---|---|---|---|---|
| `@solidifront/storefront-client` | 0.5.5 | yes, 2025-12-18 | 2,135 | 24 src + 5 test | 53 | 2025-12-18 |
| `@solidifront/start` | 0.5.5 | yes, 2025-12-18 | 1,710 | 27 | 99 | 2025-12-18 |
| `@solidifront/vite-plugin-generate-shopify-locales` | 1.2.8 | yes, 2025-12-18 | 291 | 6 src (+ 9.6k-line vendored `.d.ts`) | 44 | 2025-12-18 |
| `@solidifront/codegen` | 2.0.0 | yes, **npm-deprecated** 2025-10-20 | 285 | 5 | 18 | 2025-10-19 |
| `example-basic` | private | n/a | 231 | 13 | 49 | 2025-10-26 |
| `packages/utils` | — | — | 0 | **0** | 0 | never (dir mtime 2024-11-10) |
| `apps/` | — | — | 0 | **0** | 0 | 2024-08-11 |

Total first-party source is roughly **4,650 lines**. This is a small codebase with a very large dependency and config surface around it.

### Activity, last 12 months

`git log --since="1 year ago" --name-only`, file-touch counts by package:

```
82  packages/storefront-client
63  packages/start
37  packages/plugins/vite-plugin-generate-shopify-locales
24  examples/basic
14  packages/codegen
```

That looks healthier than it is. The top of the list by individual file is entirely metadata:

```
11  packages/storefront-client/package.json
 9  packages/start/package.json
 9  packages/plugins/.../package.json
 8  packages/storefront-client/CHANGELOG.md
 8  packages/start/CHANGELOG.md
 8  packages/plugins/.../CHANGELOG.md
 4  packages/storefront-client/src/utils.ts
 4  packages/storefront-client/src/services/StorefrontClient.ts
```

Four of the last five commits on `next` are literally titled "Updated effect version(s)" (`73a3b35`, `ae7ae5d`, `256ba13`, `7400fcd`, spanning 2025-11-18 → 2025-12-18). The last commit that changed behaviour is `3432ef4` "Minor bug fix with incontext operation injection" on **2025-10-28**. There has been no feature work in ~10 months; the repo has been in dependency-bump maintenance since late October 2025.

Also visible in the last-year log: `packages/storefront-client/src/archived_services/` (7 files — `TypedStorefrontClient.ts`, `StorefrontOperation.ts`, `StorefrontClient.ts`, `PublicHeaders.ts`, `PrivateHeaders.ts`, `LoggerUtils.ts`, `DefaultHeaders.ts`). That directory has since been deleted from the working tree, which is the right call; noting it because the "rewrite in place, keep the old one around" pattern is what produced the current duplication (`fetchLocale.ts` vs `server.ts`).

### Internal dependency graph

Declared `workspace:*` edges:

```
@solidifront/start
  ├── @solidifront/storefront-client          (workspace:*)
  └── @solidifront/vite-plugin-generate-shopify-locales  (workspace:*)
        └── @solidifront/storefront-client    (workspace:*)

@solidifront/codegen        — depended on by NOTHING (declared)
example-basic
  └── @solidifront/start    (workspace:*)
```

Undeclared edges that exist anyway:

```
@solidifront/start  ──(filesystem, scripts/afterBuild.ts:6,15-36)──▶  packages/codegen
@solidifront/start  ──(filesystem, scripts/afterBuild.ts:40-47)───▶  packages/plugins/vite-plugin-generate-shopify-locales/dist/
vite-plugin-...-locales/src/locales/index.d.ts:5  ──(type import)──▶  @solidifront/codegen
```

**Where the boundaries are incoherent:**

1. **A build-time Vite plugin depends on the runtime storefront client.** `packages/plugins/vite-plugin-generate-shopify-locales/src/utils/getShopLocalization.ts:1` imports `createStorefrontClient` from `@solidifront/storefront-client` in order to run **one** GraphQL query at build time. That drags `effect`, `@effect/platform`, `graphql`, and `typescript` into a build tool. A `fetch` call with a JSON body would do the same job with zero dependencies.

2. **The locales plugin does an un-cached network call during Vite's `load()` hook** (`src/index.ts:97-113`). No cache file, no offline fallback, no error handling around `getShopLocalization`. Every cold dev-server start and every build hits the Storefront API, and fails hard without network or valid credentials. There is a single in-process `countries` memo (`src/index.ts:84`) which does not survive a restart.

3. **The locales plugin declares `vite` as a real `dependency`**, not only a peer (`package.json`: `"dependencies": { "@solidifront/storefront-client": "workspace:*", "vite": "^7.1.10" }`, plus the same range in `peerDependencies`). That installs a second Vite copy for consumers.

4. **`@solidifront/start` is four unrelated products in one package** — a Vite/SolidStart config generator (`src/config/`, 611 LOC, all Node-only ts-morph/fs work), a request middleware layer (`src/middleware/`, 206 LOC, server-only), an i18n UI layer (`src/localization/`, 297 LOC, mostly client components), and a data-fetching facade (`src/storefront/`, 233 LOC, isomorphic). They share nothing but a name, and the package's `exports` map is 90 lines of hand-written condition nesting trying to keep the server and browser halves apart.

5. **`@solidifront/storefront-client` and `@solidifront/start` both define `StorefrontQueries`/`StorefrontMutations` augmentation interfaces** (`storefront-client/src/schemas.ts:13-15`, `start/src/storefront/types.ts:7-8`), and the codegen `module:` target differs by consumer: the locales plugin's `.graphqlrc.ts:10` augments `@solidifront/storefront-client`, while `examples/basic/.graphqlrc.ts:9` and `solidifrontCodegenSetup.ts:71` augment `@solidifront/start/storefront`. Two global augmentation targets for the same concept.

---

## Real bugs found while reading

These are separate from "stale dependency" — they are defects in the current code.

| # | Location | Defect |
|---|---|---|
| 1 | `packages/storefront-client/src/services/DefaultHeaders.ts:56-81` | `combine()` does `const headers = defaultHeaders;` — **no clone**. Every per-request override (`apiVersion`, `contentType`, `publicAccessToken`, `privateAccessToken`, `buyerIp`) is written into the shared module-level `defaultHeaders` object and **persists for all subsequent requests through that client**. A request that passes a private token leaks that token into every later request; a request that passes `buyerIp` pins that IP forever. This is a cross-request state-leak in a long-lived server client. |
| 2 | `packages/storefront-client/src/services/StorefrontClient.ts:419-435` + `src/services/DefaultClientOptions.ts:25-44` | `StorefrontClient.fromEnv()` reads **both** `SHOPIFY_PRIVATE_STOREFRONT_TOKEN` and `SHOPIFY_PUBLIC_STOREFRONT_TOKEN` as required `Config.string`s and passes both to `make()`. `ClientOptions` → `TokenFields` (`schemas.ts:139-144`) has a filter that **rejects** having both. `fromEnv` therefore always fails to decode. Nothing in the workspace calls it, which is why nobody noticed. |
| 3 | `packages/storefront-client/src/schemas.ts:253` | `signal: S.optional(S.instanceOf(AbortSignal))` is declared in `RequestOptions` and **never read anywhere**. `grep -rn signal src/` returns only this line. Callers can pass an `AbortSignal` and it is silently dropped — there is no request cancellation. |
| 4 | `packages/storefront-client/src/index.ts:21-22, 53, 59-66` | `createStorefrontClient.Options` publicly advertises a `logger?: Parameters<typeof Logger.make>[0]` option. The implementation destructures `logger` out and then **discards it** — the entire wiring is commented out at lines 59-66, and the log level is hard-forced to `LogLevel.Error` at lines 76 and 91. A documented public option that does nothing. |
| 5 | `packages/storefront-client/src/index.ts:30-35` | `ReturnData<Operation, GeneratedOperations extends CodegenOperations = StorefrontMutations \| StorefrontMutations>` — the default is `StorefrontMutations` unioned with itself. Should presumably be `StorefrontQueries \| StorefrontMutations`. |
| 6 | `packages/storefront-client/src/index.ts:18` | `import { LogLevel } from "effect/index";` — barrel import from `effect/index` while every other import in the file is a deep `effect/Module` import. Defeats the deep-import tree-shaking the rest of the file is doing. |
| 7 | `packages/storefront-client/src/services/GraphQLOperation.ts:82-95` | `assert` is typed as returning `Effect.Effect<Operation, AssertQueryError \| AssertMutationError>` but is implemented with `Effect.filterOrDie`. The error becomes a **defect**, not a typed failure. The signature lies; consumers cannot `catchTag` it. |
| 8 | `packages/start/src/storefront/client.ts:20-28` | Reads `import.meta.env.SHOPIFY_PRIVATE_ACCESS_TOKEN` and `import.meta.env.SHOPIFY_PUBLIC_ACCESS_TOKEN`. Neither name exists. The real names, enforced by `solidifrontEnvSetup.ts:29-42` and declared in `packages/start/virtual.d.ts`, are `SHOPIFY_PRIVATE_STOREFRONT_TOKEN` / `SHOPIFY_PUBLIC_STOREFRONT_TOKEN`. Both reads are `undefined`, so the schema decode throws. **`createStorefrontClient` exported from `@solidifront/start/storefront` cannot work.** It is also referenced as a public type by the generated middleware declaration (`solidifrontMiddlewareSetup.ts:150`). |
| 9 | `packages/start/src/config/plugins/solidifrontEnvSetup.ts:76` and `solidifrontCodegenSetup.ts:248` | Two different Vite plugins registered under the identical name `"vite-plugin-solidifront-codegen-setup"`. |
| 10 | `packages/start/src/config/types.ts:20` + `defineConfig.ts:42,45` + `solidifrontCodegenSetup.ts:216-226` | A `customer?: {}` config key exists and gates `needsCodegen`, but `saveCodegenFile` only ever handles `config?.storefront`. Setting `solidifront.customer` turns codegen on and then generates nothing for it. Customer Account API is a stub. |
| 11 | `packages/storefront-client/src/services/StorefrontClient.ts:311-336` | `Reflect.set(options, "variables", …)` mutates the caller's `options` object in place, three times. A caller reusing an options object across calls accumulates injected `buyer`/`language`/`country`/`visitorConsent` variables. |
| 12 | `packages/storefront-client/package.json` | `main` is `"./dist/cjs/index.js"` but `exports["."].require` is `"./dist/cjs/index.cjs"`. Different filenames. |
| 13 | `packages/storefront-client/tsup.config.ts:9-15` and the locales plugin's `tsup.config.ts:7-13` | `bundle: false` combined with `splitting: true`. Code splitting requires bundling; the flag is inert. |
| 14 | `packages/plugins/vite-plugin-generate-shopify-locales/.graphqlrc.ts:8` | Codegen is pinned to `apiVersion: "unstable"`. So is `examples/basic/.graphqlrc.ts:8`. The generated types track Shopify's *unstable* schema. |
| 15 | `packages/storefront-client/src/errors.ts` + `src/constants.ts:6-13` | **No handling for HTTP 430.** Shopify's Storefront API reference states: *"If a request appears to be malicious, Shopify responds with a `430 Shopify Security Rejection` error code"* (https://shopify.dev/docs/api/storefront/2026-04). The error taxonomy covers 400, 402, 403, 404, 423, 429/503 and 5xx. A 430 passes every `filterOrFail` in `StorefrontClient.ts:111-143` (it is neither a listed status, nor in `RetriableStatusCodesError.validStatuses = [429, 503]`, nor `>= 500`), then fails at `HttpClientResponse.schemaBodyJson` with an opaque parse error. Bot-flagged traffic — which includes CI — surfaces as a schema failure rather than a typed error. |

---

## What is actually on npm right now

I ran `npm pack` on the two published packages that matter and read the tarballs. The published artifacts are worse than the source.

### `@solidifront/vite-plugin-generate-shopify-locales@1.2.8`

Full file list (`.map` files elided) and the published `exports` map:

```
package/dist/esm/index.d.ts          package/dist/esm/index.js
package/dist/esm/types.d.ts          package/dist/esm/types.js
package/dist/esm/utils/{debugLog,env,getShopLocalization}.{d.ts,js}
package/dist/esm/storefront.types.d-CGrYZtN2.d.ts
package/dist/cjs/{index,types}.cjs   package/dist/cjs/utils/*.cjs
package/dist/locales/index.d.ts
package/package.json  package/README.md  package/LICENSE
```

```json
"exports": {
  ".":        { "types": "./dist/index.d.ts",         "import": "./dist/esm/index.js",     "require": "./dist/cjs/index.cjs" },
  "./locales":{ "types": "./dist/locales/index.d.ts", "import": "./dist/locales/index.js", "require": "./dist/locales/index.cjs" }
}
```

Three of those six targets **do not exist in the tarball**:

- `./dist/index.d.ts` — missing. The real file is `./dist/esm/index.d.ts`. **The published plugin has no types at its main entry point.** Same for the top-level `"types"` field.
- `./dist/locales/index.js` — missing.
- `./dist/locales/index.cjs` — missing.

And `./dist/locales/index.d.ts`, which *is* present, opens with:

```ts
import type { CountryCode, CurrencyCode, LanguageCode } from "@solidifront/codegen/storefront-api-types";
```

against a package that is neither a declared dependency nor un-deprecated. This resolves the `[UNVERIFIED]` flag from §2 above: **confirmed broken in the published artifact.**

The `/locales` subpath only works in practice because the plugin serves it as a Vite *virtual module* (`src/index.ts:93-113`) — the exports map advertises a runtime file that was never built.

### `@solidifront/start@0.5.5`

Same class of failure, plus dead weight. Declared in `packages/start/package.json`:

- `"main": "./dist/server.js"` — **not in the tarball**
- `"module": "./dist/server.js"` — **not in the tarball**
- `"types": "./dist/index.d.ts"` — **not in the tarball** (the built file is `dist/index/index.d.ts`)
- `"browser": { "./dist/server.js": "./dist/index.js" }` — **neither path exists**
- `exports["./locales"].import: "./dist/locales.js"` — **not in the tarball** (only `dist/locales.d.ts`)
- `exports["./middleware:internal"].import: "./dist/virtual.js"` — **not in the tarball** (only `dist/virtual.d.ts`; this one is intentionally virtual)

And the `exports` map has **no `"."` entry at all**, so `import "@solidifront/start"` is unresolvable regardless.

Then the payload:

```
$ du -sh package/dist
9.0M    package/dist

$ du -h package/dist/{storefront,customer-account}.schema.json package/dist/*-api-types.d.ts
996K    customer-account.schema.json
852K    storefront.schema.json
312K    customer-account-api-types.d.ts
272K    storefront-api-types.d.ts
        → 2.4M total
```

**2.4 MB of the 9.0 MB unpacked package is vendored Shopify schema copied out of the deprecated `@solidifront/codegen` by `scripts/afterBuild.ts:12-38` — and not one of those four files is referenced by any entry in the `exports` map.** Every consumer downloads them; no consumer can import them.

### `@solidifront/storefront-client@0.5.5` — the one that is fine

For contrast: every target in this package's `exports` map exists in the tarball (`dist/esm/{index,effect,utils}.{js,d.ts}` plus matching `dist/cjs/*.cjs`). The only defect is the legacy `"main": "./dist/cjs/index.js"` where the built file is `index.cjs` — that only bites resolvers which ignore `exports`. Further evidence that `storefront-client` is the part worth keeping and `start` is the part that has rotted. Its four runtime dependencies ship as declared, `typescript` and `graphql` included.

---

## Dependency rot table

Every row verified with `npm view` on 2026-08-14. **No package in this repo's dependency list carries an npm `deprecated` flag** — I checked `vinxi`, `tsup`, `isomorphic-fetch`, `dts-bundle-generator`, `tsup-preset-solid`, `esbuild-plugin-solid`, `@shopify/hydrogen-codegen`, `@shopify/graphql-codegen`, `graphql`, `@solidjs/start` and all returned empty. The problem is staleness and supersession, not formal deprecation. The one genuinely npm-deprecated package in the graph is solidifront's own `@solidifront/codegen`.

| Package | Declared here | npm latest | Last publish | Verdict |
|---|---|---|---|---|
| `vinxi` | `^0.5.8` (dep + peer of `start`) | `0.5.11` | 2026-01-19 | **Remove.** SolidStart 2.0.0 has no vinxi. Repo not archived, but abandoned by its only consumer. |
| `@solidjs/start` | `^1.2.0` | **`2.0.0`** | 2026-08-04 | **Major behind.** 2.0 replaces vinxi with `srvx`/`h3@2`, peers `vite ^8\|\|^9`. |
| `@solidjs/router` | `^0.15.3` | **`1.0.0`** (`next: 2.0.0-next.16`) | 2026-08-12 | **Below SolidStart 2's peer floor** (`>=0.16.0`). |
| `solid-js` | `^1.9.9` | `1.9.14` (`next: 2.0.0-rc.0`) | 2026-08-12 | Restructure targets Solid 2; Solid 2 is at RC. |
| `@shopify/api-codegen-preset` | `^1.2.0` | **`3.0.0`** | 2026-08-10 | **Two majors behind.** |
| `@graphql-codegen/cli` | `^6.0.0` (`start`, locales plugin, `codegen`); **`^5.0.7`** in `examples/basic` | **`7.2.0`** | 2026-07-06 | One-to-two majors behind, and inconsistent across the workspace. |
| `@shopify/hydrogen-codegen` | `^0.3.2` (only runtime dep of `codegen`) | `0.3.3` | 2026-04-16 | Still 0.x; only used by the deprecated package. |
| `@shopify/graphql-codegen` | `^0.1.0` | `0.1.0` | 2026-04-16 | Still at its initial `0.1.0`; only used by the deprecated package (`codegen/src/defaults.ts:1`). |
| `graphql-config` | `^5.1.5` | `5.1.6` (`next: 3.0.0-rc.3`) | 2026-03-06 | Current-ish. |
| `vite-plugin-graphql-codegen` | `^3.7.0` | **`4.0.1`** | 2026-06-16 | Major behind. |
| `vite` | `^6.4.0` (client), `^7.1.10` (start, locales) | `^8 \|\| ^9` required by SolidStart 2 | — | **Three incompatible majors in one workspace.** |
| `vitest` | `^2.1.4` | **`4.1.10`** (`beta: 5.0.0-beta.7`) | 2026-08-11 | **Two majors behind.** |
| `effect` | `^3.19.12` | `3.22.1` (`rc: 4.0.0-rc.109`) | 2026-08-14 | Minor behind on v3; repo submodule tracks `main` @ `4.0.0-rc.109`. |
| `@effect/platform` | `^0.93.8` | `0.97.1` | 2026-07-30 | Several minors behind. |
| `typescript` | **`^7.0.2`** at root, **`^5.9.3`** in every package, and a **runtime dep** of `storefront-client` | `7.0.2` | 2026-08-13 | Root is on TS 7 + `@effect/tsgo` (`prepare: effect-tsgo patch --typescript --no-oxlint`); packages are on TS 5. Two compilers. |
| `ts-morph` | `^27.0.2` | **`28.0.0`** | 2026-04-12 | Major behind. Also: 5 files of the config layer are built on AST source-rewriting. |
| `tsup` | `^8.5.0` | `8.5.1` | **2025-11-12** | Current version, but ~9 months without a release. All four packages build with it. |
| `dts-bundle-generator` | `^9.5.1` | `9.5.1` | **2024-04-21** | **2 years 4 months without a release.** Load-bearing: `storefront-client/tsup.config.ts:26-45` uses it to emit all three public `.d.ts` bundles (tsup's own `dts: true` is commented out at line 24). |
| `tsup-preset-solid` | `^2.2.0` | `2.2.0` | **2023-12-25** | **2 years 8 months without a release.** Load-bearing: generates the entire `exports` map shape for `@solidifront/start` (`tsup.config.ts:16-36`). Predates SolidStart 2 entirely. |
| `esbuild-plugin-solid` | `^0.6.0` | `0.6.0` | **2024-05-05** | **Unused** — zero imports. Delete. |
| `isomorphic-fetch` | `^3.0.0` (+ `@types/isomorphic-fetch ^0.0.39`) | `3.0.0` | **2023-10-23** | **Unused** — zero imports. A `fetch` polyfill for Node ≥18. Delete both. |
| `copy-files-from-to` | `^3.11.0` | `4.0.1` | 2026-05-01 | Major behind; only used by the deprecated `codegen` package's manual schema-vendoring. |
| `resolve-accept-language` | `^3.1.13` | `3.2.2` | 2026-05-19 | Fine. Only real use is `createLocaleMiddleware.ts:7`. |
| `defu` | `^6.1.4` | `6.1.7` | 2026-04-07 | Fine. |
| `turbo` | `^2.1.2` | `2.10.10` | 2026-08-14 | Many minors behind; pipeline covers only `build`/`lint`/`dev`. |
| `@biomejs/biome` | `2.2.5` | — | — | Coexists with `prettier ^3.3.3`; both formatters active. |

---

## Recommendation per package

| Package | Recommendation | Reasoning |
|---|---|---|
| **`packages/storefront-client`** | **Rewrite, keep the shape** | The only part of this repo with real intellectual content: typed Effect service (`StorefrontClient.ts`), tagged status errors (`errors.ts`), schema-validated options (`schemas.ts`), and the in-context injection idea (`InContext.ts`). But it must be rebuilt: drop `typescript` and `graphql` from runtime deps; move `@inContext` injection to codegen so graphql-js leaves the bundle; replace the hard-coded `ValidVersion` union; fix the `DefaultHeaders.combine` mutation leak (bug #1); wire `signal` (#3) and `logger` (#4) or delete them from the API; delete or fix `fromEnv` (#2); decide Effect 3 vs Effect 4 before writing a line. ~2,100 LOC, of which maybe 60% is worth carrying. |
| **`packages/start`** | **Delete and re-derive** | Four unrelated concerns in one package, all of them bound to a framework version that no longer exists. `src/middleware/` and `src/localization/hooks/` import `vinxi/http`, which SolidStart 2 removed. The config layer (`src/config/`, 611 LOC of ts-morph source-rewriting into the consumer's tree, plus tsconfig.json mutation and a leaked-token codegen path) is the single most hostile thing in the repo and should not be ported at all. `src/storefront/hooks.ts` has one working function and 71 lines of commented-out mutation support. `src/index.tsx` is empty and the package has no `"."` export. Salvage the *ideas* — request-scoped storefront client in `event.locals`, locale-prefixed routing, `query()`-cached storefront reads — and write them fresh against SolidStart 2 / Solid 2. |
| **`packages/plugins/vite-plugin-generate-shopify-locales`** | **Rewrite as ~80 lines, or fold in** | The concept (generate a typed `countries` map from the shop's own localization data) is good and is genuinely useful. The implementation pulls the entire Effect storefront client into a build tool for one query, does an un-cached network call inside `load()`, ships a `.d.ts` importing a deprecated package it does not depend on (`src/locales/index.d.ts:5`), declares `vite` as a hard dependency, and pins codegen to `unstable`. Rewrite as a dependency-free plugin using `fetch` with an on-disk cache, or fold it into whatever replaces `@solidifront/start`'s config layer. |
| **`packages/codegen`** | **Delete** | Already npm-deprecated by the author with the message "Deprecated in favor of Shopify related codegen packages". Its vendored schemas are pinned to a manual 2025-10-04 `raw.githubusercontent.com` pull. Before deleting, sever the two live edges: `packages/start/scripts/afterBuild.ts:6` and `packages/plugins/.../src/locales/index.d.ts:5`. |
| **`packages/utils`** | **Delete** | Empty directory. Zero files. Matched by the `packages/*` workspace glob for no reason. |
| **`apps/`** | **Delete** | Empty directory, matched by the `apps/*` workspace glob. Last touched 2024-08-11. |
| **`examples/basic`** | **Delete, replace with a real fixture app** | Does not compile (imports the nonexistent `createMutationAction`). It is also the only integration coverage the repo has, which is the problem: it is simultaneously the demo, the manual test harness, and broken. The restructure needs a maintained example storefront that CI actually builds and Playwright actually drives — see `docs/research/otel-and-testing.md`. |
| **Root tooling** | **Rewrite** | Add `.github/workflows` (there is none). Add `test` and `typecheck` to `turbo.json` (neither exists). Pick one formatter — Biome or Prettier, not both. Pick one TypeScript — root is `^7.0.2` with `@effect/tsgo`, packages are `^5.9.3`. Replace the `create-turbo` starter `README.md`. Decide Effect 3 vs Effect 4 (`.gitmodules` tracks `main` @ `4.0.0-rc.109`; the code is on `^3.19.12`). |

---

## Order of operations for the restructure

Derived from the graph above, not invented:

1. **Decide the three foundation versions first**: Solid 2 / SolidStart 2, Effect 3 vs 4, TypeScript 5 vs 7. Everything else is downstream and re-litigating them later means rewriting twice.
2. **Delete `packages/utils`, `apps/`, `packages/codegen`** — after moving the two Shopify type-source edges onto `@shopify/api-codegen-preset@3` (which is what codegen's own deprecation message points at).
3. **Rebuild `storefront-client` first.** It is the only leaf; everything else depends on it. Get it dependency-light (no `typescript`, no `graphql`, no `vite`) and version-agnostic.
4. **Stand up CI before rebuilding `start`.** Right now there is nothing that can tell you whether a change breaks anything.
5. **Then re-derive the SolidStart integration**, against SolidStart 2's `srvx`/`h3@2` request primitives rather than `vinxi/http`.

## Open questions / could not verify

- **What replaces `vinxi/http`'s `getCookie`/`getHeader`/`setCookie` on the actual target.** I confirmed from `npm view @solidjs/start@2.0.0 dependencies` that vinxi is gone and `h3 ^2.0.1-rc.26` / `srvx ^0.12.4` are in, and the official middleware docs at https://docs.solidjs.com/solid-start/advanced/middleware **still document the SolidStart 1 shape** (they show `import { getCookie, setCookie } from "vinxi/http"` and `event.nativeEvent`). But per the correction in §1, `@solidjs/start@2.0.0` is a Solid **1.9** framework and not the destination — the Solid 2 target is `@solidjs/vite-plugin` start mode. **Resolve the request/cookie API against `@solidjs/vite-plugin`, not `@solidjs/start@2.0.0`.** See `docs/research/solid-2.md`. `[UNVERIFIED]` here; it may already be answered there.
- **Whether the Solid 2 target preserves the `middleware` config key and `event.locals`.** The v1 docs confirm `event.locals` is "a plain JavaScript object for request-scoped data storage" and that `createMiddleware` takes `onRequest`/`onBeforeResponse` — exactly what `packages/start/src/middleware/index.ts:15-36` builds on, and what `event.locals.storefront` (`createStorefrontMiddleware.ts:72`) and `event.locals.locale` (`createLocaleMiddleware.ts:31`) depend on. `[UNVERIFIED]` for the Solid 2 target.
- **Whether the currently-latest Shopify version is `2026-04`, `2026-07` or `2026-10`.** The versioning page's release table (https://shopify.dev/docs/api/usage/versioning) lists rows through `2027-01`; I could not tell which rows are released-now vs scheduled-future. Shopify's `dev-mcp` reports `2026-04` as its default. What *is* certain and sufficient: `2025-04` (solidifront's default) and `2025-07` are past their stated "accessible until" dates, and `2026-01` / `2026-04` / `2026-07` are all absent from `ValidVersion`.
- **Whether the local `dist/` on disk matches `src/`.** All four packages have a `dist/` present. I did not run a build. I did read the *published* 0.5.5 / 1.2.8 tarballs (see "What is actually on npm right now"), which is what consumers get; bugs #1–#14 are read from `src/`, and I did not diff them against the shipped JS.
- **Whether the token in `examples/basic/.solidifront/middleware/virtual.ts` is live.** It is untracked and never committed (`git log -S` returns nothing), but it is real-format and sitting in plaintext. Rotate it regardless.
- **Bundle sizes.** I did not measure what `graphql@16` + `effect@3` + `@effect/platform` actually cost in a browser build of `@solidifront/storefront-client`. The argument that they are too heavy for a storefront client is structural, not measured. `[UNVERIFIED]`.
- **`tsup`'s maintenance status.** Last release 2025-11-12 (9 months). Not deprecated, no successor announced that I verified. `[UNVERIFIED]` whether it is still actively maintained or coasting.
