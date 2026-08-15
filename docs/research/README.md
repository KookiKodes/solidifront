# Solidifront restructure — research synthesis

**Date:** 2026-08-14
**Status:** research complete; no decisions made yet
**Inputs:** five cited documents in this directory, 5,224 lines, all claims traced to source

This is the entry point. Each finding below is stated in one line and links to the document that proves it. Nothing here is a decision — this is the evidence a decision would rest on.

| Document | Answers | Source read |
|---|---|---|
| [solid-2.md](./solid-2.md) | Solid 2.0 API delta, the plugin/start-mode contract, ownership, async | `references/solid@next` `1597530` + `v2.solidjs.com` (141 pages) |
| [effect-4.md](./effect-4.md) | v3→v4 delta, layers as public API, OTLP, Effect↔Solid interop | `references/effect@main` `6eebd0a` (`4.0.0-rc.109`) |
| [shopify-domain.md](./shopify-domain.md) | Client, typegen, cart, auth, analytics, markets | `references/hydrogen@preview` `50b7874` (`2026.10.0-preview.0`) |
| [current-state-audit.md](./current-state-audit.md) | What exists, what's rotten, what shouldn't survive | this repo + npm metadata |
| [otel-and-testing.md](./otel-and-testing.md) | OTEL through the stack, E2E without a live store | OTel specs, `mock.shop`, Hydrogen's own suite |

### Follow-ups

Single-question documents opened by the unknowns above, each answering one issue.

