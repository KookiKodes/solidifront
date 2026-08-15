# Effect v4 — what changes from v3, and how to build the Storefront API client + service layer on it

**Research date:** 2026-08-14 (revised same day after submodule update)
**Primary source:** `references/effect` git submodule, branch `main`
**Commit read:** `6eebd0a618308a91f95947bae6e0fb206ae3939d` — "feat: add v2025-11-25 protocol adapter (#7234)", authored 2026-08-14 14:23 +0200, packages at version **`4.0.0-rc.109`**. `.changeset/pre.json` is `{"mode": "pre", "tag": "rc"}`.
**Secondary local source:** `references/solid` @ `15975306e524f197e2231ba6bd2c259c0dc39362`, branch `next`, `solid-js@2.0.0-rc.0`.
**Also read:** `node_modules/@effect/tsgo@0.36.4`, npm registry metadata, `effect.website`.

> **Revision note.** The first draft of this document was researched against `references/effect` @ `60814c2d` (branch `v4/next-major`, `4.0.0-beta.106`, 2026-08-06) — three releases and a beta→RC transition behind current. The submodule has since been moved to `main` @ `6eebd0a6` (`4.0.0-rc.109`) and **every finding below has been re-verified against that tree.** Both commits are present locally as shallow grafts, so verification was done both by re-grepping rc.109 and by diffing the two trees directly (`git diff 60814c2 HEAD`), which gives an exact beta.106 → rc.109 delta rather than a spot-check. §1.5 lists everything that actually moved.

**Branch map** (which branch holds which version, since this is easy to get wrong):

| branch | `packages/effect` version |
|---|---|
| `main` | 4.0.0-rc.109 ← **use this** |
| `v4/next-major` | 4.0.0-beta.106 |
| `next-minor` | 4.0.0-beta.103 |
| `next-major` | 3.11.9 |

---

## 1. What this means for solidifront

The decisions this research forces, in priority order.

### D1. Target v4, not v3. The window just opened.

v4 is in RC as of two days ago. The Effect team's RC post ([effect.website/blog/releases/effect/40-rc](https://www.effect.website/blog/releases/effect/40-rc), published 2026-08-12) says: *"We are confident that the sweeping changes are behind us, and we have no more broad breaking changes planned"* and *"If a narrowly scoped breaking change proves necessary, we will communicate it clearly and provide a straightforward migration path."* Stable is targeted for **Q3/Q4 2026**.

That timing lines up with the Solid 2.0 RC restructure. Shipping a new solidifront on `effect@3` would mean rewriting the entire library within months — the v3→v4 delta is not a version bump, it is a near-total rename of the surface solidifront touches (see §8).

**Caveat that shapes packaging:** everything solidifront needs from the HTTP layer lives under `effect/unstable/http`, and `MIGRATION.md:42-50` states unstable modules *"may receive breaking changes in minor releases, while modules outside `unstable/` follow strict semver."* So even post-4.0.0-stable, the Storefront client's dependency surface is on the churn-prone side of the line. Budget for it.

### D2. `@effect/platform` is gone. HttpClient moves into core.

*Re-confirmed at rc.109.* `@effect/platform` has **no 4.x release at all** (`npm view @effect/platform versions` still ends at `0.97.1`). Its contents were absorbed into `effect` itself. Every `@effect/platform/*` import in `packages/storefront-client` becomes `effect/unstable/http/*` — the module list at `references/effect/packages/effect/src/unstable/http/` is unchanged apart from an additive new `HttpStatus.ts`.

> Do not be misled by the new `references/effect/packages/platform/` directory at rc.109. It is a grouping folder for `@effect/platform-{browser,bun,deno,node,node-shared}` (a repo layout change, §1.5②), not a revival of the `@effect/platform` package.

Consequence: solidifront drops one direct dependency, and its runtime dependency footprint for the Storefront client becomes **`effect` alone** (plus `graphql` for the operation AST work).

### D3. Services are declared with `Context.Service`, and there is no auto-generated layer.

*Re-confirmed at rc.109.* `Context.Tag` does not exist in v4 — grepping `^export const Tag\b` in `references/effect/packages/effect/src/Context.ts` returns nothing, as does `Context.isTag`. All five service declarations in `packages/storefront-client` (`StorefrontClient`, `DefaultClientOptions`, `DefaultHeaders`, `GraphQLOperation`, `InContext`) must be rewritten.

The `Context.Service` overload set is unchanged at rc.109 (`references/effect/packages/effect/src/Context.ts:201-235`) — `Context.Service<Self, Shape>()(id, { make? })` is still the class idiom.

Critically for a library: v3's `Effect.Service` auto-generated a `.Default` layer from a `dependencies` array. **v4 generates nothing** — re-verified two ways at rc.109: the `ServiceClass` interface (`Context.ts:123-128`) declares only `new(_: never)` and `readonly key`, with no `Default` or `layer` member, and grepping `Context.ts` for `\bDefault\b` finds only doc-comment prose about `Reference` default values. `references/effect/migration/services.md:174` still states the `make` option *"stores the constructor effect on the class but does **not** auto-generate a layer. Define layers explicitly using `Layer.effect`."* The v4 convention (`services.md:187,197`) is a hand-written `static readonly layer` (not `Default`, not `Live`), with variants named `layerConfig`, `layerTest`.

This is *good* for solidifront — it matches what the package already does by hand — but it means the layer-authoring boilerplate is permanent and should be designed deliberately (§5).

### D4. Tags are keyed by **string**, not by identity. Namespace them, and make `effect` a peerDependency.

*Re-confirmed at rc.109.* `Context.make` stores services in a plain `Map` keyed by `key.key`, the string:

```ts
// references/effect/packages/effect/src/Context.ts:724-727
export const make = <I, S>(
  key: Key<I, S>,
  service: Types.NoInfer<S>
): Context<I> => makeUnsafe(new Map([[key.key, service]]))
```

`Context.ts:168` warns: *"The string key is the runtime identity of the service. Reusing the same key string for unrelated services makes them occupy the same slot in a Context."*

Two direct consequences for a library:
1. solidifront's existing `"@solidifront/storefront-client/DefaultHeaders"` style keys are already correct. Keep that discipline across every new package.
2. **`effect` must be a `peerDependency`, never a `dependency`.** Every non-core package in the Effect monorepo does this — `references/effect/packages/opentelemetry/package.json`, `packages/platform/node/package.json`, `packages/vitest/package.json`, `packages/atom/solid/package.json` all declare `"effect": "workspace:^"` under `peerDependencies` and list it again under `devDependencies`. The *published* artifacts confirm the intent resolves correctly: `npm view @effect/atom-solid@rc peerDependencies` returns `{"solid-js": ">=1.9.14 <2.0.0", "effect": "^4.0.0-rc.109"}`. `packages/storefront-client/package.json` currently has `effect` as a plain `dependency` — that is a duplicate-install hazard and must change. `@effect/tsgo` even ships a `duplicatePackage` rule for exactly this failure mode (`node_modules/@effect/tsgo/README.md`, Correctness table).

### D5. OTEL: use the dependency-free core exporter, not `@effect/opentelemetry`, for anything that runs in the browser.

*Re-confirmed at rc.109.* The biggest OTEL finding: v4 **moved the OTLP exporters out of `@effect/opentelemetry` and into core `effect`**, under `effect/unstable/observability/*` (`references/effect/migration/annotations/effect__opentelemetry__Otlp.yaml`, `…OtlpTracer.yaml`, `…OtlpLogger.yaml`, `…OtlpMetrics.yaml`, `…OtlpResource.yaml`). Core `effect`'s dependency list contains **no `@opentelemetry/*` packages at all** — at rc.109 it is exactly `@standard-schema/spec`, `fast-check`, `msgpackr`, with `peerDependencies: null` (`references/effect/packages/effect/package.json`) — and protobuf encoding is hand-rolled (`references/effect/packages/effect/src/unstable/observability/internal/otlpProtobuf.ts`). `packages/opentelemetry/src/` still contains only `NodeSdk`, `WebSdk`, `OtelLogger`, `OtelMetrics`, `OtelTracer`, `Resource` — no `Otlp*`.

So solidifront can have full OTLP tracing on the client with zero OpenTelemetry SDK in the bundle. `references/effect/ai-docs/src/08_observability/index.md` states the guidance directly: *"For exporting telemetry, use the lightweight Otlp modules from `effect/unstable/observability` in new projects, or use `@effect/opentelemetry` NodeSdk when integrating with an existing OpenTelemetry setup."*

Reserve `@effect/opentelemetry` (`NodeSdk`/`WebSdk`) for the server-side case where a consumer already runs the OTel JS SDK and wants auto-instrumentation interop.

### D6. Effect ↔ Solid: first-party prior art exists — and it does not support Solid 2.0.

`references/effect/packages/atom/solid/` is `@effect/atom-solid`, a first-party SolidJS binding shipped in lockstep with `@effect/atom-react` since `4.0.0-beta.0`. It is a working, minimal (three-file) bridge from Effect to fine-grained reactivity, and it is the single best template solidifront has.

But: `references/effect/packages/atom/solid/package.json` declares `"solid-js": ">=1.9.14 <2.0.0"`, and `references/solid/packages/solid/package.json` is `solid-js@2.0.0-rc.0`. **The peer range explicitly excludes the Solid version solidifront is targeting.** The React binding also has two files Solid lacks — `ScopedAtom.ts` and `ReactHydration.ts` — so Solid has no SSR hydration boundary.

*Re-verified at rc.109, and the finding is now stronger than it was.* Diffing `packages/atom/` across beta.106 → rc.109 shows changes to **only** `CHANGELOG.md`, `README.md`, and the version field of `package.json` for all three bindings — **zero source changes**. The peer range is byte-identical, the `src/` file lists are unchanged (Solid still 3 files, React still 5), and the 400 ms `defaultIdleTTL` is still there (`references/effect/packages/atom/solid/src/RegistryContext.ts:71`). The published RC confirms it independently: `npm view @effect/atom-solid@rc peerDependencies` → `{"solid-js": ">=1.9.14 <2.0.0", …}`.

