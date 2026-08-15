# Building and publishing a *library* for Solid 2.0

**Research date:** 2026-08-14
**Primary source A — source code:** `references/solid` submodule, branch `next`, commit `15975306e524f197e2231ba6bd2c259c0dc39362` (committed 2026-08-12 16:09:14 -0700, `docs: sweep beta-era wording to RC across READMEs and 2.0 docs`)
**Primary source B — first-party library source:** `github.com/solidjs/solid-router` branch `next` (raw file reads: `package.json`, `tsconfig.json`, `rollup.config.js`, `src/routers/index.ts`) — the *only* first-party Solid 2 library that ships JSX
**Primary source C — published tarballs**, read after `npm pack`:
- `npm:@solidjs/vite-plugin@3.0.0-next.28` (`package/README.md`, `package/package.json`, `package/dist/esm/index.mjs`, `package/dist/types/src/index.d.ts`)
- `npm:@solidjs/router@2.0.0-next.16` (`package/package.json`, `package/dist/**`)
- `npm:@solidjs/meta@1.0.0-next.2` (`package/package.json`, `package/dist/index.js`)
- `npm:@solid-primitives/refs@3.0.0-next.2`, `npm:@solid-primitives/keyed@3.0.0-next.2`, `npm:@solid-primitives/media@4.0.0-next.2`, `npm:@solid-primitives/utils@7.0.0-next.4`
**Primary source D — docs:** `https://v2.solidjs.com` (`llms.txt`, `llms-full.txt`, 141 pages), `https://vite.dev/guide/build#library-mode`
**Primary source E — executed experiments:** four real Vite 7.3.6 builds against `solid-js@2.0.0-rc.0` / `@solidjs/web@2.0.0-rc.0` / `@solidjs/vite-plugin@3.0.0-next.28`, plus two `tsc` resolution traces. Every output quoted below was produced by running the build, not inferred. (Scratchpad only — nothing added to this repo.)

---

## 1. Verdict

**No. Vite library mode is not the answer for a Solid 2 library that ships JSX components — and it structurally cannot be.**

The answer is the same shape it has always been, minus the preset:

> **`tsc --jsx preserve` for the real artifact + a single Rollup bundle as a no-bundler fallback, published behind a `"solid"` export condition.**

This is not inference. It is verbatim what `@solidjs/router@2.0.0-next.16` — the only first-party Solid 2 library that ships JSX — does today:

```jsonc
// npm:@solidjs/router@2.0.0-next.16 — package/package.json
"scripts": { "build": "rm -rf dist && tsc && rollup -c" },
"exports": {
  ".":        { "solid": "./dist/index.jsx", "default": "./dist/index.js" },
  "./server": "./dist/server.js",
  "./fs":     "./dist/fs.js"
}
```

And the intent is stated outright in its Rollup config (`solid-router@next/rollup.config.js`):

```js
// The flat bundle is the no-build fallback only — every bundled
// project resolves the `solid` condition (index.jsx + the per-module
// tsc output), where data/events.ts's lazy serverForms import
// survives naturally. Inlining it here just keeps the single file
// self-contained.
inlineDynamicImports: true
```

**The `"solid"` condition survives Solid 2.0 intact.** The prior research (`docs/research/solid-2.md` §"The Solid 2.0 library-authoring build story is unestablished") was right that `tsup-preset-solid` has no successor, and right that no *tool* replaces it. It was wrong to imply the *convention* was in doubt. The convention is load-bearing in `@solidjs/vite-plugin@3.0.0-next.28`, which:

1. Injects `'solid'` as the **first** resolve condition in every Vite environment (`package/dist/esm/index.mjs:2977`):
   ```js
   config.resolve.conditions = ['solid', ...(replaceDev ? ['development'] : []), …, ...config.resolve.conditions];
   ```
2. Detects dependencies that publish the condition — `isFrameworkPkgByJson: pkgJson => containsSolidField(pkgJson.exports || {})` (`:2870`), where `containsSolidField` recurses the exports tree looking for the literal key `'solid'` (`:2607-2615`) — and feeds them to `crawlFrameworkPkgs` from `vitefu`.
3. Uses that result to set `optimizeDeps.exclude` (dev) and `resolve.noExternal` for the `ssr` environment (`:2988-2995`), so the library's un-compiled JSX flows through the consumer's compiler in **both** environments.