| Document | Answers | Source read |
|---|---|---|
| [solid-2-library-builds.md](./solid-2-library-builds.md) | How to build and publish a *library* for Solid 2.0 | `references/solid@next` `1597530`, `solid-router@next`, published tarballs |
| [effect-unstable-stability.md](./effect-unstable-stability.md) | [#23](https://github.com/KookiKodes/solidifront/issues/23) — how long `effect/unstable/{http,observability}` stays unstable; carried-forward unknown #5 | `references/effect@main` + upstream issues/PRs |
| [effect-gen-overhead.md](./effect-gen-overhead.md) | [#25](https://github.com/KookiKodes/solidifront/issues/25) — is the `Effect.gen`/`Effect.fn` overhead premise still true in v4? Measured, not inferred | `effect@4.0.0-rc.109` + `tinybench` on this machine |
| [shopify-consent.md](./shopify-consent.md) | [#24](https://github.com/KookiKodes/solidifront/issues/24) — consent for headless analytics, and where the two Hydrogens diverge; carried-forward unknown #6 | `references/hydrogen@preview` `50b7874` + `Shopify/hydrogen@main` via `gh` |
| [shopify-consent-tokenless.md](./shopify-consent-tokenless.md) | [#28](https://github.com/KookiKodes/solidifront/issues/28) — is preview's tokenless headless consent call supported by the shipped consent-tracking-api v0.2? Resolves `shopify-consent.md` §9 open questions #1 and #7 | the four Shopify CDN scripts, read and SHA-256-pinned, plus live HTTP probes against four storefronts |

---

## The three things that shape everything else

### 1. Every piece of prior art is exactly one major version behind

This is the defining fact of the restructure. The work you'd want to build on exists, is good, and is unusable as-is.

| Prior art | What it gives you | Why you can't use it |
|---|---|---|
| `@effect/atom-solid` | first-party Effect↔Solid binding, proven architecture, 400ms idleTTL disposal debounce | peer `solid-js >=1.9.14 <2.0.0`; zero source changes across the v4 transition; **nothing planned** for Solid 2.0 |
| Hydrogen `examples/solid-start` | complete SolidStart storefront on framework-agnostic core, 25 `@shopify/hydrogen` imports | Solid 1.9.5 + vinxi; and it has **no tests at all**, so it's prior art for structure only |
| `@solidjs/start@2.0.0` | de-vinxi'd, shipped stable | depends on `solid-js ^1.9.14` — it is a **Solid 1.9** framework |

Nothing is wasted: all three are readable, and their architectures are validated. But each represents a port someone has to write, and right now that someone is you.

### 2. The ground is still moving, unevenly

Solid 2.0 and Effect 4.0 are both RC. That is survivable — what matters is *which parts* are load-bearing.

- **Effect v4** hit RC on 2026-08-12 (`rc.109`), with "no more broad breaking changes planned". The beta.106→rc.109 tree diff found exactly **one** substantive change. This is stable enough to target.
- **But `@effect/platform` has no 4.x at all.** HTTP and observability both live under `effect/unstable/*`, which the Effect team reserves the right to break in minors. Two of your seven v1 pillars sit on `unstable/`.
- **Solid 2.0 start mode is inside the RC surface** — less risky than its "experimental" label suggests. Server components and `/frames` are the genuinely unstable parts.
- **The Solid 2.0 library-authoring build story is unestablished.** `esbuild-plugin-solid` and `tsup-preset-solid` have no `next` tags and no identified successors. This repo exists to publish libraries.

### 3. Half of what you'd be restructuring was never finished

The audit is blunt about this and it changes the framing. `packages/start/src/storefront/index.ts` exports only `createAsyncQuery` and `createQueryCache`. There is no cart handler, no mutation action, no customer account. `createMutationAction` exists **solely as commented-out code**, and `examples/basic` imports it — so the example does not compile. `packages/start/README.md` is a TODO list saying exactly this.

So this is less "restructure a working library" and more "finish a library, on new foundations." That is a different project, and probably a smaller one than it looks.

---

## Live bugs — these are broken now, independent of the restructure

Worth fixing on `next` regardless of what the restructure decides.

1. **The library prevents you from using a supported Shopify API version.** `packages/storefront-client/src/schemas.ts:45-78` hard-codes a closed `S.Literal` union ending at `2025-10`, defaulting to `2025-04`. A tokenless `publicApiVersions` query against `mock.shop` confirms the supported set is `2025-10`, `2026-01`, `2026-04`, `2026-07` (latest). **The default is past end-of-support**; users are silently falling forward to a different version than they asked for. `2025-10` dies 2026-10-16, at which point the only expressible version is gone.
2. **A published package ships an unresolvable type import.** `@solidifront/vite-plugin-generate-shopify-locales@1.2.8`'s `/locales` `.d.ts` imports from `@solidifront/codegen/storefront-api-types`, which is not one of its dependencies — and `@solidifront/codegen` is npm-deprecated by its own author.
3. **`@solidifront/start`'s build works by luck.** `scripts/afterBuild.ts` reaches sideways to `path.resolve("..", "codegen")` for vendored schemas. It is not a declared workspace dependency, so `turbo`'s `dependsOn: ["^build"]` does not order it.
4. **There is no CI.** No `.github/`, no `test` or `typecheck` task in `turbo.json`, no package defines a `lint` script. Every recommendation in every one of these documents is unenforceable until something runs on every PR.

---

## Decisions the research forces

Ranked by how much else depends on them. These are wayfinder decision-ticket candidates, not tasks.

**D1 — Build on Hydrogen core, or independently on Effect?**
Shopify has made "framework-agnostic core + thin bindings" first-party, with a Solid example already sketched. Writing Solid bindings over their core is a fundamentally different project from an Effect-native library: different scope, different maintenance burden, different failure mode when Shopify moves. Nearly everything else depends on this.

**D2 — Effect↔Solid: adopt, port, fork, or hand-roll?**
Two cheap moves settle this before any commitment: file an upstream issue asking about Solid 2.0 support for `@effect/atom-solid` (issue #6486 shows bindings get added on request), and run a ~1hr install-and-see against the RC.

**D3 — How do Effect and Solid's async models actually reconcile?**
The hardest technical constraint found: *"Reads made after an `await` do not create dependency edges."* Dev escalates to `Errored`; production fails silently. `Effect.gen` is a generator, so the naive integration is broken by construction. `isDisposed(owner)` is public API and closes the interruption half — Solid doesn't cancel, you guard. **Settle this with a prototype before designing any API.**

**D4 — What is v1, and what is v1.1?**
Seven pillars (client, cart, auth, analytics, markets, OTEL, E2E) while absorbing two upstream RCs is a very large v1. Sequencing is cheaper to decide now than mid-build.

**D5 — Codegen: keep AST-based `@inContext` injection?**
This is solidifront's one defensible technical lead and should be a deliberate keep. Both Hydrogens inject only *variables*, gated on a regex over query text (`/\$country\s*:/`), and neither ever rewrites the document — they structurally can't, because both infer types from the literal source string. Your build-time AST transform escapes that trap and already covers `buyer` and `visitorConsent`.

**D6 — Define `shopify.*` / `cart.*` semantic conventions.**
There are no ecommerce OTel semantic conventions and none are planned (verified four ways). You will define them yourself; that deserves an ADR, not an afterthought.

---

## Where the leverage is

Cheap wins the research surfaced, roughly in order of payoff per unit effort:

- **`mock.shop` changes the economics of E2E entirely.** Official, tokenless Shopify Storefront API serving the whole commerce flow — products, search, `cartCreate`, `cartLinesAdd/Update/Remove`, discount codes, and a **live reachable `checkoutUrl`**. Hydrogen runs its full storefront E2E suite against it on every push and PR with zero secrets. Solidifront can too.
- **You are one layer away from your first trace span.** `StorefrontClient.ts:162` already uses `Effect.fn("executeRequest")` — the traced variant. Provide a tracer layer and the span appears with no code change.
- **Most OTEL work is a migration, not new code.** The existing `withNamespacedLogSpan` and six `annotateLogsScoped` calls are *log* decorations producing no OTEL output. The work is largely `annotateLogs` → `annotateCurrentSpan`.
- **A test seam already exists and is unused.** `FetchHttpClient.Fetch` resolves the transport per-request off fiber context, so `Effect.provideService` at the call site overrides it — the Effect entry point is testable today with zero mocking libraries. The Promise facade has no such seam; give it one.
- **Cart extensibility is unsolved in both Hydrogens** — classic's `customMethods` is literally `{...methods, ...customMethods}` with no way to delegate to the default. An Effect `Layer` beats that outright. Clearest place to be better than the reference implementation.

---

## Carried-forward unknowns

The honest list. Full versions live in each document's "Open questions" section.

1. Exact blast radius of Solid 2's synchronous-tracking rule on Effect-based data flow (**D3** — prototype, don't reason).
2. Whether `@solidjs/vite-plugin` exposes an importable SSR handler. If not, the recommended L3 test layer collapses into L4 and MSW-in-server-entry becomes the only SSR mocking seam.
3. Whether a first-party Solid binding ships for Hydrogen core (**D1**).
4. Whether `@effect/atom-solid` gains Solid 2.0 support (**D2**).
5. How long `effect/unstable/{http,observability}` stays unstable. **Answered** — [effect-unstable-stability.md](./effect-unstable-stability.md).
6. Consent configuration for headless analytics — divergent between the two Hydrogens, and compliance-relevant. **Answered** — [shopify-consent.md](./shopify-consent.md); its highest-risk residual, whether preview's *tokenless* consent call is supported, is answered "yes, by design" in [shopify-consent-tokenless.md](./shopify-consent-tokenless.md), which replaces it with a concrete prerequisite: solidifront must ship a same-origin Storefront API proxy at `/api/(unstable|YYYY-MM)/graphql.json` or consent silently never loads.

---

## Suggested sequencing

1. **Fix the live bugs** (API version union, the broken published `.d.ts`) — they affect users today and don't depend on any restructure decision.
2. **Stand up CI** — nothing else is enforceable without it.
3. **Prototype D3**, the async/reactivity bridge. It's the highest-risk unknown and the cheapest to de-risk.
4. **Fire the two cheap probes for D2** (upstream issue + install-and-see).
5. **Then `/wayfinder`**, with D1 as the first decision ticket.