**Is Solid 2.0 support planned?** No signal anywhere. Searched GitHub issues for `solid` and `solid-js 2`, PRs for `atom-solid`, and discussions via GraphQL — nothing. There is no changeset mentioning it (the `.changeset/` grep hits for "solid" are all substring matches inside "con**solid**ate"). The one adjacent datapoint is open issue [#6486 "Add an `@effect/atom-svelte` package"](https://github.com/Effect-TS/effect/issues/6486) (updated 2026-07-18), which shows the binding set does get extended on request — so **filing an issue asking for a Solid 2.0 peer range is a cheap, high-value action** and would resolve this unknown far more cheaply than porting.

This remains the highest-risk unknown in the restructure: the architecture is proven and stable, but the Solid 2.0 port is not written and nobody upstream is writing it.

### D7. Migration is mechanical but large, and there is no codemod.

`references/effect/packages/tools/api-diff` explicitly disclaims being a codemod (its README: it *"compares the consumer-visible TypeScript declarations… does not make semantic-version compatibility claims"*). The RC blog post says migration instructions are designed for *"near-fully automated migration"* **when fed to a coding agent** — i.e. the migration tool is an LLM plus `migration/v3-to-v4.md`, not a script.

`@effect/tsgo`'s `outdatedApi` rule (already installed at the repo root, `@effect/tsgo@0.36.4`) detects v3 APIs removed/renamed in v4 at severity **Warning**, diagnostic codes TS377052/TS377053 ([tsgo docs/rules/outdated-api.md](https://github.com/Effect-TS/tsgo/blob/main/docs/rules/outdated-api.md)). Raise it to error during the migration to get a mechanical worklist.

No v3/v4 in-process interop exists. Nothing in `MIGRATION.md`, `migration/*.md`, or `README.md` describes running both majors side by side; v3 lives on the `v3` branch / `effect@latest`, v4 on `main` / `effect@beta` / `effect@rc`. It's a hard cutover per package.

---

## 1.5. beta.106 → rc.109: what actually changed

Produced by `git diff --name-status -M 60814c2 HEAD` plus export-level diffs of every module solidifront touches. **The RC announcement's "no more broad breaking changes" holds up:** across `packages/effect/src`, exactly one file was deleted and no exported symbol relevant to solidifront was removed or renamed.

### Changes that affect this document

**① `effect/SchemaError` module deleted; `SchemaError` merged into `effect/Schema`.**
The only deletion in `packages/effect/src` between the two commits:
```
D  packages/effect/src/SchemaError.ts
```
`SchemaError` and `isSchemaError` are now declared inside `Schema.ts` (`references/effect/packages/effect/src/Schema.ts:1176` and `:1211`). The diff shows the move precisely:
```diff
-import { isSchemaError, SchemaError } from "./SchemaError.ts"
+export class SchemaError extends Data.TaggedError("SchemaError")<{
+export function isSchemaError(u: unknown): u is SchemaError {
```
`references/effect/packages/effect/src/index.ts` re-exports `SchemaAST`, `SchemaGetter`, `SchemaIssue`, `SchemaParser`, `SchemaRepresentation`, `SchemaTransformation` — but **no `SchemaError`**. Consequence: the §8.1 import row changed from `effect/SchemaError` to `effect/Schema`. Corrected below.

**② Monorepo directory reorganisation: `packages/platform-*` → `packages/platform/*`.**
`packages/platform/{browser,bun,deno,node,node-shared}`. Likewise `packages/ai/{anthropic,openai,openai-compat,openrouter}`. **Published package names are unchanged** (`@effect/platform-node@4.0.0-rc.109` etc., verified from each `package.json`) — this is a repo layout change only, but it invalidates citation paths. All corrected below. Note the top-level `packages/platform/` directory is a *grouping folder*, not a package: **`@effect/platform` still does not exist in v4** (`npm view @effect/platform versions` still ends at `0.97.1`).

**③ Upstream fixed the `migration/schema.md` error this document flagged.**
The first draft's open question #2 called out a row in `migration/schema.md` documenting a `TaggedError` → `TaggedErrorClass` rename that did not exist in the source. Between beta.106 and rc.109 that row was **deleted upstream**:
```diff
-| `TaggedError`  | `TaggedErrorClass`  | rename  |
```
`Schema.TaggedError` remains at `references/effect/packages/effect/src/Schema.ts:14488`; `TaggedErrorClass` still has zero occurrences. The finding was correct and is now resolved — open question #2 is closed.

**④ Additive only, no impact:** `Context.addUnsafe`; `Effect.head` (restored, `.changeset/restore-effect-head.md`); `Effect.fromOption` signature widened; new `effect/unstable/http/HttpStatus` module; MCP `2025-11-25` protocol, MCP icons, `K8sTypes`. `migration/v3-to-v4.md` was regenerated against a newer head (`b938c8ad` → `f4ba735b`); its only content changes are to MCP, cluster `MessageStorage`/`ShardingConfig`, and `Inspectable` rows — none touching solidifront's surface.

### Modules with zero diff between beta.106 and rc.109

`Data.ts`, `Cause.ts`, `References.ts`, `ManagedRuntime.ts`, `Runtime.ts`, `Scope.ts`, `Redacted.ts`, `Config.ts` — byte-identical. Every finding sourced from them carries over unmodified.

### Modules that changed but with **no exported-symbol changes**

`Layer.ts`, `Logger.ts`, `HttpClient.ts`, `FetchHttpClient.ts`, `OtlpTracer.ts`, `Atom.ts`, `Schedule.ts`, `Tracer.ts`, `HttpMiddleware.ts` — export-line diffs are empty; the changes are internals, docs, and the `tracer-perf` optimisation (`.changeset/tracer-perf.md`: *"Improve tracing performance in span creation and HTTP middleware"*).

### Pending unreleased changesets

All eight are `patch`, none breaking: MCP protocol/icons, `Schedule.while` narrowing, PubSub replay normalisation, `Encoding.randomHex`, `Effect.head`, tracer perf, Node socket timeouts.

---

## 2. Release status and versioning

| Fact | Value | Source |
|---|---|---|
| Submodule version | `4.0.0-rc.109` | `references/effect/packages/effect/package.json` |
| Submodule changeset mode | `{"mode": "pre", "tag": "rc"}` | `references/effect/.changeset/pre.json` |
| npm `latest` | `3.22.1` | `npm view effect dist-tags` |
| npm `beta` | `4.0.0-beta.107` (2026-08-10) | `npm view effect time` |
| npm `rc` | `4.0.0-rc.109` (2026-08-14T01:28Z) | `npm view effect time` |
| First RC | `4.0.0-rc.108`, 2026-08-12 | `npm view effect time` |
| Stable target | Q3/Q4 2026 | [40-rc blog post](https://www.effect.website/blog/releases/effect/40-rc) |

**Release cadence:** beta.93 → rc.109 spans 2026-07-01 to 2026-08-14 — roughly every 2–3 days. Through the beta, breaking renames landed continuously; `references/effect/packages/effect/CHANGELOG.md` records e.g. beta.7 *"rename SqlSchema.findOne\* apis"*, *"rename DurationInput to Duration.Input"*; beta.6 *"Extract `Semaphore` and `Latch` into their own modules"*, *"Schema: rename `$` suffix to `$` prefix for type-level identifiers"*. Pre-release mode collapses semver, so these appear as "Patch Changes".

**The RC declaration is the signal that this churn has stopped — and §1.5 is direct evidence for it.** Diffing beta.106 → rc.109 (three releases spanning the beta→RC boundary) turns up exactly one deleted file, zero renamed exports in solidifront's surface, and eight pending `patch` changesets. That is a materially different rate of change from the beta, and it is the strongest single argument for D1.

**Unified versioning:** all ecosystem packages now share one version number and release together (`references/effect/MIGRATION.md:14-20`). `effect@4.0.0-rc.109` pairs with `@effect/opentelemetry@4.0.0-rc.109`, `@effect/platform-browser@4.0.0-rc.109`, `@effect/atom-solid@4.0.0-rc.109` (all verified via `npm view <pkg> dist-tags`, re-checked at rc.109).

**Stability tiers** (`references/effect/MIGRATION.md:40-50`):
- `effect/*` — strict semver.
- `effect/unstable/*` — may break in minor releases. Includes `ai, cli, cluster, devtools, eventlog, http, httpapi, jsonschema, observability, persistence, process, reactivity, rpc, schema, socket, sql, workflow, workers`. Modules graduate to `effect/*` as they stabilise.

**Is it safe for a library to target?** Yes, with the D1 caveat: solidifront's HTTP and observability surfaces are both `unstable/`, so pin `effect` narrowly in the peer range and expect to track minors.

**Bundle size claim** (`references/effect/MIGRATION.md:52-57`): *"a minimal Effect program bundles to ~6.3 KB (minified + gzipped). With Schema, ~15 KB."* `references/effect/packages/effect/package.json` sets `"sideEffects": []`.

---

## 3. The v3 → v4 core delta

`references/effect/MIGRATION.md` indexes eleven focused guides plus a 1.3 MB generated rename map at `references/effect/migration/v3-to-v4.md`. What follows is the subset a library author hits.

### 3.1 Packages consolidated

`@effect/platform`, `@effect/rpc`, `@effect/cluster`, `@effect/cli`, `@effect/ai`, `@effect/experimental` all merged into `effect` (`MIGRATION.md:22-38`). Still separate: `@effect/platform-*`, `@effect/sql-*`, `@effect/ai-*`, `@effect/opentelemetry`, `@effect/atom-*`, `@effect/vitest`.

Import map for what solidifront uses (`references/effect/migration/v3-to-v4.md`, "Import Map" section):

```text
@effect/platform/FetchHttpClient    -> effect/unstable/http/FetchHttpClient
@effect/platform/Headers            -> effect/unstable/http/Headers
@effect/platform/HttpBody           -> effect/unstable/http/HttpBody
@effect/platform/HttpClient         -> effect/unstable/http/HttpClient
@effect/platform/HttpClientError    -> effect/unstable/http/HttpClientError
@effect/platform/HttpClientRequest  -> effect/unstable/http/HttpClientRequest
@effect/platform/HttpClientResponse -> effect/unstable/http/HttpClientResponse
effect/Either                       -> effect/Result
effect/FiberRef                     -> effect/References
effect/ParseResult                  -> effect/SchemaIssue  (issue types)
effect/ParseResult                  -> effect/SchemaParser  (parse fns)
effect/JSONSchema                   -> effect/JsonSchema
```

### 3.2 Services: `Context.Tag` → `Context.Service`

`references/effect/migration/services.md`:

| v3 | v4 |
|---|---|
| `Context.GenericTag<Database>("Database")` | `Context.Service<Database>("Database")` |
| `class D extends Context.Tag("D")<D, Shape>() {}` | `class D extends Context.Service<D, Shape>()("D") {}` |
| `Effect.Tag` static accessors (`Notifications.notify(x)`) | `Notifications.use((n) => n.notify(x))` |
| `Effect.Service` with `dependencies` → `.Default` | `Context.Service` with `make` + hand-written `static layer` |
| `Context.Reference<Self>()(id, opts)` | `Context.Reference<Shape>(id, { defaultValue })` |
| `Context.isTag` | `Context.isKey` |
| `Context.unsafeGet` / `unsafeMake` | `Context.getUnsafe` / `makeUnsafe` |

Note the argument-order flip: type params first via `Context.Service<Self, Shape>()`, then the id string to the returned constructor.

The `Service` interface (`references/effect/packages/effect/src/Context.ts:98-103`) adds `of`, `context`, `use`, `useSync`. `services.md` recommends preferring `yield*` over `use`, because `use` can silently leak dependencies.

Canonical form, verbatim from `references/effect/ai-docs/src/01_effect/03_services/01_service.ts`:

```ts
import { Context, Effect, Layer, Schema } from "effect"

export class Database extends Context.Service<Database, {
  query(sql: string): Effect.Effect<Array<unknown>, DatabaseError>
}>()(
  "myapp/db/Database"
) {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function*() {
      const query = Effect.fn("Database.query")(function*(sql: string) {
        yield* Effect.log("Executing SQL query:", sql)
        return [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
      })

      return Database.of({ query })
    })
  )
}

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect()
}) {}

// If you ever need to access the service type, use `Database["Service"]`
export type DatabaseService = Database["Service"]
```

The identifier convention from that file's comments: *"should include the package name and the subdirectory path to the service file"* — `"myapp/db/Database"`.

### 3.3 Layer

Survives, with renames (`references/effect/migration/v3-to-v4.md`, `effect/Layer` section):

| v3 | v4 |
|---|---|
| `Layer.scoped` | `Layer.effect` — *"Scoped acquisition was merged into Layer.effect, which supplies and excludes the layer Scope"* |
| `Layer.scopedContext` | `Layer.effectContext` |
| `Layer.scopedDiscard` | `Layer.effectDiscard` |
| `Layer.catchAll` / `catchAllCause` | `Layer.catch` / `Layer.catchCause` |
| `Layer.unwrapEffect` / `unwrapScoped` | `Layer.unwrap` (merged) |
| `Layer.memoize` | automatic — see below |
| `Layer.toRuntime` | `Layer.build`, then `Effect.runForkWith` / `runPromiseWith` / `runSyncWith` |
| `Layer.minimumLogLevel`-style `Layer.locallyScoped` | `Layer.succeed(reference, value)` |
| `Layer.setTracer` | `Layer.succeed(Tracer.Tracer, tracer)` |
| `Layer.Layer.Context` | `Layer.Services<T>` |
| `Layer.ensureRequirementsType` | `Layer.satisfiesServicesType` |

Confirmed against source: `Layer.effect`, `Layer.succeed`, `Layer.mergeAll`, `Layer.provide`, `Layer.provideMerge`, `Layer.unwrap`, `Layer.fresh`, `Layer.MemoMap`, `Layer.makeMemoMap`, `Layer.makeMemoMapUnsafe`, `Layer.buildWithMemoMap`, `Layer.CurrentMemoMap` all exist in `references/effect/packages/effect/src/Layer.ts`. `Layer.scoped` does **not**.

**Memoization changed semantics** (`references/effect/migration/layer-memoization.md`): in v3 each `Effect.provide` call got its own memo scope, so the same layer provided twice built twice. In v4 the MemoMap is shared across `Effect.provide` calls on the same fiber, so it builds once. Opt out with `Layer.fresh(layer)` or `Effect.provide(layer, { local: true })`.

### 3.4 Runtime: `Runtime<R>` is gone

`references/effect/migration/runtime.md`: *"In v4, this type no longer exists… Run functions live directly on `Effect`, and the `Runtime` module is reduced to process lifecycle utilities."*

| v3 | v4 |
|---|---|
| `Effect.runtime<R>()` then `Runtime.runFork(rt)(p)` | `Effect.context<R>()` then `Effect.runForkWith(ctx)(p)` |
| `Runtime.runPromise` / `runSync` / `runCallback` | `Effect.runPromiseWith` / `runSyncWith` / `runCallbackWith` |
| `Runtime.Runtime` | `Context.Context` |
| `Runtime.FiberFailure` | **removed** — use an `Exit`-returning runner and inspect the `Cause` |
| `Runtime.isFiberFailure` | **removed** |
| `Runtime.AsyncFiberException` | `Cause.AsyncFiberError` |
| `Runtime.make` | `Context.make` |
| `Runtime.setFiberRef` / `deleteFiberRef` | `Context.add` / `Context.omit` |

`ManagedRuntime` survives but is no longer an `Effect`: `runtimeEffect`/`runtime` became `contextEffect`/`context`, `ManagedRuntime.Context` became `ManagedRuntime.Services<T>`, and `make` takes `{ memoMap }` as an **options object** rather than a positional arg (`references/effect/migration/v3-to-v4.md`, `effect/ManagedRuntime`; interface at `references/effect/packages/effect/src/ManagedRuntime.ts:112-228`).

### 3.5 Error model

**`catch*` renames** (`references/effect/migration/error-handling.md`):

| v3 | v4 |
|---|---|
| `Effect.catchAll` | `Effect.catch` |
| `Effect.catchAllCause` | `Effect.catchCause` |
| `Effect.catchAllDefect` | `Effect.catchDefect` |
| `Effect.catchSome` | `Effect.catchFilter` (takes a `Filter`, not `Option`) |
| `Effect.catchSomeCause` | `Effect.catchCauseFilter` |
| `Effect.catchSomeDefect` | **removed** |
| `Effect.catchTag` / `catchTags` / `catchIf` | unchanged |
| `Effect.filterOrDie` | `Effect.filterOrFail` + `Effect.orDie` |

New: `Effect.catchReason(errorTag, reasonTag, handler)`, `Effect.catchReasons`, `Effect.catchEager`. Confirmed in `references/effect/packages/effect/src/Effect.ts`: `catch` at ~2634 (exported as `export { catch_ as catch }`), `catchCause` 3199, `catchFilter` 3359, `catchReason` 2896, `catchEager` 15303. `catchAll` and `filterOrDie` return **zero** grep hits.

**`Cause` is flattened** (`references/effect/migration/cause.md`). v3's recursive `Empty | Fail | Die | Interrupt | Sequential | Parallel` tree becomes `{ reasons: ReadonlyArray<Reason<E>> }` with `Reason = Fail | Die | Interrupt`. Composition is array concatenation via `Cause.combine`.

| v3 | v4 |
|---|---|
| `Cause.isDie` | `Cause.hasDies` |
| `Cause.isFailure` | `Cause.hasFails` |
| `Cause.isInterrupted` | `Cause.hasInterrupts` |
| `Cause.isDieType(cause)` | `Cause.isDieReason(reason)` |
| `Cause.defects` | `self.reasons.filter(Cause.isDieReason).map(r => r.defect)` (plain array, not `Chunk`) |
| `Cause.failureOption` | `Cause.findErrorOption` |
| `Cause.sequential` / `parallel` | `Cause.combine` |
| `NoSuchElementException` etc. | `NoSuchElementError` etc. (`*Exception` → `*Error` across the board) |
| `RuntimeException`, `InterruptedException` | **removed** |

**Tagged errors.** Two primitives, both alive:
- `Data.TaggedError("Tag")<{...}>` — plain in-process discriminated failure, no payload validation. Used by core for `HttpClientError` (`references/effect/packages/effect/src/unstable/http/HttpClientError.ts:34`, alongside `TransportError:91` and `EncodeError:121`) and for `SchemaError` itself (`references/effect/packages/effect/src/Schema.ts:1176`).
- `Schema.TaggedError<Self>(identifier?)(tag, fields)` — schema-validated, yieldable, tagged. Used by `references/effect/packages/effect/src/unstable/sql/SqlError.ts:31`, which supplies a namespaced identifier and a short tag: `Schema.TaggedError<ConnectionError>("effect/sql/SqlError/ConnectionError")("ConnectionError", ReasonFields)`.

> ✅ **Resolved upstream.** The first draft flagged that `references/effect/migration/schema.md:34` claimed a `TaggedError` → `TaggedErrorClass` rename that did not exist in the source. Between beta.106 and rc.109 the Effect maintainers **deleted that row** from `migration/schema.md` (§1.5③). At rc.109 `Schema.TaggedError` is at `references/effect/packages/effect/src/Schema.ts:14488` and `TaggedErrorClass` still has zero occurrences anywhere in `packages/effect/src/`. The guide and the source now agree.

**`Data` losses** (`references/effect/migration/v3-to-v4.md`, `effect/Data`): `Data.case`, `Data.struct`, `Data.array`, `Data.tuple`, `Data.unsafeStruct`, `Data.unsafeArray` all → `none`. Rationale: *"plain objects are structurally equal in v4."* `Data.Class`, `Data.TaggedClass`, `Data.TaggedError`, `Data.TaggedEnum` survive. `Data.Structural` → `Data.Class`.

**Equality changed** (`references/effect/migration/equality.md`): `Equal.equals({a:1},{a:1})` was `false` in v3, is `true` in v4 — structural by default for plain objects, arrays, `Map`, `Set`, `Date`, `RegExp`. `Equal.equals(NaN, NaN)` flips `false` → `true`. Opt out with `Equal.byReference`. `Equal.equivalence<T>()` → `Equal.asEquivalence<T>()`.

### 3.6 `FiberRef` removed

`references/effect/migration/fiberref.md`: `FiberRef`, `FiberRefs`, `FiberRefsPatch`, and `Differ` are all gone. Fiber-local state is `Context.Reference`.

| v3 | v4 |
|---|---|
| `FiberRef.currentMinimumLogLevel` | `References.MinimumLogLevel` |
| `FiberRef.currentLogLevel` | `References.CurrentLogLevel` |
| `FiberRef.currentLogAnnotations` | `References.CurrentLogAnnotations` |
| `FiberRef.currentLogSpan` | `References.CurrentLogSpans` |
| `FiberRef.currentTracerEnabled` | `References.TracerEnabled` |
| `FiberRef.get(ref)` | `yield* References.X` (References are `Yieldable`) |
| `Effect.locally(e, ref, v)` / `FiberRef.set` | `Effect.provideService(e, References.X, v)` |
| `FiberRef.currentConcurrency` | **removed** — pass concurrency explicitly |

### 3.7 Other core changes worth knowing

- **Yieldable, not subtyping** (`migration/yieldable.md`): `Ref`, `Deferred`, `Fiber` are no longer `Effect` subtypes. `Ref` → `Ref.get(ref)`, `Deferred` → `Deferred.await(d)`, `Fiber` → `Fiber.join(f)`. Still yieldable: `Effect`, `Option`, `Result`, `Config`, `Context.Service`. Passing a `Yieldable` to a combinator now needs `.asEffect()`.
- **Generators** (`migration/generators.md`): `Effect.gen(this, function*(){})` → `Effect.gen({ self: this }, function*(){})`.
- **Forking** (`migration/forking.md`): `Effect.fork` → `Effect.forkChild`, `Effect.forkDaemon` → `Effect.forkDetach`. `forkAll` and `forkWithErrorHandler` removed. All variants take `{ startImmediately?, uninterruptible? }`.
- **Scope** (`migration/scope.md`): only change is `Scope.extend` → `Scope.provide`. `Scope.CloseableScope` → `Scope.Closeable`.
- **Fiber keep-alive** (`migration/fiber-keep-alive.md`): the core runtime now keeps the Node process alive while a fiber suspends. `runMain` is still recommended for signal handling and exit codes but is no longer strictly required.
- **`Either` → `Result`**: `effect/Either -> effect/Result`.
- **Transactional modules renamed**: `TRef` → `TxRef`, `TMap` → `TxHashMap`, `TSet` → `TxHashSet`, etc.

---

## 4. Schema in v4

### Where it lives

Contradiction resolved: `MIGRATION.md:47` lists `schema` among unstable modules, but the import map says `effect/Schema -> effect/Schema (barrel: effect)`. Both are true, of different things.

- **`effect/Schema`** is stable core: `references/effect/packages/effect/src/Schema.ts`, with siblings `SchemaAST.ts`, `SchemaGetter.ts`, `SchemaIssue.ts`, `SchemaParser.ts`, `SchemaRepresentation.ts`, `SchemaTransformation.ts`. All top-level, all re-exported from the `effect` barrel (`references/effect/packages/effect/src/index.ts:527-552`). At beta.106 there was also a `SchemaError.ts` sibling; at rc.109 it is gone and its contents live in `Schema.ts` (§1.5①).
- **`effect/unstable/schema`** is a *different* module containing only `Model.ts` and `VariantSchema.ts` — schema-variant helpers for DB-shaped select/insert/update derivation (`references/effect/packages/effect/src/unstable/schema/index.ts:9-14`).

The MIGRATION.md "unstable" entry refers to the latter. Core Schema is stable.

### Delta (`references/effect/migration/schema.md`, 1096 lines)

The renames that hit solidifront's `src/schemas.ts` are in §8.4. The structural changes:

- **Decode/encode family renamed:** `decodeUnknown` → `decodeUnknownEffect`, `decode` → `decodeEffect`, `decodeUnknownEither` → `decodeUnknownExit`, `decodeEither` → `decodeExit`, and encode counterparts. Sync/promise variants keep their names.
- **`validate*` removed** — use `decodeEffect(Schema.toType(schema))`.
- **`ParseError` → `SchemaError`.** ⚠️ **Changed between beta.106 and rc.109** (§1.5①): the standalone `effect/SchemaError` module was deleted and the class now lives in `effect/Schema` itself, as `Schema.SchemaError` (`references/effect/packages/effect/src/Schema.ts:1176`):
  ```ts
  export class SchemaError extends Data.TaggedError("SchemaError")<{
    readonly issue: SchemaIssue.Issue
  }> {
    readonly [SchemaErrorTypeId]: typeof SchemaErrorTypeId = SchemaErrorTypeId
    override get message() { return SchemaIssue.defaultFormatter(this.issue) }
  }
  ```
  Import it from `effect/Schema` (or the `effect` barrel), **not** `effect/SchemaError` — that module no longer exists and `index.ts` does not re-export the name. Guard: `Schema.isSchemaError` (`Schema.ts:1211`). Formatters: `SchemaIssue.defaultFormatter(issue)` replaces `TreeFormatter`; `SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues` replaces `ArrayFormatter` — `effect/SchemaIssue` is still its own module and is still re-exported from `index.ts:537`.
- **Variadic → array:** `Literal("a","b")` → `Literals(["a","b"])`, `Union(A,B)` → `Union([A,B])`, `Tuple(A,B)` → `Tuple([A,B])`, `TemplateLiteral(A,B)` → `TemplateLiteral([A,B])`. `Record({key,value})` → `Record(key, value)`.
- **`annotations` → `annotate`.**
- **Filters get an `is` prefix and go through `check`:** `filter(pred)` → `check(makeFilter(pred))`; `filter(refinement)` → `refine(refinement)`; `minLength` → `isMinLength`, `startsWith` → `isStartsWith`, `pattern` → `isPattern`, `int` → `isInt`, `greaterThan` → `isGreaterThan`. `positive`/`negative`/`nonNegative`/`nonPositive` **removed**.
- **Struct surgery moves to `mapFields`:** `pick` → `mapFields(Struct.pick([keys]))`, `omit` → `mapFields(Struct.omit([keys]))`, `partial` → `mapFields(Struct.map(Schema.optional))`, `extend` → `mapFields(Struct.assign(fields))` or `Schema.fieldsAssign`.
- **Transformations restructured:** `transform(from,to,{decode,encode})` → `from.pipe(Schema.decodeTo(to, SchemaTransformation.transform({decode,encode})))`. `transformOrFail` → `Schema.decodeTo(to, { decode: SchemaGetter.transformOrFail(...), encode: ... })`, failing with `SchemaIssue.InvalidValue()`.
- **`optionalWith` fans out** into `optional` / `optionalKey` / `withDecodingDefaultType` / `NullOr` + `Option.filter` + `Option.orElseSome` depending on which v3 options were used (`schema.md:507-624`).
- **Silent behavioural traps.** *Both re-verified at rc.109 against the source, not just the migration guide — these are the most dangerous items in this document, so here is the primary evidence.*

  **`Schema.Date`.** In v3 it decoded ISO strings. In v4 it is a `declare` whose guard requires an actual `Date` instance (`references/effect/packages/effect/src/Schema.ts:11865`):
  ```ts
  export const Date: Date = declare(
    (input): input is globalThis.Date =>
      input instanceof globalThis.Date && !globalThis.Number.isNaN(input.getTime()),
  ```
  String→Date is now `Schema.DateFromString` (`Schema.ts:11942`), whose doc says *"A `Date` is encoded as an ISO string. Invalid date strings fail decoding."* Presence check confirms: `Date` ✅, `DateFromString` ✅, `DateFromSelf` ✗ (removed). Swapping one for the other still type-checks at the schema-construction site.

  **`Schema.Redacted`.** v4 `Schema.Redacted` expects the input to already be a `Redacted` instance; the v3 "wrap a decoded raw value" behaviour is now `Schema.RedactedFromValue`. The source says so explicitly (`Schema.ts:10215-10217`):
  > *"Decodes a value and wraps it in `Redacted<A>`. Unlike {@link Redacted} which expects the input to already be a `Redacted` instance, this schema decodes the raw value and wraps it."*

  Presence check: `Redacted` ✅ (`Schema.ts:10095`), `RedactedFromValue` ✅ (`Schema.ts:10222`), `RedactedFromSelf` ✗ (removed). This one matters directly for solidifront — `src/schemas.ts` uses `S.Redacted` for the Storefront private access token, and getting it wrong means the token schema silently stops accepting the raw string it is fed today.
- **`*FromSelf` suffix dropped:** `DateFromSelf`→`Date`, `OptionFromSelf`→`Option`, `ChunkFromSelf`→`Chunk`, etc. `EitherFromSelf`→`Result`.
- **`asSchema` → `revealCodec`**, `typeSchema` → `toType`, `encodedSchema` → `toEncoded`, `compose` → `decodeTo`, `Schema.Enums` → `Schema.Enum`, `Schema.Object` → `Schema.ObjectKeyword`, `Schema.Data` removed (deep structural equality is now default).

### Decoding GraphQL responses

Idiomatic form, verbatim from `references/effect/ai-docs/src/50_http-client/10_basics.ts`:

```ts
import { Context, Effect, flow, Layer, Schedule, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"

class Todo extends Schema.Class<Todo>("Todo")({
  userId: Schema.Int,
  id: Schema.Int,
  title: Schema.String,
  completed: Schema.Boolean
}) {}

const allTodos = client.get("/todos").pipe(
  Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(Todo))),
  Effect.mapError((cause) => new JsonPlaceholderError({ cause })),
  Effect.withSpan("JsonPlaceholder.allTodos")
)

export class JsonPlaceholderError extends Schema.TaggedError<JsonPlaceholderError>()("JsonPlaceholderError", {
  cause: Schema.Defect()
}) {}
```

`HttpClientResponse.schemaBodyJson` **keeps its name** — only the module path moved. Actual definition lives in `HttpIncomingMessage.ts` and is re-exported by `HttpClientResponse.ts:33-50`. Verbatim at rc.109:

```ts
// references/effect/packages/effect/src/unstable/http/HttpIncomingMessage.ts:64-70
export const schemaBodyJson = <S extends Schema.Constraint>(schema: S, options?: ParseOptions | undefined) => {
  const decode = Schema.decodeEffect(Schema.toCodecJson(schema))
  return <E>(
    self: HttpIncomingMessage<E>
  ): Effect.Effect<S["Type"], E | Schema.SchemaError, S["DecodingServices"]> =>
    Effect.flatMap(self.json, (u) => decode(u, options))
}
```

Note the error channel names `Schema.SchemaError` — consistent with the module move in §1.5①.

Siblings: `schemaJson` (decodes status + headers + body together, `HttpClientResponse.ts:89`) and `schemaNoBody` (`:119`) are declared on `HttpClientResponse` itself; `schemaBodyJson`, `schemaBodyUrlParams`, and `schemaHeaders` are re-exported from `HttpIncomingMessage`.

For solidifront specifically: the existing `GraphQLJsonBody` schema pattern (`{ data?, errors?, extensions? }`) transfers directly. The change is `Schema.Struct` field syntax touch-ups and `ParseError` → `SchemaError` in every signature.

### GraphQL codegen story: **there is none**

Case-insensitive grep for `graphql` across `references/effect/packages` and `references/effect/ai-docs` yields exactly two hits, both incidental:
1. `references/effect/packages/effect/src/unstable/httpapi/internal/httpApiScalar.ts` — a vendored minified Scalar API-reference viewer bundle; "graphql" appears in its syntax-highlighting language list.
2. `references/effect/cookbooks/schedule.md:420-444` — a retry example that happens to name its error type `GraphqlGatewayError`.

**No GraphQL client, no schema derivation, no codegen anywhere in the Effect v4 repo.** solidifront's `packages/codegen` and the `@shopify/api-codegen-preset` pipeline remain entirely solidifront's problem.

### Adjacent codegen facilities that do exist

- **Schema → JSON Schema (export only):** `Schema.toJsonSchemaDocument(schema, options?)` (`references/effect/packages/effect/src/Schema.ts:14888`), `Schema.toStandardJSONSchemaV1` (`Schema.ts:1349`). The doc comment warns generation is *"best-effort… importing an emitted JSON Schema may produce an equivalent approximation rather than the original schema shape."*
- **`effect/JsonSchema`** is a dialect converter (draft-07 ⇄ draft-2020-12 ⇄ OpenAPI 3.0/3.1), not a schema builder. `fromJsonSchema` has **zero** grep hits — there is no JSON-Schema → Schema importer.
- **No "derive Schema from TS type" tool** in the repo. But `@effect/tsgo` ships editor refactors `typeToEffectSchema`, `typeToEffectSchemaClass`, and `structuralTypeToSchema` (`node_modules/@effect/tsgo/README.md`, Refactor Status table, all ✅ for V4) — that is an IDE-assisted, not build-time, path from a generated Shopify type to a `Schema.Struct`.

**Practical read for solidifront:** Shopify's codegen already emits TS types for every operation. Effect v4 offers no way to turn those into runtime schemas automatically. Either keep the current approach (types-only for operation shape, one hand-written `GraphQLJsonBody` schema for the envelope), or build a codegen step that emits Schemas — solidifront-owned either way.

---

## 5. Designing a library whose public API *is* services and layers

This is the load-bearing design question, so it gets the exemplars in full.

### 5.1 The recurring shape in Effect's own packages

Three layers, consistently:

**(a) Abstract service module** — interface + tag + generic combinators, no implementation, no default layer.

```ts
// references/effect/packages/effect/src/unstable/http/HttpClient.ts:150-152
export const HttpClient: Context.Service<HttpClient, HttpClient> = Context.Service<HttpClient, HttpClient>(
  "effect/HttpClient"
)
```
```ts
// references/effect/packages/effect/src/unstable/sql/SqlClient.ts:94
export const SqlClient = Context.Service<SqlClient>("effect/sql/SqlClient")
```

**(b) Implementation module** — a `make` Effect whose `R` is the service's *own* dependencies, plus `layer*` exports that seal those dependencies away.

```ts
// references/effect/packages/effect/src/unstable/http/FetchHttpClient.ts
export const Fetch = Context.Reference<typeof globalThis.fetch>("effect/http/FetchHttpClient/Fetch", {
  defaultValue: () => globalThis.fetch
})

export class RequestInit extends Context.Service<RequestInit, globalThis.RequestInit>()(
  "effect/http/FetchHttpClient/RequestInit"
) {}

const fetch: HttpClient.HttpClient = HttpClient.make((request, url, signal, fiber) => { /* … */ })

export const layer: Layer.Layer<HttpClient.HttpClient> = HttpClient.layerMergedContext(Effect.succeed(fetch))
```

**(c) The `layerFrom` / `layer` / `layerConfig` triad** — the fullest exemplar, `references/effect/packages/sql/pg/src/PgClient.ts:97,149,795-829`:

```ts
export const PgClient = Context.Service<PgClient>("@effect/sql-pg/PgClient")

export const make = (options: PgPoolConfig): Effect.Effect<PgClient, SqlError, Scope.Scope | Reactivity.Reactivity> =>
  fromPool({ ...options, acquire: Effect.gen(function*() { /* … */ }) })

export const layerFrom = <E, R>(
  acquire: Effect.Effect<PgClient, E, R>
): Layer.Layer<PgClient | Client.SqlClient, E, Exclude<R, Scope.Scope | Reactivity.Reactivity>> =>
  Layer.effectContext(
    Effect.map(acquire, (client) =>
      Context.make(PgClient, client).pipe(
        Context.add(Client.SqlClient, client)
      ))
  ).pipe(Layer.provide(Reactivity.layer))   // own dependency wired in, dropped from RIn

export const layerConfig: (config: Config.Wrap<PgPoolConfig>) =>
  Layer.Layer<PgClient | Client.SqlClient, Config.ConfigError | SqlError> = (config) =>
    layerFrom(Effect.flatMap(Config.unwrap(config), make))

export const layer = (config: PgPoolConfig): Layer.Layer<PgClient | Client.SqlClient, SqlError> =>
  layerFrom(make(config))
```

Read the types carefully: `make`'s `R` is `Scope | Reactivity`; `layerFrom` `Exclude`s both. `Scope` vanishes because `Layer.effectContext` runs acquire inside the layer's own build scope; `Reactivity` vanishes because of the `Layer.provide(Reactivity.layer)`. **The consumer sees `RIn = never`.** That is the target shape for every solidifront layer.

Summary table:

| Element | Convention |
|---|---|
| Tag | `Context.Service<Shape>("pkg/Module")` or `class X extends Context.Service<X, Shape>()("pkg/Module") {}` |
| Constructor | `make(options): Effect<Shape, E, OwnDeps>` — deps visible here |
| Primary layer | `layer(config): Layer<Shape, E>` — deps sealed via `Layer.provide` |
| Env-driven variant | `layerConfig(Config.Wrap<Options>): Layer<Shape, E \| ConfigError>` |
| Advanced escape hatch | `layerFrom(acquire): Layer<Shape, E, Exclude<R, InternalDeps>>` |
| Overridable knob with a default | `Context.Reference` (not `Context.Service`) |

### 5.2 The batteries-included bundle layer

`references/effect/packages/platform/node/src/NodeServices.ts:32-48` is the v4 equivalent of v3's `NodeContext.layer` (note: there is **no** `NodeContext.ts` on this branch). Re-confirmed verbatim at rc.109; only the repo path changed (§1.5②):

```ts
export type NodeServices = ChildProcessSpawner | Crypto | FileSystem | Path | Stdio | Terminal

export const layer: Layer.Layer<NodeServices> = Layer.provideMerge(
  NodeChildProcessSpawner.layer,
  Layer.mergeAll(
    NodeFileSystem.layer,
    NodeCrypto.layer,
    NodePath.layer,
    NodeStdio.layer,
    NodeTerminal.layer
  )
)
```

Pattern: independent services combined with `Layer.mergeAll`; anything depending on them layered over with `Layer.provideMerge` so its dependency stays exposed. **This is exactly what solidifront should export** — a `Solidifront.layer` (or per-package `StorefrontClient.layer`) the app root provides once.

`Layer.provide` vs `Layer.provideMerge`, from the source docs (`references/effect/packages/effect/src/Layer.ts:1432-1462`, `:1550-1585`): *"Prefer `provide` when the dependency should stay private"* — result exposes only the dependent's services. `provideMerge` exposes `ROut | ROut2` — *"Use when you need to compose Layers while keeping both the constructed service and the dependency used to build it available."*

Consumer-facing rule for solidifront: use `provide` for internals (`DefaultHeaders`, `GraphQLOperation`), `provideMerge` only for things a consumer legitimately needs to reach (e.g. exposing `HttpClient` so they can swap it).

### 5.3 The non-Effect escape hatch

There is **no** "promise-flavored second entrypoint" convention in the Effect ecosystem. Every `package.json` exports map inspected (`opentelemetry`, `platform/node`, `vitest`, `sql/pg`, `atom/solid`) is a single flat surface:

```json
"exports": {
  "./package.json": "./package.json",
  ".": "./src/index.ts",
  "./*": "./src/*.ts",
  "./internal/*": null,
  "./index": null,
  "./*/index": null
}
```

with `publishConfig.exports` remapping to `./dist/…`. The escape hatch is `ManagedRuntime`, in the *same* module.

Canonical worked example, verbatim from `references/effect/ai-docs/src/04_integration/10_managed-runtime.ts`:

```ts
export class TodoRepo extends Context.Service<TodoRepo, {
  readonly getAll: Effect.Effect<ReadonlyArray<Todo>>
  getById(id: number): Effect.Effect<Todo, TodoNotFound>
  create(payload: CreateTodoPayload): Effect.Effect<Todo>
}>()("app/TodoRepo") {
  static readonly layer = Layer.effect(TodoRepo, Effect.gen(function*() { /* … */ return TodoRepo.of({ /* … */ }) }))
}

// Create a global memo map that can be shared across the app. This is necessary
// for memoization to work correctly across ManagedRuntime instances.
export const appMemoMap = Layer.makeMemoMapUnsafe()

export const runtime = ManagedRuntime.make(TodoRepo.layer, { memoMap: appMemoMap })

export const app = new Hono()

app.get("/todos", async (context) => {
  const todos = await runtime.runPromise(TodoRepo.use((repo) => repo.getAll))
  return context.json(todos)
})

const shutdown = () => { void runtime.dispose() }
process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
```

The file's own comment generalises: *"The same bridge pattern works for Express, Fastify, Koa, and other frameworks. Use `runtime.runSync` for synchronous edges or `runtime.runCallback` for callback-only APIs."*

`references/effect/ai-docs/src/04_integration/index.md`: *"`ManagedRuntime` bridges Effect programs with non-Effect code. Build one runtime from your application Layer, then use it anywhere you need imperative execution, like web handlers, framework hooks, worker queues, or legacy callback APIs."*

**Recommended shape for solidifront's dual surface:** keep the current split (`@solidifront/storefront-client` = promise API, `@solidifront/storefront-client/effect` = Effect API) but rebuild the promise side on `ManagedRuntime` rather than the hand-rolled `Scope.make` + `Layer.buildWithMemoMap` + `Effect.runPromise` triple currently in `src/index.ts` (§8.5). `ManagedRuntime` gives disposal, caching, and `Symbol.asyncDispose` for free.

### 5.4 Public tagged errors

Both primitives are legitimate; the split observed in core:

- `Data.TaggedError("ShortTag")<{...}>` when the error is a pure in-process discriminant (core uses this for `HttpClientError`).
- `Schema.TaggedError<Self>("namespaced/identifier")("ShortTag", fields)` when the error crosses a schema boundary or must be encodable (core uses this for `SqlError`).

Note the two-string design (`references/effect/packages/effect/src/Schema.ts:14469-14503`): the **identifier** needs global uniqueness (schema AST identity), the **tag** just needs to be a good discriminant for `Effect.catchTag`. `SqlError` namespaces the identifier and keeps the tag short. That is the pattern to copy — solidifront's current tags like `"@solidifront/storefront-client/InContextError"` put the namespace in the *tag*, which makes consumer `catchTag` calls verbose.

---

## 6. OpenTelemetry in v4

### 6.1 Two exporters, one important distinction

| | `effect/unstable/observability/*` | `@effect/opentelemetry` |
|---|---|---|
| Where | Core `effect` package | Separate package |
| `@opentelemetry/*` deps | **none** | 9 optional peer deps |
| Protobuf | hand-rolled (`internal/otlpProtobuf.ts`) | via OTel SDK |
| Modules | `Otlp`, `OtlpTracer`, `OtlpLogger`, `OtlpMetrics`, `OtlpExporter`, `OtlpResource`, `OtlpSerialization`, `PrometheusMetrics` | `NodeSdk`, `WebSdk`, `OtelTracer`, `OtelLogger`, `OtelMetrics`, `Resource` |
| Use when | New projects; browser; anywhere bundle size matters | Interop with an existing OTel JS SDK setup / auto-instrumentation |

In v3 the `Otlp*` modules lived in `@effect/opentelemetry`; v4 moved them into core (`references/effect/migration/annotations/effect__opentelemetry__Otlp.yaml` and siblings). Verified: `references/effect/packages/effect/package.json` `dependencies` are only `@standard-schema/spec`, `fast-check`, `kubernetes-types`, `msgpackr`, `uuid`; `peerDependencies` is null.

Also renamed inside `@effect/opentelemetry`: module `Tracer` → `OtelTracer`, `Logger` → `OtelLogger`, `Metrics` → `OtelMetrics`; `OtlpResource.unsafeServiceName` → `serviceNameUnsafe`; `Logger.layerLoggerAdd`/`layerLoggerReplace` collapse into `OtelLogger.layer({ mergeWithExisting })`.

### 6.2 Wiring — verbatim from `references/effect/ai-docs/src/08_observability/20_otlp-tracing.ts`

```ts
import { NodeRuntime } from "@effect/platform-node"
import { Context, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { OtlpLogger, OtlpSerialization, OtlpTracer } from "effect/unstable/observability"

export const OtlpTracingLayer = OtlpTracer.layer({
  url: "http://localhost:4318/v1/traces",
  resource: {
    serviceName: "checkout-api",
    serviceVersion: "1.0.0",
    attributes: { "deployment.environment": "staging" }
  }
})

export const OtlpLoggingLayer = OtlpLogger.layer({
  url: "http://localhost:4318/v1/logs",
  resource: { serviceName: "checkout-api", serviceVersion: "1.0.0" }
})

// Reusable app-wide observability layer.
// - OtlpTracer/OtlpLogger require an OTLP serializer and an HttpClient.
// - FetchHttpClient.layer provides the HttpClient used by the exporter.
export const ObservabilityLayer = Layer.merge(OtlpTracingLayer, OtlpLoggingLayer).pipe(
  Layer.provide(OtlpSerialization.layerJson),
  Layer.provide(FetchHttpClient.layer)
)

export class Checkout extends Context.Service<Checkout, {
  processCheckout(orderId: string): Effect.Effect<void>
}>()("acme/Checkout") {
  static readonly layer = Layer.effect(
    Checkout,
    Effect.gen(function*() {
      return Checkout.of({
        processCheckout: Effect.fn("Checkout.processCheckout")(function*(orderId: string) {
          yield* Effect.sleep("50 millis").pipe(
            Effect.withSpan("checkout.charge-card"),
            Effect.annotateSpans({ "checkout.order_id": orderId, "checkout.provider": "acme-pay" })
          )
        })
      })
    })
  )
}

const Main = CheckoutTest.pipe(
  // Provide the observability layer at the very end, so that all spans created
  // by the app are exported.
  Layer.provide(ObservabilityLayer)
)

Layer.launch(Main).pipe(NodeRuntime.runMain)
```

Three patterns worth lifting: `Effect.fn("Name")(function*(){})` gives an automatic span; `Layer.withSpan(name)` traces layer *construction*; and the observability layer is provided **outermost/last**.

Key signature (`references/effect/packages/effect/src/unstable/observability/OtlpTracer.ts`):

```ts
export const layer: (options: {
  readonly url: string
  readonly resource?: { serviceName?: string; serviceVersion?: string; attributes?: Record<string, unknown> }
  readonly headers?: Headers.Input
  readonly exportInterval?: Duration.Input      // default 5s
  readonly maxBatchSize?: number                // default 1000
  readonly shutdownTimeout?: Duration.Input     // default 3s
}) => Layer.Layer<Exporter.Flusher, never, OtlpSerialization | HttpClient.HttpClient>

export const layerFromConfig: (options?) => Layer.Layer<Exporter.Flusher, never, HttpClient.HttpClient | OtlpSerialization>
```

`layerFromConfig` reads `OTEL_SDK_DISABLED`, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_TIMEOUT`, `OTEL_BSP_*`. `Otlp.layerJson` / `Otlp.layerProtobuf` bundle logs + metrics + traces against a single `baseUrl` and post to `/v1/logs`, `/v1/metrics`, `/v1/traces`.

`OtlpExporter` (`references/effect/packages/effect/src/unstable/observability/OtlpExporter.ts:163-267`) does batching, `retryTransient` with `retry-after`-aware backoff, and self-disables for 60s after unhandled export failures. `Exporter.Flusher.flush` drains all registered exporters — call before shutdown.

### 6.3 Core tracing API

`references/effect/packages/effect/src/Effect.ts:7824-8355`:

```ts
export const withSpan: {
  <Args extends ReadonlyArray<any>>(
    name: string,
    options?: SpanOptionsNoTrace | ((...args: NoInfer<Args>) => SpanOptionsNoTrace),
    traceOptions?: TraceOptions
  ): <A,E,R>(self: Effect<A,E,R>, ...args: Args) => Effect<A,E,Exclude<R, ParentSpan>>
  <A,E,R>(self: Effect<A,E,R>, name: string, options?: SpanOptions): Effect<A,E,Exclude<R, ParentSpan>>
}
export const withSpanScoped: { /* … */ }
export const withParentSpan: { /* … */ }
export const annotateSpans: { /* … */ }
export const annotateCurrentSpan: { (key: string, value: unknown): Effect<void>; (values: Record<string,unknown>): Effect<void> }
export const currentSpan: Effect<Span, Cause.NoSuchElementError>
export const currentParentSpan: Effect<AnySpan, Cause.NoSuchElementError>
export const linkSpans: { /* … */ }
export const makeSpan / makeSpanScoped / useSpan / tracer / withTracer / withTracerEnabled / withTracerTiming
```

v4 renames (`references/effect/migration/annotations/effect__Effect.yaml`): `currentPropagatedSpan` → `currentParentSpan`; `functionWithSpan` merged into `withSpan`; `linkSpanCurrent` → `linkSpans`; `tracerWith` → `Tracer.Tracer.use`; `withTracerScoped` → `Effect.provideService`.

New in `references/effect/packages/effect/src/Tracer.ts`: `Tracer.Tracer` is now a `Context.Reference` (fiber-cached); `DisablePropagation: Context.Reference<boolean>`; and **new in 4.0** `CurrentTraceLevel` / `MinimumTraceLevel` references, so span sampling can be gated by a log-level-style threshold.

### 6.4 Context propagation

`references/effect/packages/effect/src/unstable/http/HttpTraceContext.ts` is the shared codec:

```ts
export const toHeaders = (span: Tracer.Span): Headers.Headers =>
  Headers.fromRecordUnsafe({
    b3: `${span.traceId}-${span.spanId}-${span.sampled ? "1" : "0"}${…}`,
    traceparent: `00-${span.traceId}-${span.spanId}-${span.sampled ? "01" : "00"}`
  })

export const fromHeaders = (headers: Headers.Headers): Option.Option<Tracer.ExternalSpan> => {
  let span = w3c(headers);  if (Option.isSome(span)) return span
  span = b3(headers);       if (Option.isSome(span)) return span
  return xb3(headers)
}
```

Outbound emits **both** `traceparent` and `b3`. Inbound tries W3C first, then compact `b3`, then `x-b3-*`.

**Client:** `HttpClient.make` (`references/effect/packages/effect/src/unstable/http/HttpClient.ts:628-710`) opens a `kind: "client"` span per request, sets HTTP semconv attributes, and attaches:
```ts
request = fiber.getRef(TracerPropagationEnabled)
  ? HttpClientRequest.setHeaders(request, TraceContext.toHeaders(span))
  : request
```
Controlled by four `Context.Reference`s (`HttpClient.ts:1587-1625`): `TracerDisabledWhen`, `TracerHeaderFilter`, `TracerPropagationEnabled`, `SpanNameGenerator` (default span name `` `http.client ${request.method}` ``). The v3 `withSpanNameGenerator` / `withTracerDisabledWhen` / `withTracerPropagation` convenience combinators are **removed** — provide the reference instead, e.g. `HttpClient.transformResponse(Effect.provideService(HttpClient.SpanNameGenerator, f))`.

**Server:** `HttpMiddleware.tracer` (`references/effect/packages/effect/src/unstable/http/HttpMiddleware.ts`) calls `TraceContext.fromHeaders(request.headers)`, uses the result as the `parent` of a `kind: "server"` span, and installs it as `Tracer.ParentSpan` in the fiber context — so every downstream span and outgoing HttpClient call chains off the incoming trace automatically.

**For solidifront:** OTEL "through every part of the system" is nearly free. The Storefront client gets client spans and traceparent propagation to Shopify with zero code. What solidifront must do is (a) install `HttpMiddleware.tracer` (or equivalent) at the SSR request boundary, (b) decide how a browser-side span continues a server-rendered trace, and (c) provide one `ObservabilityLayer` per environment.

### 6.5 Browser

`@effect/opentelemetry` does have `WebSdk` (`references/effect/packages/opentelemetry/src/WebSdk.ts`), mirroring `NodeSdk` but using `WebTracerProvider` from `@opentelemetry/sdk-trace-web`, and with `Configuration.resource` **required** — the doc comment states *"Browser resource metadata is explicit; this layer does not read OpenTelemetry environment variables."* It still needs the `@opentelemetry/*` peers.

For a storefront where bundle size is a conversion metric, **use `effect/unstable/observability/OtlpTracer` in the browser**, provided with `FetchHttpClient.layer`. Zero OTel SDK. `@effect/opentelemetry`'s `OtelTracer.currentOtelSpan` documents interop with the lightweight tracer, so a server using the real SDK and a client using the OTLP module still share a trace.

---

## 7. Effect ↔ Solid interop

The highest-risk area. Findings are concrete, and so is the gap.

### 7.1 Prior art exists — first-party

`references/effect/packages/atom/` contains **three** framework bindings, not one:

```
packages/atom/react/   @effect/atom-react
packages/atom/solid/   @effect/atom-solid   "SolidJS bindings for the Effect Atom modules"
packages/atom/vue/     @effect/atom-vue
```

All three `CHANGELOG.md` files have 107 version headings and the same oldest entry (`4.0.0-beta.0`, PR #1183, "v4 beta") — Solid shipped in lockstep with React from day one. `@effect/atom-solid` is on npm at `4.0.0-rc.109`.

Additional community prior art (weaker, web sources): `@effect-atom/atom-react` (the pre-v4 ancestor, formerly `effect-rx`, `tim-smart/effect-atom`); `@effectify/solid-effect-atom`; `@dxos/effect-atom-solid`; and [JonahPlusPlus/solid-effect](https://github.com/JonahPlusPlus/solid-effect) (31 stars, early-stage, JSX helpers rather than a runtime bridge). The ecosystem has converged on **atom-based bindings**, not bespoke runtime bridges.

### 7.2 ⚠️ `@effect/atom-solid` does not support Solid 2.0

```json
// references/effect/packages/atom/solid/package.json:62-65
"peerDependencies": {
  "effect": "workspace:^",
  "solid-js": ">=1.9.14 <2.0.0"
}
```

`references/solid/packages/solid/package.json` is `solid-js@2.0.0-rc.0`. **The peer range explicitly excludes the target.**

And the Solid binding is thinner than React's:

| File | `atom/react/src/` | `atom/solid/src/` |
|---|---|---|
| Hooks | ✅ | ✅ |
| RegistryContext | ✅ | ✅ |
| `ScopedAtom.ts` | ✅ | ❌ |
| `ReactHydration.ts` (`HydrationBoundary`) | ✅ | ❌ |

So Solid has **no SSR hydration boundary component**, even at Solid 1.x.

**This is a decision point for the restructure:** vendor/port `@effect/atom-solid` to Solid 2.0 inside solidifront, upstream a PR to Effect, or hand-roll a narrower bridge. Whichever — it is unwritten work, and Solid 2.0's reactive core (`references/solid/packages/solid-signals/`) was rewritten, so the port is not a version-range bump.

### 7.3 The bridge, in one function

`references/effect/packages/atom/solid/src/Hooks.ts`:

```ts
function createAtomAccessor<A>(registry: AtomRegistry.AtomRegistry, atom: () => Atom.Atom<A>): Accessor<A> {
  const [value, setValue] = createSignal<A>(null as any)
  createComputed(() => {
    onCleanup(registry.subscribe(atom(), setValue as any, constImmediate))
  })
  return value
}
```

That is the whole Effect→Solid seam: `registry.subscribe` returns an unsubscribe closure; `createComputed` re-runs on dependency change; `onCleanup` registers the unsubscribe against Solid's owner so it fires on both recompute and disposal. `useAtomMount`, `useAtomSubscribe`, `useAtomRef` all use the same `createComputed`/`createEffect` + `onCleanup` shape.

Exported hooks: `useAtomValue`, `useAtom`, `useAtomSet`, `useAtomMount`, `useAtomRefresh`, `useAtomSubscribe`, `useAtomResource`, `useAtomRef`, `useAtomRefProp`, `useAtomRefPropValue`, `useAtomInitialValues`.

Suspense integration goes through Solid's native `createResource`:

```ts
export const useAtomResource = <A, E>(atom, options) => {
  const result = useAtomValue(atom)
  return createResource(result, (result) => {
    if (AsyncResult.isInitial(result) || (options?.suspendOnWaiting && result.waiting)) return constUnresolvedPromise
    else if (AsyncResult.isSuccess(result)) return Promise.resolve(result.value)
    return Promise.reject(Cause.squash(result.cause))
  })
}
```

Registry provider (`references/effect/packages/atom/solid/src/RegistryContext.ts`):

```ts
export const RegistryContext = createContext<AtomRegistry.AtomRegistry>(AtomRegistry.make())

export const RegistryProvider = (options: {
  readonly children?: JSX.Element | undefined
  readonly initialValues?: Iterable<readonly [Atom.Atom<any>, any]> | undefined
  readonly defaultIdleTTL?: number | undefined
  /* … */
}) => {
  const registry = AtomRegistry.make({ ...options, defaultIdleTTL: options.defaultIdleTTL ?? 400 })
  onCleanup(() => registry.dispose())
  return createComponent(RegistryContext.Provider, { value: registry, get children() { return options.children } })
}
```

> **SSR footgun:** the default context value is a module-level `AtomRegistry.make()`. An app that forgets `RegistryProvider` still "works" but shares one registry across every server request. solidifront must make the per-request provider non-optional.

### 7.4 Running an Effect and getting the result into a signal

Execution primitives in v4 (`references/effect/packages/effect/src/Effect.ts:8717-9260`): `runFork` / `runForkWith(ctx)`, `runCallback` / `runCallbackWith`, `runPromise` / `runPromiseWith`, `runPromiseExit` / `runPromiseExitWith`, `runSync` / `runSyncWith`, `runSyncExit` / `runSyncExitWith`. `RunOptions = { signal?, scheduler?, uninterruptible?, onFiberStart? }`.

The canonical "reactive framework" pattern is inside Atom (`references/effect/packages/effect/src/unstable/reactivity/Atom.ts`):

```ts
function runCallbackSync<R, A, E, ER = never>(services, effect, onExit, uninterruptible = false) {
  if (Exit.isExit(effect)) { onExit(effect as any); return undefined }
  const runFork = Effect.runForkWith(services)
  const fiber = runFork(effect)
  fiber.currentDispatcher?.flush()
  const result = fiber.pollUnsafe()
  if (result) { onExit(result); return undefined }
  const remove = fiber.addObserver(onExit)
  function cancel() { remove(); if (!uninterruptible) fiber.interruptUnsafe() }
  return cancel
}
```

`runForkWith` + `pollUnsafe()` (synchronous fast path, so a sync Effect never causes a wasted render) + `addObserver` + a `cancel` that interrupts. A hand-rolled Solid bridge should replicate exactly this inside `createComputed` / `onCleanup`.

And `makeEffect` shows how a Scope is attached per atom:

```ts
function makeEffect<A, E>(ctx, effect, initialValue, services = Context.empty(), uninterruptible = false) {
  const previous = ctx.self<AsyncResult.AsyncResult<A, E>>()
  const scope = Scope.makeUnsafe()
  ctx.addFinalizer(() => { Effect.runForkWith(services)(Scope.close(scope, Exit.void)) })
  const servicesMap = new Map(services.mapUnsafe)
  servicesMap.set(Scope.Scope.key, scope)
  servicesMap.set(AtomRegistry.key, ctx.registry)
  servicesMap.set(Scheduler.Scheduler.key, ctx.registry.scheduler)
  /* … runCallbackSync … */
}
```

Every effect-backed atom gets its own `Scope`, and the fiber-interrupt + `Scope.close` are registered as atom finalizers.

### 7.5 Runtime lifecycle: where does it live?

Two distinct answers in the source, for two distinct patterns.

**`ManagedRuntime` (server/imperative):** one per **app/process**. `references/effect/ai-docs/src/04_integration/10_managed-runtime.ts` builds it at module scope with a shared `Layer.makeMemoMapUnsafe()`, reuses it across every request, and disposes on `SIGINT`/`SIGTERM`. Nothing in the repo suggests a fresh `ManagedRuntime` per HTTP request — that would defeat layer caching. `ManagedRuntime` holds a `Scope.Closeable` (`Scope.makeUnsafe("parallel")`) and caches the built `Context`.

**`AtomRuntime` (reactive/client):** one per **`AtomRegistry`**. `Atom.runtime` is itself an atom whose value is `AsyncResult<Context<R>, ER>`:

```ts
self.read = function read(get: AtomContext) {
  const layer = get(layerAtom)
  const build = Effect.flatMap(Effect.scope, (scope) => Layer.buildWithMemoMap(layer, resolveMemoMap(get), scope))
  return effect(get, build, { uninterruptible: true })
}
```

`uninterruptible: true` so tearing down doesn't interrupt a half-built service graph. `RuntimeFactory.addGlobalLayer` registers a layer shared by every runtime from that factory. A `RegistryRuntimeFactory` scopes the memoMap to the registry; passing a concrete `Layer.MemoMap` gives a `SharedRuntimeFactory` shared across registries.

For a per-request server registry, `AtomRegistry.layer` shows the shape:

```ts
Layer.effect(AtomRegistry, Effect.gen(function*() {
  const scope = yield* Effect.scope
  const registry = make(options)
  yield* Scope.addFinalizer(scope, Effect.sync(() => registry.dispose()))
  return registry
}))
```

**Recommendation for solidifront:** one app-level `ManagedRuntime` holding infrastructure that is genuinely global (OTEL exporters, HttpClient, config), plus a **per-request layer** providing request-scoped services (storefront client with the request's locale/buyer, session) — which is essentially what `packages/start/src/middleware/createStorefrontMiddleware.ts` already does with `ManagedRuntime.make(mainLayer, Runtime.memoMap)`. In v4 that second argument becomes `{ memoMap: Runtime.memoMap }`.

### 7.6 Scope/finalizers vs Solid ownership — they compose

Both are tree-structured, LIFO, exit-aware disposal systems.

Effect v4 `Scope` (`references/effect/packages/effect/src/Scope.ts`): `{ [TypeId], strategy: "sequential"|"parallel", state: Empty|Open|Closed }`; `Scope.make`, `makeUnsafe`, `addFinalizer`, `addFinalizerExit`, `fork`, `close`, `provide`. Only v3→v4 change is `Scope.extend` → `Scope.provide` (`references/effect/migration/scope.md`).

Solid 2.0 ownership (`references/solid/packages/solid-signals/src/core/owner.ts`):

```ts
export function cleanup(fn: Disposable): Disposable {
  if (!context) return fn
  if (!context._disposal) context._disposal = fn
  else if (Array.isArray(context._disposal)) context._disposal.push(fn)
  else context._disposal = [context._disposal, fn]
  return fn
}