What *is* genuinely unestablished is the documentation: **`v2.solidjs.com` has zero pages on authoring or publishing a library.** Its "Project shapes" page enumerates exactly three shapes — `bare`, `basic`, `fullstack` — all of them applications (`https://v2.solidjs.com/getting-started/project-shapes.md`). Grepping the full 16,009-line `llms-full.txt` for `librar` returns only prose uses ("a session library", "Testing Library"). So: *the practice exists and is first-party; the docs for it do not.*

---

## 2. Why Vite library mode cannot produce the artifact — proved, not argued

Vite library mode **works** with `@solidjs/vite-plugin`. There is no incompatibility, no crash, no special casing. I ran it:

```ts
// vite.config.ts — this builds fine
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: { entry: "src/index.tsx", formats: ["es"], fileName: "index" },
    rollupOptions: { external: ["solid-js", /^@solidjs\/web/] },
  },
});
```

The problem is *what it emits*. Vite/Rollup always compiles JSX; there is no "preserve" escape hatch in the plugin (its full option surface is `include`, `exclude`, `dev`, `ssr`, `start`, `compiler`, `hot`, `refresh`, `extensions`, `solid`, `babel`, `typescript` — `package/dist/types/src/index.d.ts`). And **a compiled Solid artifact is not one artifact — it is three mutually incompatible ones.** Same input file, same plugin, three configs:

| Config | Emitted code | Usable by |
|---|---|---|
| `solid()` | `var _el$ = _tmpl$();` — DOM, **non**-hydratable | SPA consumers only |
| `solid({ ssr: true })`, client env | `var _el$ = getNextElement(_tmpl$); … runHydrationEvents();` | SSR consumers' client bundle only |
| `solid({ ssr: true })`, `build.ssr: true` | `ssr(_tmpl$, ssrHydrationKey(), …)` — string concatenation | SSR consumers' server bundle only |

Full emitted output for all three is reproducible from the config above; the diff is the point.

**There is no export condition that distinguishes "hydratable" from "not".** A SolidStart-style SSR app and a plain SPA both resolve `browser` + `import`. So a precompiled library must *guess* its consumer's rendering mode, and half its users get subtly broken output — dead hydration markers or a missing hydration walk. This is the entire reason the `solid` condition exists, and nothing in Solid 2 changes it.

Vite library mode also cannot emit the *unbundled, per-module* layout the `solid` branch needs (`dist/index.jsx` → `dist/routers/index.js` → `dist/routers/factory.jsx`, preserving the lazy-import graph). `rollupOptions.output.preserveModules` gets you separate files but still compiles the JSX out of them.

**Where Vite library mode *is* legitimately useful:** producing the `default` fallback bundle, in place of the hand-written `rollup.config.js`. My probe's `dist/index.js` output is functionally identical to what `@solidjs/router`'s Rollup config produces. If you already have Vite configured, that is a reasonable substitution. It replaces ~30 lines of Rollup config; it does not replace `tsc`.

### One real bug found in lib mode

With `build.ssr: true`, **`build.lib.fileName` is ignored** — I set `fileName: "server"` and got `dist-ssr/index.js`. Plan your `exports` map around the entry basename, or move the file after the build.

Also: the SSR build injects an extra `export const $$moduleUrl = "src/index.tsx"` into every module (`package/dist/esm/index.mjs:2840-2842` — the `lazy()` module-URL placeholder contract). Harmless in an app, but it is a spurious public export in a published library.

---

## 3. The JSX question, answered

### 3.1 The convention survives — verified end to end

I fabricated a router-shaped package in a consumer's `node_modules` (`{ "solid": "./dist/index.jsx", "default": "./dist/index.js" }`, where the `default` file returns a distinguishable marker string) and built a consumer app against it.

**Client build** — the plugin resolved `dist/index.jsx` and compiled the library's JSX into the consumer's bundle with DOM codegen:

