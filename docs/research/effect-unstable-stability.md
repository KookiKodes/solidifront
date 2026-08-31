# `effect/unstable/{http,observability}` — how long unstable, and what breaks if they move

**Research date:** 2026-08-14
**Question:** [KookiKodes/solidifront#23](https://github.com/KookiKodes/solidifront/issues/23) — "Stability horizon for `effect/unstable/{http,observability}`". Feeds [#19](https://github.com/KookiKodes/solidifront/issues/19) (OTEL span model) and [#13](https://github.com/KookiKodes/solidifront/issues/13) (app-scoped runtime transport). Carried-forward unknown #5 (`docs/research/README.md:104`).
**Status:** Answered, with one hard negative result (no graduation plan exists) that is itself the finding.

**Primary sources, in the order they were used:**

1. `references/effect` git submodule, branch `main`, commit `6eebd0a618308a91f95947bae6e0fb206ae3939d` ("feat: add v2025-11-25 protocol adapter (#7234)", authored 2026-08-14T12:23:22Z), packages at **`4.0.0-rc.109`**. `.changeset/pre.json` is `{"mode": "pre", "tag": "rc"}`.
2. `Effect-TS/effect` via authenticated `gh` — commits API (path-scoped), releases, milestones, issue/PR search, discussions GraphQL.
3. npm registry metadata (`npm view`) for `effect`, `@effect/platform`, and the first-party `@effect/*` v4 packages.
4. `effect.website` blog posts (WebFetch).

**Method note on git history.** The submodule is a `--depth 1` clone (`git rev-parse --is-shallow-repository` → `true`, `git rev-list --count HEAD` → `1`), so **no local history exists**. Every churn figure below comes from the GitHub commits API path-scoped to the two directories, cross-checked against `packages/effect/CHANGELOG.md` (3277 lines, 110 released versions) and `.changeset/pre/` (1124 consumed changesets). Nothing here is inferred from a local `git log`.

---

## Corrections to `docs/research/effect-4.md`

Two items in the existing document need adjusting. Neither changes its conclusions.

**C1. The unstable module list at `effect-4.md:165` is wrong, because its upstream source is wrong.**
It reproduces `MIGRATION.md:46-48` verbatim, which lists `jsonschema` as an unstable module and omits `encoding`. Neither matches the shipped artifact. The authoritative list is the `exports` map in `references/effect/packages/effect/package.json:33-50` — **18** subpaths: `ai, cli, cluster, devtools, encoding, eventlog, http, httpapi, observability, persistence, process, reactivity, rpc, schema, socket, sql, workflow, workers`. There is no `effect/unstable/jsonschema` subpath and no `packages/effect/src/unstable/jsonschema/` directory; `JsonSchema` is a **stable** top-level module at `references/effect/packages/effect/src/JsonSchema.ts`, reachable as `effect/JsonSchema` via the `"./*": "./src/*.ts"` catch-all (`package.json:51`). `encoding` was added as a subpath during the pre-release series (`references/effect/.changeset/pre/add-unstable-encoding-export.md`: _"Add `unstable/encoding` subpath export."_). The blog's "17 unstable modules" count is also off by one against rc.109.

**C2. `effect-4.md:32`'s framing — "even post-4.0.0-stable … on the churn-prone side of the line" — is correct but understates it.** The correct statement is stronger and is the core of this document: the caret ranges the Effect team itself publishes on its own first-party packages _admit_ the very minor releases in which `unstable/` is licensed to break. See §6.

Not a correction, but worth flagging as upstream staleness that will mislead future readers: `references/effect/MIGRATION.md:3` still opens with _"**Note:** Effect v4 is currently in beta. APIs may change between beta releases."_ at rc.109. The migration guide has not been updated for the beta→RC transition.

---

## 1. The short answer

- **How long do they stay unstable?** There is **no published answer**. No milestone, no tracking issue, no roadmap entry, no blog statement, and no changeset anywhere in the 110-release pre-release series names a graduation target for `http`, for `observability`, or for any unstable module. The only published statement is conditional and dateless: "As unstable modules mature, they graduate into the top-level `effect/*` namespace" (§2). Zero modules have graduated in the ~6 months from `4.0.0-beta.0` (2026-02-18) to `4.0.0-rc.109` (2026-08-14) (§3).
- **What is the blast radius if they break?** For solidifront: the Storefront client's entire transport (`unstable/http`) and the whole OTEL pillar (`unstable/observability`), which is itself built on `unstable/http` (§5). Because ADR-0002 makes the supported Effect range public API, an upstream minor that breaks either is a **major** version bump for solidifront (§7).
- **Is there an escape hatch?** Partially, and only for observability. `@effect/opentelemetry` imports nothing from `unstable/` and is a genuine alternative for the OTEL pillar at the cost of the OpenTelemetry JS SDK in the bundle. For HTTP there is no alternative at all inside the Effect ecosystem (§6).

---

## 2. The `unstable/` contract, verbatim

Two sources state it. They agree.

**Source A — `references/effect/MIGRATION.md:40-50`**, under the heading `### Unstable Module System`:

> v4 introduces **unstable modules** under `effect/unstable/*` import paths.
> These modules may receive breaking changes in minor releases, while modules
> outside `unstable/` follow strict semver.
>
> Unstable modules include: `ai`, `cli`, `cluster`, `devtools`, `eventlog`,
> `http`, `httpapi`, `jsonschema`, `observability`, `persistence`, `process`,
> `reactivity`, `rpc`, `schema`, `socket`, `sql`, `workflow`, `workers`.
>
> As these modules stabilize, they graduate to the top-level `effect/*` namespace.

(The module list in that quote is inaccurate — see **C1**.)

**Source B — [effect.website/blog/releases/effect/40-beta](https://www.effect.website/blog/releases/effect/40-beta)**, under the heading "Unstable modules":

> Effect v4 introduces **unstable modules** — accessible via `effect/unstable/*` import paths.
>
> Modules under `effect/unstable/*` may receive breaking changes in minor releases
>
> Modules outside `unstable/` follow strict semver — no breaking changes until the next major version
>
> As unstable modules mature, they graduate into the top-level `effect/*` namespace

The related design rationale, from [effect.website/blog/effect-v4beta-launch-to-may-recap](https://www.effect.website/blog/effect-v4beta-launch-to-may-recap):

> New functionality can now ship under effect/unstable/\*, making it easier to experiment with new APIs inside the main package without committing to long-term stability too early.

**What the contract does _not_ say.** It attaches no criteria to "mature"/"stabilize", no owner, no target version, and no deprecation window. It does not promise a migration guide, a codemod, a re-export shim, or an overlap period when a module graduates. Nothing in the repo or on the site supplies those.

**The contract is enforced only by import path.** There is no in-source stability marker: `grep -rn "@experimental\|@unstable\|@alpha" packages/effect/src/unstable/` returns nothing, and unstable modules carry the same `@since 4.0.0` JSDoc as stable ones (e.g. `references/effect/packages/effect/src/unstable/observability/OtlpTracer.ts:11`). Consequence for solidifront: an unstable import is detectable by grepping for the string `effect/unstable/`, and by nothing else. There is no type-level or lint-level signal you get for free.

**The only other in-repo mention** is `references/effect/packages/effect/README.md:47`, which describes the namespace as a location without restating the guarantee: "In v4, functionality that previously lived in separate packages ships inside `effect` under the `effect/unstable/*` namespaces, including `http`, `httpapi`, `rpc`, `cluster`, `workflow`, `cli`, `ai`, `sql`, and `reactivity`."

---

## 3. Graduation plan: none exists

Every place a plan would live was checked. All negative.

| Where I looked                       | How                                                                                                                                                                                    | Result                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub milestones                    | `gh api repos/Effect-TS/effect/milestones`                                                                                                                                             | Empty array. The repo has **no milestones at all**.                                                                                                 |
| GitHub discussions                   | `gh api graphql … discussionCategories(first:20)`                                                                                                                                      | `{"nodes":[]}` — discussions are not enabled on the repo.                                                                                           |
| Issue search                         | `gh search issues --repo Effect-TS/effect` for `unstable`, `graduation`, `stabilization`, `roadmap`, `graduate unstable stable namespace`, `promote out of unstable`, `stabilize http` | Matches on `unstable` are all bug reports _inside_ unstable modules (e.g. #6347, #6335, #6313). No tracking issue, no meta-issue, no roadmap issue. |
| PR search                            | `gh search prs --repo Effect-TS/effect "move out of unstable"`                                                                                                                         | No results.                                                                                                                                         |
| Changelog, all 110 released versions | `grep -i "graduat\|out of unstable\|no longer unstable\|promoted to stable"` over `packages/effect/CHANGELOG.md`                                                                       | No graduation event. The four hits are incidental (`effect/unstable/cluster/K8sTypes`, CLI import examples).                                        |
| 1124 consumed changesets             | same grep over `references/effect/.changeset/`                                                                                                                                         | No hits.                                                                                                                                            |
| RC announcement                      | WebFetch of [effect.website/blog/releases/effect/40-rc](https://www.effect.website/blog/releases/effect/40-rc)                                                                         | Silent on `unstable/` entirely. The only timeline is: _"We are targeting the **stable release for Q3/Q4 2026**."_                                   |
| Beta recap post                      | WebFetch of [effect.website/blog/effect-v4beta-launch-to-may-recap](https://www.effect.website/blog/effect-v4beta-launch-to-may-recap)                                                 | Discusses HTTP feature work at length; graduation timelines and observability are **absent**.                                                       |
| GitHub releases                      | `gh api repos/Effect-TS/effect/releases --paginate`                                                                                                                                    | Per-package tags mirroring the changelog. No roadmap release notes.                                                                                 |

**The strongest single datapoint:** across **110 published pre-release versions** spanning **2026-02-18 → 2026-08-14** (`npm view effect time --json`: `4.0.0-beta.0` at `2026-02-18T14:51:52Z`, `4.0.0-rc.109` at `2026-08-14T01:28:35Z`), **not one module graduated out of `unstable/`**. The only namespace movement in that window was _into_ the unstable export map (`encoding`, per **C1**).

`4.0.0` stable is targeted for Q3/Q4 2026 per the RC post, but that target belongs to the **stable-semver core**. Nothing ties it to `unstable/`, and the contract explicitly permits `unstable/` to keep breaking in `4.1`, `4.2`, … after stable ships. **Treat "stable 4.0.0 ships" and "http/observability stop moving" as unrelated events.**

---

## 4. `@effect/platform` 4.x: superseded, not planned, but still alive on v3

**No 4.x exists and none is planned.** `npm view @effect/platform versions --json` returns 532 versions ending at `0.97.1`; `dist-tags` is `{"latest": "0.97.1"}`. Its contents were absorbed into core `effect` under `unstable/http` — `references/effect/MIGRATION.md:22-26`:

> Many previously separate packages have been merged into the core `effect`
> package. Functionality from `@effect/platform`, `@effect/rpc`,
> `@effect/cluster`, and others now lives directly in `effect`.

and the beta post's "A consolidated core" section:

> The principle is simple: core abstractions live in `effect`. Separate packages provide the concrete implementations that connect those abstractions to specific runtimes, databases, APIs, and frameworks.

The v3→v4 rename map confirms it module-by-module (`references/effect/migration/v3-to-v4.md`, and reproduced at `effect-4.md:184-190`): `@effect/platform/HttpClient -> effect/unstable/http/HttpClient`, etc.

**Two caveats worth writing down:**

1. **`@effect/platform` is still being maintained on the v3 line.** `npm view @effect/platform time.modified` → `2026-07-30T04:29:16Z`. That is two weeks before the v4 RC. It is not abandoned; it is frozen at v3 while v4's replacement lives under `unstable/`. So "stay on `@effect/platform`" is a real, if terminal, option — it just means staying on `effect@3` (`npm view effect dist-tags` → `{"latest": "3.22.1", "beta": "4.0.0-beta.107", "rc": "4.0.0-rc.109"}`), which `effect-4.md` §D1 already rejects.
2. **The `references/effect/packages/platform/` directory is not a revival.** It is a grouping folder for `@effect/platform-{browser,bun,deno,node,node-shared}`, already noted at `effect-4.md:38`.

**The structural consequence.** In v3, HTTP lived in a `0.x` package — semver-wise, _everything_ was a breaking-change candidate, but it was one dependency you could pin independently. In v4, HTTP lives inside the same artifact as `Effect`, `Layer`, and `Schema`, so **you cannot pin the churn-prone half separately from the stable half**. Upgrading `effect` to get a `Schema` fix necessarily takes whatever happened in `unstable/http`. That coupling is the real change, and it is what makes ADR-0002's range choice load-bearing.

---

## 5. Observed churn

### 5.1 The "rc series" is three days old — measure the whole pre-release instead

The issue asks about churn "across the rc series". That series is far shorter than it sounds: `npm view effect time --json` shows **exactly two rc versions published** — `4.0.0-rc.108` (2026-08-12T14:03:51Z) and `4.0.0-rc.109` (2026-08-14T01:28:35Z) — against **105 betas** (`4.0.0-beta.0` → `4.0.0-beta.107`). Any rc-only churn measurement has a three-day window and is meaningless. The figures below therefore cover the whole `4.0.0` pre-release series, with the rc window called out separately.

### 5.2 Commit-level churn (GitHub commits API, path-scoped to `main`)

|                                                  | `packages/effect/src/unstable/http` | `packages/effect/src/unstable/observability` |
| ------------------------------------------------ | ----------------------------------- | -------------------------------------------- |
| Total commits on `main`                          | **232**                             | **67**                                       |
| First commit                                     | 2025-06-27                          | 2025-08-08                                   |
| Latest commit                                    | 2026-08-14                          | 2026-08-14                                   |
| During the beta series (2026-02-18 → 2026-08-10) | **105** (≈0.61/day)                 | **37** (≈0.21/day)                           |
| Last 90 days (2026-05-16 → 2026-08-14)           | **65**                              | **32**                                       |
| Last 30 days (2026-07-15 → 2026-08-14)           | **43**                              | **12**                                       |
| During the rc series (2026-08-12 → 2026-08-14)   | **3**                               | **1**                                        |

Reproduce with `gh api "repos/Effect-TS/effect/commits?path=packages/effect/src/unstable/http&per_page=100" --paginate`.

Two readings of the table:

- **Churn is not decaying as the RC approaches.** `unstable/http` took 43 commits in the last 30 days — 41% of its entire beta-series total, in 17% of the time. `unstable/observability` took 32 of its 67 lifetime commits in the last 90 days. Whatever "RC" signals about the stable core, it does not describe these two directories.
- **Both directories changed _after_ `rc.109` was cut.** `rc.109` was published at 2026-08-14T01:28:35Z. `4026e2dd` ("Improve tracing performance in span creation and HTTP tracer middleware", #7248) landed at 03:32:56Z and `9761c3c4` ("Share tracer hex ID generation", #7251) at 10:16:14Z — both are in the submodule HEAD, both post-date the newest published tag. Within eleven hours of an RC publish, both namespaces had moved again.

The pre-2026-02-18 commits are genuine: v4 was developed in `Effect-TS/effect-smol` and merged into `Effect-TS/effect` with history intact — the earliest path commits carry `effect-smol`-era PR numbers (`9b2c3e71` "build exports based on .index.ts (#183)", 2025-06-27), and beta-era changelog entries still link to `Effect-TS/effect-smol` PRs (e.g. `packages/effect/CHANGELOG.md`, the `4.0.0-beta.89` entry cites `effect-smol#2480`).

### 5.3 Changelog-level churn, and which changes were breaking

Parsing all 110 version sections of `references/effect/packages/effect/CHANGELOG.md`: 920 total entries, of which **38 touch `unstable/http` module names across 25 releases** and **12 touch `unstable/observability` / `Otlp*` across 7 releases**. (Commit counts are 6× higher because most commits ship without a changeset; the changelog is a floor, not a census. A handful of the 38 are `unstable/httpapi` entries that reach into `unstable/http` types.)

**Breakingness cannot be read off the changeset bump type.** Across all 110 releases only `4.0.0-beta.0` carries a `### Major Changes` section, and only betas `.18`, `.28`, `.103`, `.104` carry `### Minor Changes`. **Every single change in the entire rc series is labelled `Patch`** — including the ones below that rename options and change types. During `pre` mode the bump type is not a stability signal, so each entry has to be read.

**`unstable/http` — changes that would break a consumer:**

| Version    | Change                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `beta.7`   | _"align HttpClientRequest constructors with http method names"_ and _"remove body restriction for HttpClientRequest's"_ (#1369) — constructor rename.                                                                                                                                                                                                                   |
| `beta.10`  | _"Rename `HttpClient.retryTransient` option `mode` to `retryOn` and rename `"both"` to `"errors-and-responses"`."_ (#1383) — an option key **and** an option value renamed in one release.                                                                                                                                                                              |
| `beta.12`  | \*"Fix `HttpClient.retryTransient` autocomplete leaking `Schedule` internals by splitting the `{...}                                                                                                                                                                                                                                                                    | Schedule` union into separate overloads."\* (#1443) — signature reshape. |
| `beta.21`  | _"Constrain `HttpServerRequest.source` to `object`"_ (#1552) — type narrowing on a public field.                                                                                                                                                                                                                                                                        |
| `beta.31`  | _"the `json` property on `HttpIncomingMessage`, `HttpClientResponse`, `HttpServerRequest`, and `HttpServerResponse` now returns `Effect<Schema.Json, E>` instead of `Effect<unknown, E>`."_ (#1710) — return type change on four public modules at once.                                                                                                                |
| `beta.104` | _"Vendor the multipart parser as `effect/unstable/http/MultipartParser` … and remove the external `multipasta` dependency."_ (#7012), plus _"Explicit `content-type` and `content-length` values applied with `HttpServerResponse.setHeader` or `setHeaders` now override body-derived values."_ (#6934) — dependency removal and a header-precedence behaviour change. |

**`unstable/observability` — same:**

| Version    | Change                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beta.48`  | _"disable tracer propagation for otlp exporter"_ (#2023) — behaviour change.                                                                                                                                                                                                                                                                                                                                                            |
| `beta.78`  | _"clean up otlp config"_ (#2334) — undocumented scope.                                                                                                                                                                                                                                                                                                                                                                                  |
| `beta.102` | _"Add manual flushing to the OTLP exporters through a shared `Flusher` service exposed by each signal layer. **The signal layer output types now include `Flusher`, and `OtlpExporter.make` requires it** so custom exporters register unconditionally."_ (#6641, merged 2026-07-26) — a new service in the output type of every signal layer. Anyone writing `Layer` types by hand, or calling `OtlpExporter.make`, is broken by this. |

**The sharpest single finding — a semantic reversal within eight weeks, both landed as `patch`:**

- 2026-06-03, `beta.77` / [effect-smol#2326](https://github.com/Effect-TS/effect-smol/pull/2326) "Change otlp resource attribute precedence" — PR body in full: _"Environment provided attributes should win."_ Changelog: _"Prefer OTEL resource environment variables over explicit `OtlpResource.fromConfig` options."_
- 2026-07-29, `beta.103` / [effect#6746](https://github.com/Effect-TS/effect/pull/6746) "Prefer explicit OTLP resource configuration" — _"prefer explicit `serviceName` and `serviceVersion` options over matching resource attributes and OTEL environment configuration"_. Resolves [#6742](https://github.com/Effect-TS/effect/issues/6742), titled _"OTLP resource precedence reversed in v4: ambient `OTEL_SERVICE_NAME` overrides explicit service name"_.

The precedence between explicit config and ambient `OTEL_*` environment variables was flipped, shipped, reported as a bug, and flipped back — inside the beta series, with no type-system signal at either end. **This is the shape of `unstable/observability` breakage solidifront should plan for: not a compile error, but a silent change in which configuration wins.** A storefront whose spans quietly re-attribute themselves to a different `service.name` after a patch upgrade is the concrete failure mode, and it is invisible to `tsc` and to any test that does not assert on resource attributes.

---

## 6. Escape hatches, shims, and migration story

### 6.1 There is no shim, and no migration guide for either module

- `references/effect/migration/` contains 14 guides — `cause`, `equality`, `error-handling`, `fiber-keep-alive`, `fiberref`, `forking`, `generators`, `layer-memoization`, `runtime`, `schema`, `scope`, `services`, `yieldable`, `v3-to-v4`. **None covers `http` or `observability`.** `migration/schema.md` is about the stable top-level `Schema`, not `effect/unstable/schema` (a distinction `effect-4.md:360-365` already establishes).
- `grep -rn -il "codemod\|compatibility layer\|compat shim"` over `MIGRATION.md` and `migration/` → no hits.
- Nothing re-exports `unstable/*` from a stable path. The `exports` map (`packages/effect/package.json:33-50`) maps each unstable subpath straight at its source directory; the stable catch-all is `"./*": "./src/*.ts"`, which cannot reach into `unstable/`.
- `@effect/api-diff` (`references/effect/packages/tools/api-diff/README.md`) can diff two revisions' declarations, but disclaims the job you would want it for: _"Its JSON output is canonical; the Markdown report is intended for migration review and **does not make semantic-version compatibility claims**."_ It detects that a symbol moved; it will not tell you whether an upgrade is safe.

So the documented migration story for an `unstable/` break is: **read the changelog**. That matches the beta post's own framing (_"just like before, we will document changes in each release in the package changelog"_), and it is worth naming plainly — for solidifront, "read the changelog" is a per-upgrade human review, not a mechanical check.

### 6.2 Observability has one real escape hatch; HTTP has none

`@effect/opentelemetry@4.0.0-rc.109` imports **nothing** from `unstable/` — `grep -rn "unstable/http\|unstable/observability" packages/opentelemetry/src/` returns nothing, and its source is exactly `NodeSdk`, `WebSdk`, `OtelLogger`, `OtelMetrics`, `OtelTracer`, `Resource`. Its `package.json` has `dependencies: null` and peers only on `@opentelemetry/*` (nine packages) plus `effect`. It sits entirely on the **stable** `Tracer`/`Logger`/`Metric` interfaces in core.

That makes it a genuine fallback for the OTEL pillar, at the cost `effect-4.md:791` already priced: the OpenTelemetry JS SDK in the bundle, which is exactly what §D5 chose `unstable/observability` to avoid. The tradeoff is now explicit — **`unstable/observability` buys bundle size and pays in stability; `@effect/opentelemetry` is the reverse.**

For `unstable/http` there is no equivalent. `HttpClient` has no stable-namespace counterpart, and the fallback is bare `fetch` — i.e. abandoning the Effect HTTP layer, its typed errors, its tracing integration (`HttpTraceContext`, `effect-4.md:757`), and `FetchHttpClient.Fetch` as a test seam (`docs/research/README.md`). That is not an escape hatch; it is a rewrite.

### 6.3 Version-range mechanics: the caret admits the break

The Effect team publishes its own first-party packages with a caret range on `effect`. In-repo they are `"effect": "workspace:^"` (`packages/opentelemetry`, `packages/platform/node`, `packages/platform/browser`, `packages/atom/solid`, `packages/vitest`, `packages/sql/pg` — all identical), which publishes as `^4.0.0-rc.109` (`npm view @effect/opentelemetry@rc peerDependencies.effect`, same for `@effect/platform-node`, `@effect/platform-browser`, `@effect/vitest`).

Verified with `npx semver@7 -r "^4.0.0-rc.109"`:

| candidate      | satisfies `^4.0.0-rc.109`? |
| -------------- | -------------------------- |
| `4.0.0-rc.110` | yes                        |
| `4.0.0`        | yes                        |
| `4.0.1`        | yes                        |
| **`4.1.0`**    | **yes**                    |
| **`4.9.0`**    | **yes**                    |
| `4.1.0-rc.1`   | no                         |
| `5.0.0`        | no                         |

**A caret range is precisely the range in which `unstable/` is licensed to break.** The contract permits breaking changes in minors; `^4.0.0-*` admits every minor up to `5.0.0`. So the default, idiomatic, upstream-endorsed range is the one that guarantees exposure. If solidifront wants the ADR-0002 range to actually mean something, it has to be tighter than what Effect itself ships — e.g. `>=4.0.0 <4.1.0`, which the same tool confirms admits `4.0.5` and rejects `4.1.0`.

---

## 7. Why this matters for solidifront

`docs/adr/0002-effect-and-solid-js-are-peer-dependencies.md` makes `effect` a peer dependency of every package, for a correctness reason (v4 keys `Context` tags by string, so two copies of `effect` produce two distinct tags and service resolution fails). Its stated consequence:

> More significantly, **the supported Effect version range becomes public API**. Widening it later is harmless; narrowing it is a breaking change.

Combine that with §2 and §6.3 and the mechanism is exact:

1. Effect ships `4.1.0`. Under the contract, `unstable/http` or `unstable/observability` may break in it.
2. If solidifront's peer range is a caret, consumers pull `4.1.0` on a fresh install and solidifront breaks in _their_ tree, with solidifront's published range still claiming compatibility.
3. If solidifront instead narrows the range to exclude `4.1.0`, that narrowing is itself a **breaking change** per ADR-0002 — a solidifront major.

**Either branch is a major.** There is no version-range policy that makes an upstream `unstable/` break an internal upgrade. That is the honest answer to "what is the blast radius": _ADR-0002 converts every upstream unstable break into a solidifront major release._

> **⚠️ CORRECTED by [#26](https://github.com/KookiKodes/solidifront/issues/26) / [ADR-0020](../adr/0020-a-peer-range-is-bounded-only-where-upstream-licenses-a-break.md).** The second sentence stands; **the first is half wrong, and it is the half that decides the range.**
>
> Branch 3 above is not forced. When Effect ships `4.1.0` under a bounded range, nobody's install moves — so the repair is not "narrow to exclude `4.1.0`" but **widen to admit it**, after absorbing the break internally. Widening is free per ADR-0002, and `unstable/http` is internal transport rather than solidifront's public API, so that is a solidifront **minor**; consumers still on `4.0.x` are untouched. A major is forced only where the break **cannot be absorbed across both minors** — where supporting `4.1` means dropping `4.0`.
>
> So the caret branch guarantees a major and the bounded branch risks one. The corrected blast radius is _a reviewed minor per Effect minor, and a major only when a break is unabsorbable_ — which is what makes §7.3(1)'s recommendation load-bearing rather than merely tidy.

### 7.1 Surface area exposed

**HTTP.** `packages/storefront-client/src/services/StorefrontClient.ts:1-6` imports six modules that all become `effect/unstable/http/*` after migration (`FetchHttpClient`, `HttpBody`, `HttpClient`, `HttpClientError`, `HttpClientRequest`, `HttpClientResponse`), plus two more in `packages/storefront-client/tests/requests.test.ts:1-2`. `references/effect/packages/effect/src/unstable/http/` is **30 modules, ~510 `export` statements**.

**Observability.** `references/effect/packages/effect/src/unstable/observability/` is **9 modules, ~51 `export` statements** — `Otlp`, `OtlpExporter`, `OtlpLogger`, `OtlpMetrics`, `OtlpResource`, `OtlpSerialization`, `OtlpTracer`, `PrometheusMetrics`.

Per `docs/research/README.md:38` and `:75`, two of the seven v1 pillars (client, cart, auth, analytics, markets, **OTEL**, E2E — plus the client's transport) sit on this namespace.

### 7.2 The coupling multiplies the risk, it does not add to it

`unstable/observability` is **built on** `unstable/http`. Six of its nine modules import from it directly:

```
packages/effect/src/unstable/observability/OtlpExporter.ts:23-27      Headers, HttpClient, HttpClientError, HttpClientRequest, HttpBody
packages/effect/src/unstable/observability/Otlp.ts:15-17              Headers, HttpClient, HttpClientRequest
packages/effect/src/unstable/observability/OtlpTracer.ts:26-27        Headers, HttpClient
packages/effect/src/unstable/observability/OtlpLogger.ts:23-24        Headers, HttpClient
packages/effect/src/unstable/observability/OtlpMetrics.ts:23-25       Headers, HttpBody, HttpClient
packages/effect/src/unstable/observability/OtlpSerialization.ts:12    HttpBody
packages/effect/src/unstable/observability/PrometheusMetrics.ts:14-15 HttpRouter, HttpServerResponse
```

So the two pillars are not independent bets. **A breaking change in `HttpClient` or `Headers` hits the client transport _and_ the OTEL pillar simultaneously.** `beta.31`'s `json`-property retype (§5.3) is exactly this shape of change.

And `unstable/http` in turn reaches into two further unstable namespaces:

```
packages/effect/src/unstable/http/HttpClient.ts:34          type RateLimiter from ../persistence/RateLimiter.ts
packages/effect/src/unstable/http/HttpServerRequest.ts:28   Socket from ../socket/Socket.ts
```

The transitive unstable surface under a single `import { HttpClient } from "effect/unstable/http"` is therefore `http` + `persistence` + `socket`; add `observability` and it is four of the eighteen unstable namespaces.

### 7.3 What follows

Stated as implications of the findings, not as decisions — the decisions belong in an ADR.

1. **The peer range in ADR-0002 should be minor-bounded, not caret.** `>=4.0.0 <4.1.0` is the range that matches what the contract actually guarantees. Widening later is free per ADR-0002; the caret cannot be tightened for free. This is the one choice that is cheap now and expensive later.
2. **Budget an upgrade review per Effect minor, not per major.** The documented migration story is "read the changelog" (§6.1), and changeset bump types are useless as a filter (§5.3).
3. **The OTEL pillar has a fallback and the client pillar does not** (§6.2). That asymmetry should inform sequencing: the client's `unstable/http` exposure is unavoidable and permanent, so it is the one to design a seam around.
4. **`FetchHttpClient.Fetch` as a test seam is worth more than it looks.** It is already the only place solidifront swaps the transport, which makes it the natural chokepoint if `HttpClient`'s surface moves.
5. **Add a CI check that pins the observed `effect` version and asserts on OTLP resource attributes.** §5.3's precedence reversal is the documented failure mode that no type check catches.

> **⚠️ (5) is MOOT, by [#26](https://github.com/KookiKodes/solidifront/issues/26).** #26 took §6.2's escape hatch: server OTEL moves to `@effect/opentelemetry` and browser OTEL is out of v1, so `unstable/observability` leaves solidifront's path entirely and the OTLP precedence bug is no longer a risk to assert against. Choosing insulation deleted the risk **and** the tripwire built for it. The replacement is a typecheck-and-test canary over the remaining exposure (`unstable/http` + `persistence` + `socket`), specified in ADR-0020 — which catches type-level breaks and explicitly does _not_ catch silent behavioural ones. Recommendations (1)–(4) stand; (1) is adopted with §7's correction above applied.

---

## 8. Open questions

Things I could not establish from primary sources. Stated as unknowns rather than guessed.

1. **Whether the Effect team has stated a graduation timeline anywhere I cannot read.** The issue text names Discord as a source. GitHub Discussions are **disabled** on `Effect-TS/effect` (`discussionCategories` → empty), and I have no Discord access from this environment, so maintainer statements in Discord are unchecked. Given the repo has no milestones and no roadmap issue, I judge it unlikely a firm date exists — but "no plan found" is what I verified, not "no plan exists". **Cheapest resolution: ask in the Effect Discord, or open a GitHub issue asking for the graduation criteria for `http` and `observability`.** `effect-4.md:167` already recommends the issue-filing tactic for the `atom-solid` question and cites #6486 as evidence it works.
2. **What "mature" means operationally.** No criteria are published (§2). Whether graduation is gated on API stability, test coverage, adoption, or a maintainer's judgement is unknown, so there is no leading indicator to watch. A proxy worth tracking: the commit rate in §5.2 — a sustained drop would be the first observable sign.
3. **Whether the graduation itself will be breaking.** The contract says modules "graduate to the top-level `effect/*` namespace", which implies the import path changes from `effect/unstable/http/HttpClient` to something like `effect/http/HttpClient`. Whether the old path is kept as a deprecated alias, for how long, and whether the graduating release also reshapes the API is **entirely unspecified**. There is no precedent to reason from — zero modules have graduated (§3). This is the single largest unquantified risk here: a _successful_ stabilisation may cost solidifront a major just the same.
4. **Whether `@effect/tsgo`'s `outdatedApi` rule detects unstable-namespace drift.** `effect-4.md:1207ff` §9.9 establishes it covers v3→v4 renames, and its rename table is compiled into `node_modules/@effect/tsgo/dist/effect-tsgo.cjs`. I did not check whether it also flags within-v4 `unstable/` churn. If it does, it is a mechanical check that would materially cheapen recommendation 7.3(2). Worth ~30 minutes to test.
5. **Whether the breaking changes in §5.3 are exhaustive.** They were extracted from changelog prose across 110 releases. Commit counts are 6× the changeset counts (§5.3), so **breaking changes that shipped without a changeset would not appear**. A true answer needs `pnpm api-diff --base-ref <tag> --head-ref <tag>` between two published versions, restricted to the two entrypoints — a real experiment I did not run. It would also produce a reusable per-upgrade check.
6. **Whether `PrometheusMetrics` is in solidifront's path at all.** It is the only observability module coupled to `HttpRouter`/`HttpServerResponse` (server-side surfaces) rather than `HttpClient`. If the OTEL pillar only ever uses the `Otlp*` modules, the `unstable/http` coupling narrows to `HttpClient`/`Headers`/`HttpBody`/`HttpClientRequest`/`HttpClientError` — a smaller and more stable subset. Not decided in `docs/research/otel-and-testing.md` as far as I read.
7. **The rc.109 snapshot goes stale fast.** `main` was already ahead of the newest published tag when read, and both directories changed within eleven hours of the rc.109 publish (§5.2). The churn table is cheap to regenerate — re-run the two `gh api …/commits?path=…` calls — and should be re-run before any range decision is finalised, not taken from this document.
