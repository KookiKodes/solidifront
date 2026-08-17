# Generated modules export a layer, not a runtime

The build generates one module per environment that merges solidifront's base layer with the consumer's, and exports the **merged `Layer`**. The `ManagedRuntime` is constructed from it in ordinary library code. Configuration comes from Solid's typed env, not from the config module — which therefore holds only layers and is optional. Decided in [#21](https://github.com/KookiKodes/solidifront/issues/21), extending [#13](https://github.com/KookiKodes/solidifront/issues/13).

```ts
// @solidifront/server/package.json — a REAL subpath, overridden by the plugin
"exports": { "./internal/layer": { "types": "./dist/internal/layer.d.ts", "default": "./dist/internal/layer.js" } }

// dist/internal/layer.js — what ships, and what runs if the plugin is missing
throw new Error("[solidifront] `solidifront()` is missing from your vite.config.ts");

// what the plugin substitutes — imports, a merge, an export, nothing else
import "server-only";
import userLayer from "/solidifront.server.ts";        // omitted when the file is absent
import { baseServerLayer } from "@solidifront/server/internal/base";
export const appLayer = Layer.mergeAll(baseServerLayer, userLayer);
```

The client half is the same shape at `@solidifront/solid/internal/layer`, minus `server-only` and minus anything credentialed. There are exactly two; there is no shared isomorphic third.

> **Amended by [ADR-0005](./0005-the-api-version-type-is-open-and-narrowed-by-codegen.md).** "No isomorphic third" governs **layers**, which is what this ADR is about. A generated module carrying only the pinned API version — a string — is *data*, and the same code/data distinction that splits the two config files below admits it. The API version ships as one isomorphic subpath. Nothing about the layer modules changes.

## Why a layer, not a runtime

Constructing the runtime carries two rules that are easy to get wrong and invisible when they are: it must be created **detached** (`runWithOwner(null, …)` — Solid 2's `createRoot` is parent-owned by default, so a runtime built under an active owner is finalized when that subtree disposes) and it must be a **process-lifetime singleton**. Generated code is the one place a consumer cannot set a breakpoint or read the source on GitHub, and it is the worst possible home for both.

So generated code holds no logic at all, and both rules live in a real file with real tests.

This is also why the module is not called `runtime`: it does not contain one, and `runtime` is on `CONTEXT.md`'s avoid-list because it already means three things in this project. `virtual:solidifront/runtime`, as named in #13 §2, does not exist.

## Why the specifier is a real file rather than an invention

A pure `virtual:` id needs an ambient `.d.ts` shipped to consumers, and an app that forgot the plugin fails with Vite's generic `Failed to resolve import … from node_modules/@solidifront/server/dist/…` — pointing at our internals, about their config. A real subpath resolves under `tsc` with no ambient declaration, fails with **our** message, and is promotable to public API later without changing how anything resolves.

## Why two config files

`solidifront.server.ts` and `solidifront.client.ts` are physically separate because **layers are code**. Solid's `env.ts` can hold `server` and `client` in one file: env values are *data*, and its plugin emits validated values into the client virtual module — the file itself never enters the client graph. A shared layer file would put a module that constructs the token-holding storefront transport into the client graph and bet a private access token on Rollup tree-shaking a subtree that any top-level `process.env` read can pin. Solid documents its own leak scan as "a backstop, not a guarantee that a client value is secret."

Split physically, there is nothing to tree-shake and nothing to scan.

## Why configuration is not in the config module

Store identity and secrets come from `virtual:env/server` (Standard Schema validators, generated `solid-env.d.ts`, client-graph leak scan). Plugin options carry build-time concerns only. That leaves the config module holding one kind of thing, which is what makes it a pure extension point — and therefore **optional**, since most apps add zero layers.

Optional has exactly one failure mode and it is closed explicitly: a file at the wrong path or under the wrong name would be silently ignored, so the plugin globs `solidifront.*` at the root and warns on any name that is not one of the two.

## Non-obvious details that cost time

- **`optimizeDeps.exclude` and `ssr.noExternal` are not optional.** Both packages must be added by the plugin's `config` hook. Otherwise esbuild pre-bundles the dependency and resolves `internal/layer` before `resolveId` ever sees it — and the consumer ships the throwing stub to production.
- **Config edits force a full dev-server restart, deliberately.** The app layer becomes a module-scope singleton constructed detached: nothing owns it, nothing disposes it. HMR replaces the module and leaks the old `ManagedRuntime` — scopes, transport and OTEL exporter still live, old runtimes still exporting spans. The generated module declares itself non-hot-updatable.
- **`import "server-only"` is free enforcement.** `@solidjs/vite-plugin`'s `boundaryModules()` is always on at `enforce: 'pre'` and fails at resolve time with a message naming the importer. Do not hand-roll it. It is backed by two more layers — the same marker scaffolded into the consumer's own file, and a `resolveId` guard rejecting either config path resolved in the wrong environment.
- **The plugin never writes into the consumer's source tree.** Scaffolding is on demand only. The predecessor wrote `.solidifront/middleware/virtual.ts` and rewrote `src/global.d.ts`, and `docs/research/current-state-audit.md:153` found a real-format access token committed into the generated file.

## Consequences

`RequestContext` is in **neither** layer. It is provided at the call site in both environments (#21 §4, correcting #13 §10) — a layer-baked locale is read after the Effect handoff, where Solid cannot see it, so a market switch would silently fail to re-run every query. A reader who expects the app layer to be "complete" will find it deliberately isn't.

Consumer layers merge **last** and win on conflict, so overriding `HttpClient`, the logger, or the transport is supported. "Did you override `HttpClient`?" becomes a support question; that is the price of layers being the public API.

Sourcing config from Solid's typed env rests on Effect `Schema` satisfying Solid's Standard Schema reading — *"very likely drop-in"* per `docs/research/solid-2.md` D7, but **not empirically verified**. [#31](https://github.com/KookiKodes/solidifront/issues/31) verifies it. If it fails, a thin solidifront env plugin returns; nothing else here changes.