```js
import { insert, template, delegateEvents, createComponent } from "@solidjs/web";
var _tmpl$$1 = /* @__PURE__ */ template(`<div class=lib><button>inc</button><span>`);
function LibCounter(props) { … }        // ← from the library's un-compiled .jsx
const App = () => { … insert(_el$, createComponent(LibCounter, { start: 3 })); … };
```

**SSR build** — the same library source came out as SSR string codegen:

```js
import { ssrHydrationKey, scope, escape, ssr } from "@solidjs/web";
var _tmpl$$1 = ["<div", ' class="lib"><button>inc</button><span>', "</span></div>"];
function LibCounter(props) { … return ssr(_tmpl$$1, _v$, _v$2); }
```

One source, two correct compilations, chosen by the consumer. That is the whole value proposition, and it still holds in Solid 2.

### 3.2 A gotcha worth knowing: the dependency must be *declared*

On my first SSR run the library was left **external** and the SSR bundle emitted `import { LibCounter } from "my-solid-lib"` — meaning Node would resolve it at runtime *without* the `solid` condition and load the DOM-compiled `default` fallback on the server. Broken SSR, silently.

The cause: `crawlFrameworkPkgs` walks the consumer's declared dependencies. My probe package wasn't listed in `package.json`. Adding `"my-solid-lib": "1.0.0"` to `dependencies` and re-running produced the correct inlined SSR output above.

**Implication:** the mechanism does not work for undeclared, hoisted, or `paths`-aliased packages. In a pnpm monorepo, a workspace consumer must list the library as `"@scope/lib": "workspace:*"` in its own `package.json` — which you'd do anyway, but it's now correctness-critical rather than hygiene.

### 3.3 What replaces `tsup-preset-solid`

Nothing, as a package. The preset's job decomposes into two commands you now run yourself:

| `tsup-preset-solid` did | Solid 2 equivalent |
|---|---|
| emit un-compiled JSX for the `solid` condition | `tsc` with `"jsx": "preserve"` — emits `.jsx` for every `.tsx`, `.js` for every `.ts`, `.d.ts` alongside |
| emit compiled `browser` + `server` variants | **dropped.** One Rollup bundle, DOM codegen, as `default` only |
| emit a `development` variant | **dropped.** Dev/prod is the consumer's compile, not yours |
| generate the `exports` map | write it by hand — it is now ~6 lines |
| emit CJS | **dropped** by every Solid 2 first-party package (`"type": "module"`, ESM only) |

The Solid 2 exports map is dramatically smaller than what `tsup-preset-solid` generated. Compare `@solidifront/start`'s current map (`packages/start/package.json` — a five-level `worker`/`browser`/`deno`/`node` × `solid`/`development`/`import` tree per entry, generated by `preset.generatePackageExports` in `packages/start/tsup.config.ts:29`) against the router's two-line map. **That entire tree is now overkill**: the `solid` branch is environment-agnostic by construction, because the consumer's own environment picks the codegen.

---

## 4. What the ecosystem actually does — four data points

| Package | Ships JSX? | Build | `solid` condition? | Notes |
|---|---|---|---|---|
| **`@solidjs/router@2.0.0-next.16`** | **yes** | `tsc && rollup -c` | **yes** | The reference implementation |
| `@solidjs/meta@1.0.0-next.2` | no | `tsc` | no | Source is plain `.ts` calling `createComponent` by hand; verified — `dist/index.js` contains no template calls |
| `@solid-primitives/*@next` (~all) | **no** | `tsdown` + `unplugin-solid/rolldown` | no | See §4.1 |
| `@solidjs/testing-library@1.0.0-beta.2` | no | plain `tsup --format esm,cjs --dts` | no | Dev-dependency-only; SSR is not a concern |

Solid's *own* core packages (`solid-js`, `@solidjs/web`, `@solidjs/h`, `@solidjs/html`, `@solidjs/universal`, `@solidjs/signals`) are all `rollup -c` + `tsc` with elaborate hand-written `worker`/`browser`/`deno`/`node` × `development` × `import`/`require` exports maps and dual `types`/`types-cjs` declaration trees (`references/solid/packages/*/package.json`). **Do not copy these.** They are runtime packages shipping hand-authored, hand-optimised dev/prod/server variants of *the runtime itself* — a completely different problem from a component library. None of them declares a `solid` condition (grep across the submodule: zero hits outside a doc comment at `references/solid/packages/solid-web/src/index.ts:70`).

