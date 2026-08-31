# A peer range is bounded only where upstream licenses a break

[ADR-0002](./0002-effect-and-solid-js-are-peer-dependencies.md) makes the supported peer range public API and closes by instructing that the initial range be chosen deliberately. This is that choice: **`effect` is minor-bounded, `solid-js` takes `^2.0.0`, and the asymmetry is a rule about documented break licences rather than a fact about two libraries.** Decided in [#26](https://github.com/KookiKodes/solidifront/issues/26).

```jsonc
// every package whose Context tags can reach the consumer's Runtime
"peerDependencies": {
  "effect": ">=4.0.0 <4.1.0",   // bounded: unstable/* may break in minors
  "solid-js": "^2.0.0"          // unbounded: no break licence
}
```

## The rule

> A peer dependency's declared range is bounded below the next minor **if and only if** upstream documents a reservation of the right to make breaking changes within a range semver would otherwise treat as safe. Absent such a **break licence**, the range is an ordinary caret.

The test for any future peer is _"does upstream reserve the right to break in minors?"_ — not _"what did we do for Effect?"_. Uniformity across peers would be a policy that reads as principled and is not: a bound that points at no documented hazard is superstition, and it costs a solidifront release per upstream minor to maintain.

`effect` has a licence, verbatim at `references/effect/MIGRATION.md:40-50`: "Modules under `effect/unstable/*` may receive breaking changes in minor releases." No criteria, no owner, no dates, no deprecation window, and — per [#23](https://github.com/KookiKodes/solidifront/issues/23) — no graduation plan anywhere and zero modules graduated in the six months from `4.0.0-beta.0` to `4.0.0-rc.109`. Two of the seven v1 pillars sit on that namespace.

`solid-js` has none. A Solid minor that broke us would be a bug to report, not a licensed act to defend against.

## Why bounded beats a caret for `effect`

Both branches, concretely.

**Caret (`^4.0.0`).** Effect ships `4.1.0` with an `HttpClient` break. Every consumer's fresh install pulls it, solidifront breaks _in their tree_, and solidifront's published metadata still claims compatibility. The only repair is narrowing the range, which ADR-0002 makes a breaking change. **The caret guarantees a major, and spends a consumer's broken install to get there.**

**Bounded (`>=4.0.0 <4.1.0`).** Effect ships `4.1.0`. Nobody's install moves. We read the changelog, absorb the break internally, and publish a **widened** range — free per ADR-0002. Since `unstable/http` is internal transport and not solidifront's public API, that is a solidifront **minor**, and consumers still on `4.0.x` are untouched.

The bounded branch costs a major only where a break **cannot be absorbed across both minors** — where supporting `4.1` means dropping `4.0`. So the honest price of the `unstable/` exposure is _a reviewed minor per Effect minor, and a major only when a break is unabsorbable_.

**This corrects [`effect-unstable-stability.md`](../research/effect-unstable-stability.md) §7**, which concluded _"Either branch is a major. There is no version-range policy that makes an upstream `unstable/` break an internal upgrade."_ The second sentence is right; the first is half wrong, and it is the half that decides the range. Only the caret branch guarantees a major.

Exactly bounding (`4.0.0` alone) is not an option: a peer range that admits one version conflicts with any consumer who also depends on `effect` directly, which ADR-0002's whole existence assumes they might.

## The floor, and why v1.0.0 waits

There is no `effect@4.0.0` — only `4.0.0-rc.112`. Semver excludes prereleases from `>=4.0.0 <4.1.0`; that range admits `4.0.0` and `4.0.5` and **rejects** `4.0.0-rc.112`. A floor today must therefore name a prerelease. `solid-js` is in the same position: `latest` is `1.9.15`, and Solid 2.0 lives on `next` at `2.0.0-rc.4`.

**Raising a floor is narrowing, and narrowing is a breaking change.** So a _stable_ solidifront v1 with a prerelease floor takes a major every time the rc line breaks — `unstable/http` took 28 commits in August 2026, most recent the day before this decision, at roughly three rcs per 17 days. That is not a range policy; it is a version-number treadmill.

Therefore: **solidifront v1.0.0 does not predate `effect@4.0.0` and `solid-js@2.0.0`.** Until both ship, solidifront publishes `1.0.0-rc.*`, where a floor moves freely because a prerelease carries no compatibility promise. Solid 2.0 has no published target date where Effect's is "Q3/Q4 2026", so **Solid is the binding constraint.**

Rejected: exempting floor-raises from ADR-0002's narrowing rule during the upstream prerelease window. It gives ADR-0002's central promise a silent carve-out, and a consumer cannot tell from the declared range which regime they are in.

## Build-time code is exempt, by the tag-crossing rule

ADR-0002 says _every_ package declares these peers. Its justification is **identity**: two copies of `effect` produce two string-keyed `Context` tags and service resolution fails silently; two copies of `solid-js` produce two reactive graphs. That argument reaches exactly as far as the shared runtime does.

> A package declares `effect` as a **peer** if and only if a `Context` tag it creates can reach the consumer's **Runtime**. Otherwise it declares `effect` as a direct dependency.

`@solidifront/vite` is the **build-time surface** — it runs in the consumer's Vite process, and per [ADR-0004](./0004-generated-modules-export-a-layer-not-a-runtime.md) the modules it generates import `effect` from the _consumer's_ tree, not from the plugin's. No tag it creates ever reaches their Runtime, so it takes `effect` as a direct dependency and is insulated from the declared range entirely — free to track rc HEAD.

Stated as a rule rather than a per-package exception, so the next package is classified by the hazard and not by precedent. **This amends ADR-0002.**

## Enforcement

**One range, byte-identical.** pnpm resolves the intersection of every declared peer range, so a drifted range in one package silently tightens or loosens the whole install with nothing in the diff to show it. CI asserts that every runtime package's `peerDependencies.effect` and `.solid-js` are byte-identical.

**A canary, not an api-diff.** A nightly job installs the newest `effect` above the ceiling, typechecks, and runs L1/L2. `@effect/api-diff` was weighed and rejected: it is `private: true` at version `0.0.0` (unpublished, so runnable only from a checkout), `references/effect` is shallow with zero tags and cannot resolve two refs, its README specifies _"detached disposable worktrees with each branch's native build"_ — two full Effect builds per run — and `CLAUDE.md` records that CI deliberately never checks out `references/`. The cost is out of proportion to a version-bump check.

**Its own job, sharing the plumbing.** The canary does not fold into the existing Shopify version canary from [#12](https://github.com/KookiKodes/solidifront/issues/12)/[#46](https://github.com/KookiKodes/solidifront/issues/46). That job fetches and compares against fixtures; this one installs. Sharing one job would put two unrelated flaky axes behind #46's fail-closed rule — _a canary that fails open is not a canary_ — so an npm hiccup would raise an issue implicating the Shopify checks, which is the diagnostic ambiguity #46 was built to prevent. The fail-closed plumbing is extracted as a composite action instead, the pattern `ci.yml` already uses for `.github/actions/setup`.

## Consequences

**Type-level breaks are mechanical; behavioural breaks are a human read.** The canary catches what the compiler catches, which is most of it. It does not catch a silent behaviour change — #23's archetype is OTLP resource precedence between explicit config and ambient `OTEL_*` variables, which was flipped, shipped, reported as [Effect-TS/effect#6742](https://github.com/Effect-TS/effect/issues/6742), and flipped back inside eight weeks, with no type error at any point. Widening the range is therefore gated on a changelog read, and changeset bump types are useless as a filter: every change in the entire rc series is labelled `Patch`.

**`@effect/tsgo`'s `outdatedApi` does not help.** Measured: the rename table compiled into `effect-tsgo.cjs` covers v3→v4 renames and carries no within-v4 `unstable/` drift table. There is no mechanical drift check to lean on, which is why the canary is a typecheck and not a lint.

**Part of the map's release-and-versioning fog is settled.** v1.0.0's timing is now pinned to two upstream stables. Whether v1 ships lockstep or independently versioned is still open, and still waits on topology.

**Graduation may itself cost a major.** #23's open question 3 is unresolved and unresolvable from primary sources: the contract implies a graduating module's import path moves out of `unstable/`, and whether the old path survives as a deprecated alias is unspecified with zero precedent. A _successful_ stabilisation may cost solidifront a major on the same terms as a break. This is the largest unquantified risk the bound does not cover.