export function createRoot<T>(init, options?): T {
  const owner = createOwner(options)
  return runWithOwner(owner, () => init(() => owner.dispose()))
}
```

Plus `createOwner`, `getOwner()`, and `runWithOwner(owner, fn)` (`references/solid/packages/solid-signals/src/core/core.ts:1093`). `onCleanup` (`solid-signals/src/signals.ts:68`) is a thin wrapper over `cleanup`.

**They compose because the atom binding never merges the trees.** It bridges at one seam per subscription: `onCleanup(registry.subscribe(...))`. Solid owns *when to unsubscribe*; Effect's registry owns *when to actually tear down the fiber and scope*. No Effect API needs to know about Solid's `Owner`, and no Solid API needs to know about `Scope`.

A hand-rolled bridge needs exactly three Solid APIs: `onCleanup` (register teardown), `getOwner()` + `runWithOwner()` (reattach a captured owner from a deferred Effect callback).

### 7.7 Fiber interruption vs Solid disposal — decoupled by design

`references/effect/packages/effect/src/Fiber.ts`:

```ts
export interface Fiber<out A, out E = never> extends Pipeable {
  readonly id: number
  readonly addObserver: (cb: (exit: Exit<A, E>) => void) => () => void
  readonly interruptUnsafe: (fiberId?: number, annotations?: Context.Context<never>) => void
  readonly pollUnsafe: () => Exit<A, E> | undefined
}
export const interrupt: <A, E>(self: Fiber<A, E>) => Effect<void>
export const interruptAll: <A extends Iterable<Fiber<any,any>>>(…) => …
```

The doc comment: *"Prefer the exported functions in this module over calling `interruptUnsafe` or `pollUnsafe` directly. The unsafe methods are immediate runtime hooks and do not provide the same Effect-based sequencing guarantees."* Atom uses the unsafe variants deliberately — it is firing from a synchronous non-Effect callback where there is no ambient fiber.

**Does disposing a Solid computation interrupt the fiber? Eventually, not immediately.** `AtomRegistry` inserts a debounce:

1. Solid `onCleanup` → the unsubscribe closure → `registry.scheduleNodeRemoval(node)`.
2. Removal is scheduled via `this.dispatcher.scheduleTask(fn, 0)` — deferred, so a `<Show>` toggle or a remount doesn't thrash the fiber.
3. If the atom has an `idleTTL` (default **400 ms** via `RegistryProvider`'s `defaultIdleTTL`), the node parks in `timeoutBuckets` and is only removed after the TTL. Re-subscribing before expiry cancels the pending GC via `removeNodeTimeout`.
4. `node.remove()` → `disposeLifetime()` → runs the atom's finalizers → `fiber.interruptUnsafe()` + `Scope.close`.

That debounce is the load-bearing design choice making the two systems co-exist without over-eager fiber kills. Any solidifront-authored bridge that wires `onCleanup` straight to `Fiber.interrupt` will re-introduce the thrash this avoids.

### 7.8 SSR and hydration

`references/effect/packages/effect/src/unstable/reactivity/Hydration.ts` is framework-agnostic and lives in core:

```ts
export const dehydrate = (registry, options?: { encodeInitialAs?: "ignore"|"promise"|"value-only" }): Array<DehydratedAtom>
export const hydrate = (registry, dehydratedState: Iterable<DehydratedAtom>): void
```

`dehydrate` walks `registry.getNodes()`, keeps atoms marked `Atom.serializable`, encodes each via its `SerializableTypeId` codec, and can attach a `resultPromise` for atoms still `Initial` (streaming SSR). `hydrate` calls `registry.setSerializable(key, encoded)`, which the registry consults in `ensureNode` via a `preloadedSerializable` map.

React consumes this via `HydrationBoundary` (`references/effect/packages/atom/react/src/ReactHydration.ts`), which hydrates new atoms during render and defers hydration of existing atoms until after commit. **Solid has no equivalent.** `Hydration.hydrate`/`dehydrate` are directly usable from Solid, but the component is unwritten.

For per-request layers, Solid 2.0 has the needed primitives: `createContext`/`useContext` exist in both client (`references/solid/packages/solid/src/client/core.ts:101,145`) and server (`references/solid/packages/solid/src/server/core.ts:40,63`) entrypoints, plus `getOwner`/`runWithOwner` for deferred callbacks resuming into the right per-request tree.

**What crosses to the client** is the unresolved design question. The Storefront client's private access token must not. So either:
- the client-side runtime gets a *different* layer (public token, or an RPC proxy back to the server), or
- only dehydrated atom *values* cross, not the client itself.

Nothing in the Effect repo decides this for solidifront.

### 7.9 `AsyncResult` — the shape the UI sees

`references/effect/packages/effect/src/unstable/reactivity/AsyncResult.ts`:

```ts
export type AsyncResult<A, E = never> = Initial<A, E> | Success<A, E> | Failure<A, E>
export interface Proto<A, E> extends Pipeable {
  readonly waiting: boolean
}
```

Three tags plus a `waiting` flag carried through refreshes (`AsyncResult.waitingFrom(previous)`), i.e. built-in stale-while-revalidate. This is Effect's answer to a UI resource type and it is what `useAtomResource` unwraps into Solid's Suspense. If solidifront exposes query primitives, this is the type to surface — not raw `Effect`.

---

## 8. Migration surface in `packages/storefront-client`

Every symbol below was found by grepping `packages/storefront-client/src` and `tests`. Package currently declares `effect ^3.19.12` and `@effect/platform ^0.93.8`.

> **Re-verification status (rc.109).** Every rename in this section was re-checked by presence-grepping `references/effect/packages/effect/src/` at rc.109 — confirming both that the v4 name exists *and* that the v3 name is gone, rather than trusting the migration guide. Results: **all renames hold**, with **one change** — the `effect/ParseResult` → `effect/SchemaError` row is now `effect/ParseResult` → `effect/Schema` (§1.5①). Removals re-confirmed absent at rc.109: `Effect.catchAll` (0 hits), `Effect.filterOrDie` (0), `Layer.scoped` (0), `Context.Tag` (0), `Context.isTag` (0), `Cause.isDie` (0), `Cause.isFailure` (0), `Data.case`/`struct`/`array`/`tuple`/`Structural` (0 each), `Schema.asSchema`/`decodeUnknown`/`annotations`/`startsWith`/`minLength`/`pattern`/`pickLiteral`/`extend`/`partial`/`validate`/`Enums` (0 each), and the whole `FiberRef.ts` and `ParseResult.ts` modules (files absent).

### 8.1 Package + imports

| Today | v4 | Notes |
|---|---|---|
| `"@effect/platform": "^0.93.8"` (dependency) | **delete** | No 4.x exists |
| `"effect": "^3.19.12"` (dependency) | `"effect": "^4.0.0"` under **`peerDependencies`** | §D4 |
| `from "@effect/platform/FetchHttpClient"` | `from "effect/unstable/http/FetchHttpClient"` | |
| `from "@effect/platform/HttpClient"` | `from "effect/unstable/http/HttpClient"` | |
| `from "@effect/platform/HttpClientRequest"` | `from "effect/unstable/http/HttpClientRequest"` | |
| `from "@effect/platform/HttpClientResponse"` | `from "effect/unstable/http/HttpClientResponse"` | |
| `from "@effect/platform/HttpClientError"` | `from "effect/unstable/http/HttpClientError"` | |
| `from "@effect/platform/HttpBody"` | `from "effect/unstable/http/HttpBody"` | |
| `from "effect/FiberRef"` | `from "effect/References"` | module removed (`FiberRef.ts` absent at rc.109) |
| `from "effect/ParseResult"` | `from "effect/Schema"` (for `SchemaError`) / `effect/SchemaIssue` (for issue types + formatters) | ⚠️ **changed at rc.109** — was `effect/SchemaError` at beta.106; that module was deleted (§1.5①). See 8.4 |
| `from "effect/index"` (in `src/index.ts:18`) | `from "effect"` | `./index` export is `null` in v4's exports map |

Also `"typescript": "^5.9.3"` sits in `dependencies` — should be a devDependency, and the root is already on TS `^7.0.2`.

### 8.2 Services — all five declarations rewritten

`Context.Tag` does not exist. Affected:

| File | Symbol |
|---|---|
| `src/services/StorefrontClient.ts:77` | `class StorefrontClient extends Context.Tag("@solidifront/storefront-client")<…>()` |
| `src/services/DefaultClientOptions.ts:14` | `class DefaultClientOptions extends Context.Tag(…)<…>()` |
| `src/services/DefaultHeaders.ts:16` | `class DefaultHeaders extends Context.Tag(…)<…>()` |
| `src/services/GraphQLOperation.ts` | `class GraphQLOperation extends Context.Tag(…)<…>()` |
| `src/services/InContext.ts:47` | `class InContext extends Context.Tag(…)<…>()` |

Each becomes `class X extends Context.Service<X, XImpl>()("@solidifront/storefront-client/X") {}`. `X.of(...)` survives on the `Service` interface. Note `InContext` also hangs three **static methods** off the tag class (`injectBuyerIdentity`, `injectLocale`, `injectVisitorConsent`) — that still works with `Context.Service`'s class form, but the `serviceNotAsClass` tsgo rule means keep it a class declaration.

### 8.3 `Effect` / `Layer` / `Runtime` call sites

| Today | v4 | Where |
|---|---|---|
| `Effect.catchAll` | `Effect.catch` | `StorefrontClient.ts:224` |
| `Effect.filterOrDie` | `Effect.filterOrFail` + `Effect.orDie` | `src/utils.ts` / predicates |
| `Effect.filterOrFail`, `filterOrElse` | unchanged | `StorefrontClient.ts:113-141` |
| `Effect.fn`, `fnUntraced`, `gen` | unchanged names; `gen(this, f)` → `gen({self:this}, f)` if used | |
| `Effect.serviceOption` | unchanged | `StorefrontClient.ts:270,282,292` |
| `Effect.annotateLogs`, `annotateLogsScoped`, `withLogSpan` | unchanged | present at rc.109 `Effect.ts:13939/14016/14056` |
| `Effect.scoped`, `provide`, `runPromise`, `runSync`, `succeed`, `sync`, `fail`, `flatMap`, `andThen`, `log*` | unchanged | |
| `Layer.scoped(StorefrontClient, make())` | `Layer.effect(…)` | `StorefrontClient.ts:405` — `Layer.scoped` **removed** |
| `Layer.effect`, `succeed`, `mergeAll`, `provide` | unchanged | |
| `Layer.MemoMap`, `makeMemoMap`, `buildWithMemoMap` | unchanged; also `makeMemoMapUnsafe` | `src/index.ts:55,72,74` |
| `Runtime.isFiberFailure` | **removed** — use an `Exit`-returning runner and inspect `Cause` | `tests/` |
| `Cause.isDie` | `Cause.hasDies` | `tests/` |
| `FiberRef.get(FiberRef.currentMinimumLogLevel)` | `yield* References.MinimumLogLevel` | `src/utils/logger.ts:9` |
| `Logger.minimumLogLevel(level)` | `Layer.succeed(References.MinimumLogLevel, level)` | `src/index.ts:76` |
| `Logger.withMinimumLogLevel(level)` | `Effect.provideService(e, References.MinimumLogLevel, level)` | `src/index.ts:91` |
| `Logger.replace(Logger.defaultLogger, …)` | `Logger.layer([...desiredLoggers])` | commented-out code in `src/index.ts:63` |
| `Logger.pretty` | `Logger.layer([Logger.consolePretty(), Logger.tracerLogger])` | `src/index.ts:60` (commented); **live** in `packages/start/…/createStorefrontMiddleware.ts:53` |
| `Logger.make` | unchanged | `src/index.ts:22` |
| `Data.case<T>()(data)` | **removed** — use a plain object / typed constructor | `src/data/ClientResponse.ts:16`, `FetchBodyResponse.ts`, `ResponseErrors.ts` |
| `Data.Class`, `Data.TaggedClass`, `Data.TaggedError` | unchanged | `src/errors.ts` (9 classes), `src/data/*` |
| `Redacted.make`, `Redacted.value` | unchanged | |
| `Schedule.spaced("… millis")` | unchanged | `StorefrontClient.ts:146` |
| `Config.string` | unchanged | `DefaultClientOptions.ts` |
| `Option.match` | unchanged | |

`ClientResponse` deserves attention: `Data.case` is gone precisely because *"plain objects are structurally equal in v4"* — so `ClientResponse.make` collapses to a plain object literal or a small typed constructor, and `Data.Class` is only needed if you want the `Equal`/`Hash` protocol explicitly.

### 8.4 Schema

`src/schemas.ts` uses: `S.Any`, `S.Array`, `S.Int`, `S.Literal`, `S.NonEmptyString`, `S.Record`, `S.Redacted`, `S.String`, `S.Struct`, `S.Unknown`, `S.annotations`, `S.asSchema`, `S.extend`, `S.filter`, `S.instanceOf`, `S.optional`, `S.optionalWith`, `S.partial`, `S.pickLiteral`, `S.startsWith`, `S.Schema.Type`, `S.Schema.Encoded`.

| Today | v4 |
|---|---|
| `S.Literal("2024-01", "2024-04", …)` | `S.Literals(["2024-01", "2024-04", …])` |
| `S.pickLiteral(ValidVersion, "…")` | `S.Literals(values).pick(selected)` |
| `S.annotations({ identifier, title, description, examples })` | `S.annotate({...})` |
| `S.Redacted(inner)` | `S.RedactedFromValue(inner)` ⚠️ **silent behaviour change otherwise** |
| `S.filter(pred)` | `S.check(S.makeFilter(pred))` (predicate) / `S.refine(r)` (refinement) |
| `S.startsWith("x")` | `S.check(S.isStartsWith("x"))` |
| `S.extend(A, B)` | `A.mapFields(Struct.assign(fields))` or `S.fieldsAssign` |
| `S.partial(A)` | `A.mapFields(Struct.map(S.optional))` |
| `S.optionalWith(s, opts)` | `S.optional` / `S.optionalKey` / `S.withDecodingDefaultType` depending on options |
| `S.Record({ key, value })` | `S.Record(key, value)` |
| `S.asSchema(x)` | `S.revealCodec(x)` |
| `S.Schema.Type<typeof X>` | `typeof X["Type"]` (tsgo `preferSchemaTypeProperty` enforces this) |
| `S.Schema.Encoded<typeof X>` | `typeof X["Encoded"]` |
| `Schema.decodeUnknown(RequestOptions)(x)` | `Schema.decodeUnknownEffect(RequestOptions)(x)` |
| `ParseError` in every `Effect<…, ParseError, …>` | `Schema.SchemaError` — imported from `effect/Schema`, **not** `effect/SchemaError` (§1.5①) |
| `S.Struct`, `S.String`, `S.Int`, `S.NonEmptyString`, `S.Array`, `S.Any`, `S.Unknown`, `S.instanceOf`, `S.optional` | names unchanged (declaration consolidated) |

`StorefrontClientImpl`'s two method signatures (`StorefrontClient.ts:53-74`) both declare `ParseError | HttpClientError | InContextError | ExtractOperationNameError | HttpBodyError` — all four non-solidifront members change identity: `ParseError` → `Schema.SchemaError`, and `HttpClientError` is now *"a tagged wrapper class containing a concrete failure in `reason`"* rather than a union.

### 8.5 HTTP

| Today | v4 |
|---|---|
| `HttpClient.HttpClient` (tag) | same name, now `Context.Service<HttpClient, HttpClient>` at `HttpClient.ts:150` |
| `HttpClient.mapRequestInput` | unchanged (`HttpClient.ts:779`) |
| `HttpClient.transformResponse` | unchanged (`HttpClient.ts:296`) |
| `HttpClient.retry({ times, schedule, while })` | *"Retained; the Schedule error channel is included in the resulting client error type"* |
| `HttpClient.make` | *"Retained; the runner receives `Fiber.Fiber` and failures use the v4 error wrapper"* — `tests/` uses this |
| `HttpClientRequest.post/setHeaders/bodyJson` | unchanged |
| `HttpClientResponse.schemaBodyJson` | unchanged name; fails with `SchemaError` |
| `HttpClientResponse.fromWeb` | retained (`HttpClientResponse.ts:80`); takes `(request, source: Response)` — verify test call sites pass the request |
| `FetchHttpClient.layer` | unchanged |
| `HttpBodyError` | now a **class** constructed with `reason` + optional `cause` |
| `HttpClientError` | union → **tagged wrapper class** with `.reason`; `HttpClientError.RequestError` is now a type-only reason union |

The `HttpClientError` reshape is the subtlest item here. `StorefrontClient.ts:224-245`'s `Effect.catchAll` block discriminates on `error._tag` across seven solidifront errors and re-fails everything else. Under v4 that becomes `Effect.catch`, and the "everything else" branch now sees a single `HttpClientError` whose detail lives in `.reason` rather than a union of distinct tags.

### 8.6 `src/index.ts` — the promise-API bridge

The hand-rolled runtime (`src/index.ts:54-93`) is the largest single rewrite:

```ts
let scope: Scope.Scope | null = null;
let memo: Layer.MemoMap | null = null;
scope = await Effect.runPromise(Scope.make());
memo  = await Effect.runPromise(Layer.makeMemoMap);
return await Effect.runPromise(
  Layer.buildWithMemoMap(
    StorefrontClient.layer(initOptions).pipe(Layer.provide(Logger.minimumLogLevel(LogLevel.Error))),
    memo, scope
  )
);
```

Every piece still exists in v4 (`Scope.make`, `Layer.makeMemoMap`, `Layer.buildWithMemoMap`), except `Logger.minimumLogLevel` → `Layer.succeed(References.MinimumLogLevel, level)`. But the whole block should be replaced by `ManagedRuntime.make(layer, { memoMap })` (§5.3): it gives disposal, context caching, and `Symbol.asyncDispose`, and it never leaks a `Scope` the way the current code does (`scope` is created and never closed).

### 8.7 Knock-on: `packages/start`

- `packages/start/package.json` — `effect ^3.19.12` → v4 peer.
- `src/middleware/Runtime.ts` — `ManagedRuntime.make(Layer.empty)` unchanged.
- `src/middleware/createStorefrontMiddleware.ts` — `ManagedRuntime.make(mainLayer, Runtime.memoMap)` → `ManagedRuntime.make(mainLayer, { memoMap: Runtime.memoMap })`; `Logger.pretty` → `Logger.layer([Logger.consolePretty(), Logger.tracerLogger])`; `Logger.minimumLogLevel(x)` → `Layer.succeed(References.MinimumLogLevel, x)`.

### 8.8 Suggested order

1. Bump root TS/tsgo config; set `outdatedApi` to error to get the worklist.
2. `packages/storefront-client`: package.json (peer dep, drop `@effect/platform`), then imports, then `Context.Tag` → `Context.Service`, then `Layer.scoped` → `Layer.effect`.
3. Schema rewrite in `src/schemas.ts` (largest single file of changes) + `ParseError` → `SchemaError` propagation through `StorefrontClient.ts`'s signatures.
4. `Data.case` removal in `src/data/*`.
5. Logger/FiberRef → References.
6. Replace `src/index.ts`'s hand-rolled runtime with `ManagedRuntime`.
7. `packages/start` follows.
8. Then, separately, add OTEL layers and reconsider the Solid bridge.

---

## 9. Open questions / could not verify

> Items 1 and 2 from the first draft are **resolved** and retained here with their outcomes, since findings from this document have already been circulated.

1. ~~**rc.109 vs beta.106.**~~ ✅ **Resolved.** The submodule was moved to `main` @ `6eebd0a6` (`4.0.0-rc.109`) and the whole document re-verified — see the revision note and §1.5. One finding changed (`SchemaError` module deleted); everything else held.

2. ~~**`Schema.TaggedError` vs `TaggedErrorClass`.**~~ ✅ **Resolved, in our favour.** The migration guide was stale; upstream deleted the offending row between beta.106 and rc.109 (§1.5③).

3. ~~**`HttpClientResponse.fromWeb`**~~ ✅ **Resolved.** Retained at rc.109: `references/effect/packages/effect/src/unstable/http/HttpClientResponse.ts:80`, signature `(request: HttpClientRequest.HttpClientRequest, source: Response) => HttpClientResponse`. Note it takes the originating request as its first argument — check the call sites in `packages/storefront-client/tests/` match.

4. **`Effect.fn`'s v4 signature change.** The rename map says `Effect.fn` is *"Still exported in v4; update call sites for the revised signature, options, and channel inference."* I did not diff the v3 and v4 signatures directly, so the exact impact on `StorefrontClient.ts:162`'s `Effect.fn("executeRequest")(function*(…){})(operation, options)` immediate-invocation form is unverified. Note tsgo has an `effectFnIife` rule that flags calling `Effect.fn` as an IIFE and suggests `Effect.gen` — the current code may trip it.

5. **`@effect/atom-solid` on Solid 2.0.** Nobody has tried it. The peer range forbids it, the Solid 2.0 reactive core (`references/solid/packages/solid-signals/`) was rewritten, and I did not attempt an install or a compile. The port cost is genuinely unknown — it could be a peer-range bump plus small fixes, or it could be substantial. Re-checked at rc.109: no upstream issue, PR, discussion, or changeset signals planned Solid 2.0 support, and the package source did not change at all across the beta→RC transition. **Cheapest next action: open an upstream issue** (cf. [#6486](https://github.com/Effect-TS/effect/issues/6486) for `atom-svelte`) before committing to a fork. Second-cheapest: `pnpm add @effect/atom-solid@rc` against Solid 2.0 with the peer warning overridden, and just see whether `Hooks.ts`'s three primitives (`createSignal`, `createComputed`, `onCleanup`) still typecheck and behave — that is a ~1 hour experiment that would collapse most of the uncertainty.

6. **Solid SSR hydration for atoms.** `Hydration.dehydrate`/`hydrate` exist in core and are framework-agnostic, but the Solid-side component is unwritten and I found no design notes for one. React's `HydrationBoundary` defers hydration of existing atoms until after commit — the equivalent concept in Solid's non-committing render model is not obvious.

7. **Whether solidifront should use atoms at all.** `@effect/atom-*` is a whole reactivity system layered on Effect. An alternative is a much thinner bridge (`runForkWith` + `pollUnsafe` + `addObserver` + `createSignal` + `onCleanup`, per §7.4) with no registry, no `AsyncResult`, no idleTTL. I have not evaluated the tradeoff; the registry's debounce behaviour (§7.7) is a real feature that a thin bridge would have to re-earn.

8. **Browser trace continuation.** `HttpMiddleware.tracer` handles server-side inbound propagation, and `HttpClient` handles outbound. How a *browser* span becomes a child of the SSR request's span — i.e. getting the `traceparent` into the HTML — has no documented Effect-side story that I found.

9. **`@effect/tsgo`'s full `outdatedApi` rename table** is not published in the docs ([outdated-api.md](https://github.com/Effect-TS/tsgo/blob/main/docs/rules/outdated-api.md) shows only the `Effect.runtime()` example) and is compiled into `node_modules/@effect/tsgo/dist/effect-tsgo.cjs`. I did not extract it. Running the linter against the real codebase would produce the authoritative list.

10. **`GraphQLOperation` service internals.** I read its imports and tag declaration but not the full `graphql`-library interaction in `src/services/GraphQLOperation.ts` and `src/utils/upsertInContextWith*.ts`. Those are pure `graphql` AST manipulation and should be Effect-version-neutral, but that is an assumption, not a verification.

11. **Solid 2.0 specifics generally.** Another agent covers Solid 2.0; I read only `owner.ts`, `core.ts`, `signals.ts`, and the client/server `core.ts` entrypoints in `references/solid` for the interop question. Anything about Solid 2.0's rendering, SSR, or router behaviour is out of scope here.

12. **`references/effect` is a shallow clone.** `git rev-parse --is-shallow-repository` → `true`, with `60814c2` and `6eebd0a` as grafted roots. Tree-to-tree diffs work (that is how §1.5 was produced) but there is **no commit history between them** — so "when exactly did X change" questions cannot be answered locally, and the beta.106 → rc.109 delta in §1.5 is a two-point comparison, not a changelog. Anything needing real history requires `git -C references/effect fetch --unshallow`.

13. **The RC is still a moving target.** rc.109 was published 2026-08-14T01:28Z and the submodule commit is from 14:23 the same day — i.e. `main` is already ahead of the newest published tag. At a ~2–3 day cadence this document goes stale quickly. The verification method in §1.5 (`git diff --name-status -M <old> HEAD -- packages/effect/src`, then export-line diffs of the modules solidifront uses) is cheap to re-run and is the recommended way to re-validate rather than re-reading everything.