### 4.1 The `tsdown` finding, and why it is a red herring for you

`solid-primitives` — historically *the* flagship consumer of `tsup-preset-solid` — has moved its Solid 2 `next` line to **`tsdown` + `unplugin-solid/rolldown`** (`solidjs-community/solid-primitives@next/tsdown.config.ts`, root `package.json` `"build": "tsdown"`). Their config is genuinely nice — `unbundle: true`, `dts: true`, `workspace: { include: ["packages/*"] }` builds every package in the monorepo from one root config.

Two reasons not to follow it:

1. **They ship no JSX.** Their config hard-codes `solid({ solid: { generate: "dom", hydratable: false } })` — the exact single-guess trap from §2 — and their published exports carry **no `solid` condition**: `{ "import": { "@solid-primitives/source": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" } }`. I checked their two most JSX-looking packages (`@solid-primitives/refs@3.0.0-next.2`, `@solid-primitives/keyed@3.0.0-next.2`): both `dist/index.js` files contain **zero** `template(`/`ssr(` calls. No JSX was ever compiled. The choice costs them nothing because it never binds.
2. **`unplugin-solid` is Solid 1 only.** `unplugin-solid@2.0.0` depends on `babel-preset-solid: ^1.9.12` and peer-depends `solid-js: ^1.9.9`; `@1.0.0` (what their pnpm catalog pins) depends on `babel-preset-solid: ^1.9.9`. There is no Solid 2 release. In their build it is effectively a no-op. **`tsdown` + `unplugin-solid` is not a verified Solid-2 JSX-compiling path.**

`tsdown`'s `unbundle: true` mode *could* in principle produce the per-module `solid` branch, replacing `tsc` — but it would need a Solid-2-aware transform that also preserves JSX, and no such plugin exists. Not today.

---

## 5. Is `tsup-preset-solid` / `esbuild-plugin-solid` abandoned?

**Quiet, not deprecated — but effectively dead for Solid 2.** Neither carries an npm `deprecated` flag; neither repo is archived.

| | `tsup-preset-solid` | `esbuild-plugin-solid` |
|---|---|---|
| latest | `2.2.0` | `0.6.0` |
| last publish | 2023-12-25 | 2024-05-05 |
| repo last push | 2024-06-16 | 2025-02-10 |
| dist-tags | `{ latest }` only — **no `next`** | `{ latest }` only — **no `next`** |
| open issues | 4 | 4 |
| Solid 2 issues | **none** — newest is #16 "tsup exports .mjs sporadically" (2025-08-17) | not enumerated |

Nobody has even *filed* a Solid 2 issue against `tsup-preset-solid`. Contrast the rest of the ecosystem, all of which published Solid 2 prereleases on 2026-08-12–13: `solid-js@2.0.0-rc.0`, `babel-preset-solid@2.0.0-rc.0`, `@solidjs/vite-plugin@3.0.0-next.28`, `@solidjs/router@2.0.0-next.16`, `@solidjs/meta@1.0.0-next.2`, `@solid-primitives/*@next`, `solid-refresh@0.8.0-next.7`, `@dom-expressions/babel-plugin-jsx@0.50.0-next.42`. The two build presets are the only stragglers, and their largest consumer migrated away.

Mechanically, `tsup-preset-solid@2.2.0` would still emit the *right shape* — it generates `solid`-condition entries — but it wires `babel-preset-solid` 1.x, whose JSX output targets `solid-js/web` rather than `@solidjs/web` (`references/solid/packages/babel-preset-solid/index.js` in the RC sets `moduleName: "@solidjs/web"`). The compiled fallback would import a module that does not exist in Solid 2. **Treat both as unusable.**

---

## 6. Recommended build for a Solid 2 library in a pnpm monorepo

Copy-pasteable. This is `@solidjs/router`'s setup with the sharp edges labelled.

### 6.1 `packages/<lib>/package.json`

```jsonc
{
  "name": "@solidifront/<lib>",
  "version": "0.0.0",
  "type": "module",
  "sideEffects": false,
  "types": "./dist/index.d.ts",
  "main": "./dist/index.js",
  "files": ["dist"],
  "exports": {
    ".": {
      "solid": "./dist/index.jsx",
      "default": "./dist/index.js"
    },
    // Sub-entries that contain NO JSX need no `solid` branch — point
    // straight at the per-module tsc output. (This is what the router
    // does for ./server and ./fs.)
    "./server": "./dist/server.js",
    "./package.json": "./package.json"
  },
  "scripts": {
    "build": "rm -rf dist && tsc && rollup -c",
    "prepublishOnly": "pnpm build",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "solid-js": "^2.0.0-rc.0",
    "@solidjs/web": "^2.0.0-rc.0"
  },
  "devDependencies": {
    "@rollup/plugin-babel": "6.0.4",
    "@rollup/plugin-node-resolve": "15.3.0",
    "@babel/core": "^7.26.0",
    "@babel/preset-typescript": "^7.26.0",
    "babel-preset-solid": "2.0.0-rc.0",
    "rollup": "^4.27.4",
    "solid-js": "2.0.0-rc.0",
    "@solidjs/web": "2.0.0-rc.0",
    "typescript": "^5.7.2"
  }
}
```

**Pin exact versions for every Solid package.** `@solidjs/vite-plugin` publishes prereleases to the `latest` tag (`dist-tags: { next: "3.0.0-next.28", latest: "3.0.0-next.28" }`) while `solid-js`'s `latest` is still `1.9.14` — a bare `pnpm add` mixes majors. Mirror what the Solid monorepo does and put the pins in a `pnpm-workspace.yaml` `catalog:` (`references/solid/pnpm-workspace.yaml` uses `overrides` for the same purpose; `solid-primitives@next` uses `catalog:` + `catalogs.peer`).

`sideEffects: false` — every Solid 2 first-party package sets it.

### 6.2 `packages/<lib>/tsconfig.json`

Verbatim from `solid-router@next/tsconfig.json`, which is the only config known to produce a working `solid` branch:

```jsonc
{
  "compilerOptions": {
    "declaration": true,
    "target": "esnext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "preserve",
    "jsxImportSource": "@solidjs/web",
    "strict": true,
    "newLine": "LF",
    "rootDir": "./src",
    "outDir": "./dist",
    "skipLibCheck": true
  },
  "include": ["./src"],
  "exclude": ["node_modules/", "src/**/*.spec.ts"]
}
```

- `"jsx": "preserve"` is what makes `.tsx` emit as `.jsx` with JSX intact. This is the whole trick.
- `"jsxImportSource": "@solidjs/web"` — the renderer, not `solid-js`, owns web JSX types in Solid 2 (`https://v2.solidjs.com/migration/from-solid-1`).
- `"moduleResolution": "NodeNext"` forces explicit extensions in your *source* imports, and you must write the **output** extension: a `.tsx` file is imported as `./factory.jsx`, a `.ts` file as `./history.js`. Confirmed in `solid-router@next/src/routers/index.ts`:
  ```ts
  export { createRouter, defineRoute, defineRoutes } from "./factory.jsx";
  export { browserHistory, hashHistory, memoryHistory } from "./history.js";
  ```
  Get this wrong and the emitted `dist/*.jsx` graph has broken specifiers — the failure only shows up in a consumer, never in your own typecheck.

### 6.3 `packages/<lib>/rollup.config.js`

Verbatim shape from `solid-router@next/rollup.config.js`:

```js
import babel from "@rollup/plugin-babel";
import nodeResolve from "@rollup/plugin-node-resolve";

export default {
  input: "src/index.tsx",
  output: [{ file: "dist/index.js", format: "es", inlineDynamicImports: true }],
  // Externalise the peers. Everything else is bundled so the fallback
  // is one self-contained file.
  external: id =>
    id === "solid-js" || id === "@solidjs/web" || id.startsWith("@solidjs/web/"),
  plugins: [
    nodeResolve({ extensions: [".js", ".ts", ".tsx"] }),
    babel({
      extensions: [".js", ".ts", ".tsx"],
      babelHelpers: "bundled",
      presets: ["solid", "@babel/preset-typescript"],
      exclude: ["node_modules/**", "**/*.spec.ts"],
    }),
  ],
};
```

Ordering matters: `tsc` runs first and emits `dist/index.jsx` (from `src/index.tsx`), then `rollup` writes `dist/index.js`. No collision, because `tsc` never emits `index.js` for a `.tsx` input.

`presets: ["solid"]` resolves to `babel-preset-solid@2.0.0-rc.0`, whose defaults are `moduleName: "@solidjs/web"`, `generate: "dom"`, `hydratable` unset (`references/solid/packages/babel-preset-solid/index.js`). That is deliberately the *non-hydratable DOM* build — the fallback is for consumers with no Solid-aware bundler, who are by definition not doing SSR.

### 6.4 Types

`tsc` emits `.d.ts` next to each `.js`/`.jsx`, and both branches of the exports map land on the same declaration file. I verified this with `tsc --traceResolution` on the router-shaped package:

- **No `customConditions`** (default `moduleResolution: bundler`): `Saw non-matching condition 'solid'` → `Matched 'exports' condition 'default'` → `./dist/index.js` → `dist/index.d.ts`. ✅
- **With `customConditions: ["solid"]`**: `./dist/index.jsx` → strips `.jsx` → `dist/index.d.ts`. ✅

Both resolve. **You do not need a `"types"` condition inside the exports map**, and the router deliberately omits one. Note it is `dist/index.d.ts` in both cases — `tsc` emits `index.d.ts` (not `index.d.jsx`) for a `.tsx` input, which is why this works at all.

### 6.5 Consumer side (the app or example in your monorepo)

```ts
// vite.config.ts — nothing special is required
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
export default defineConfig({ plugins: [solid({ start: true, ssr: true })] });
```

The plugin injects `'solid'` into `resolve.conditions` for every environment and noExternal's your package automatically — **provided it is a declared dependency** (§3.2). In a pnpm workspace that means `"@solidifront/<lib>": "workspace:*"` in the consuming app's `package.json`, not just a tsconfig path.

For Turborepo, note that the router-style build is two sequential steps in one script; if you split them, `rollup` must depend on `tsc` for the same package (`references/solid/turbo.json` does exactly this kind of intra-package ordering for `solid-js#build` / `solid-js#types`).

### 6.6 What this means for `@solidifront/start`

`packages/start/tsup.config.ts` imports `tsup-preset-solid` and builds `src/localization/index.tsx` with `dev_entry: true, server_entry: true` (`:9-23`). Under the recommendation above, **all three of those variants collapse into one `dist/localization/index.jsx`**, and the generated `worker`/`browser`/`deno`/`node` × `development` exports tree in `packages/start/package.json` collapses to `{ "solid": …, "default": … }`. That is a large net deletion, not a port.

---

## 7. Dual server/client builds — no longer needed

`tsup-preset-solid` produced separate `server_entry` (SSR codegen) and browser entries, selected by `node`/`worker`/`deno` vs `browser` conditions. **Solid 2 first-party practice drops this entirely.** `@solidjs/router` ships one `solid` branch and one `default` branch; no `server`, no `browser`, no `development`.

It works because the `solid` branch is *pre-codegen*. The consumer's SSR environment compiles it with `generate: "ssr"`, the client environment with `generate: "dom"` + `hydratable`, from the same file — demonstrated in §3.1. The library never has to know.

The one thing you may still want a separate entry for is **code that must not reach the client at all** — the router's `./server` subpath is exactly that (`dist/server.js`, documented in its own source as "Server-only entry … it reaches for node async context via `@solidjs/web/storage` — keep it out of client bundles"). That is a *module boundary*, not a *codegen variant*, and it needs no export conditions — just a distinct subpath. `@solidjs/vite-plugin` also ships `server-only` / `client-only` marker modules that turn a boundary violation into a build error at the exact import edge (`package/README.md` §"server-only and client-only boundary markers"); a library can import them to enforce its own boundaries.

---

## 8. Summary table

| Question | Answer | Confidence |
|---|---|---|
| Does Vite library mode work for a Solid 2 library? | It runs, and correctly produces *one* compiled variant. It cannot produce the un-compiled `solid` branch, so it cannot be the whole build. | **verified by execution** |
| Does the `"solid"` export condition survive Solid 2? | **Yes.** Injected first in `resolve.conditions` by the plugin; used by `@solidjs/router@2.0.0-next.16`. | **verified** — plugin source + published tarball |
| How do you produce the un-compiled JSX now? | `tsc` with `"jsx": "preserve"` + `"jsxImportSource": "@solidjs/web"`. | **verified** — router's `tsconfig.json` + its published `dist` |
| What `exports` map? | `{ ".": { "solid": "./dist/index.jsx", "default": "./dist/index.js" } }`, ESM only, no CJS, no `types` condition needed, plain-path subentries for JSX-free modules. | **verified** |
| Separate SSR and client builds? | **No.** One `solid` branch + one DOM fallback. | **verified** |
| Is `tsup-preset-solid` abandoned? | Not deprecated, but 2.5 years without a publish, no Solid 2 issues filed, largest consumer migrated off, and its `babel-preset-solid@1.x` output targets the wrong module. Unusable. | **verified** — npm + GitHub metadata |
| What do first-party Solid 2 packages do? | Router: `tsc && rollup -c` + `solid` condition. Meta: `tsc` only (no JSX). Core runtime packages: bespoke Rollup, do not copy. | **verified** |

---

## 9. Open questions / could not verify

1. **Nobody has written this down.** `v2.solidjs.com` (141 pages) contains no library-authoring or publishing page. There is no migration guide from `tsup-preset-solid`. The recipe in §6 is reverse-engineered from one first-party library plus the plugin's source, and confirmed by running it. If the Solid team intends something different for the 2.0 GA, it is not published anywhere I could find. **This is a real gap, and worth an upstream issue.**

2. **`n = 1` for JSX-shipping Solid 2 libraries.** `@solidjs/router@2.0.0-next.16` is the only one I found, first- or third-party. `@solidjs/meta` and every `@solid-primitives/*@next` package ship zero JSX. I searched but did not exhaustively enumerate the npm registry — there may be community Solid 2 component libraries I missed.

3. **Multi-entry `solid`-condition packages are untested by me.** The router has exactly one JSX entry (`.`). A library with several JSX subpaths (which `@solidifront/start` would be) needs a `solid` branch per subpath and a Rollup `input` per subpath. Mechanically obvious, but no first-party example exists and I did not build one.

4. **Dev-mode consumption was read, not run.** I verified the `optimizeDeps.exclude` / `ssr.noExternal` wiring by reading `package/dist/esm/index.mjs:2860-2995`, and verified the production builds by running them. I did not stand up a `vite dev` server against a `solid`-condition dependency, so HMR-through-a-workspace-library is unconfirmed.

5. **`compiler: "native"` vs the `solid` branch.** The plugin now defaults to `compiler: "native"` (`@dom-expressions/compiler`, wasm fallback) rather than Babel. My end-to-end test used the default, so the native compiler demonstrably handles a dependency's un-compiled `.jsx`. Whether the two backends produce byte-identical output for library code is unverified — the plugin's own docs frame a behavioural diff as a bug report (`package/dist/types/src/index.d.ts`, `compiler` option).

6. **`tsdown` as a `tsc` replacement.** `tsdown`'s `unbundle: true` produces per-module output and could in principle replace `tsc` for the `solid` branch, giving one tool for both branches. It would need a JSX-preserving, Solid-2-aware transform. `unplugin-solid` is not it (Solid 1 only, §4.1). Unexplored.

7. **`@solid-primitives/source`.** solid-primitives publish a custom `"@solid-primitives/source": "./src/index.ts"` condition pointing at raw TypeScript. I did not determine whether it is consumed outside their own monorepo, or whether it is a pattern worth imitating for workspace-internal development.

8. **CJS consumers.** Every Solid 2 first-party package is ESM-only (`"type": "module"`, no `require` branch outside the core runtime's own dual-types setup). If solidifront has CJS consumers, that constraint is now yours to solve alone; nothing upstream will help.
