# Is the `Effect.gen` / `Effect.fn` overhead premise still true in Effect v4?

**Research date:** 2026-08-14
**Status:** complete — measured, not inferred
**Answers:** [#25](https://github.com/KookiKodes/solidifront/issues/25); the standing constraint in the `## Notes` block of [#7](https://github.com/KookiKodes/solidifront/issues/7)

**Primary sources:**

- `references/effect` git submodule @ `6eebd0a618308a91f95947bae6e0fb206ae3939d`, branch `main`, packages at `4.0.0-rc.109`. Read: the fiber runtime, `Effect.gen` / `Effect.fn` / `Effect.fnUntraced` implementations, the tracer, `.patterns/effect.md`, `.agents/AGENTS.md`, `ai-docs/`, `LLMS.md`, `MIGRATION.md`, `.changeset/`, `packages/effect/benchmark/`, `packages/effect/runtimeperf/`.
- `Effect-TS/effect` and `Effect-TS/effect-smol` via authenticated `gh` — PRs, issues, commits, contents API.
- `node_modules/@effect/tsgo@0.36.4` + [`Effect-TS/tsgo`](https://github.com/Effect-TS/tsgo) rule docs via `gh api`.
- **Measurement:** `effect@4.0.0-rc.109` installed fresh from npm, `tinybench@6.0.2`, Node **v22.20.0**, AMD Ryzen 9 5900XT under WSL2 (12 logical CPUs visible, 15 GiB RAM). Benchmark sources are reproduced verbatim in §6.

---

## Verdict

**The premise is dead as written. It survives only in a reshaped form that points at a different fix than the one the map adopted.**

The map says: *"Internal library code avoids `Effect.gen` and `Effect.fn`. Prefer pipe-based combinators. Rationale: generator-based code carries runtime overhead."*

Measured against `4.0.0-rc.109`:

1. **Generators are not the cost.** A generator body bound once — `Effect.fnUntraced` — runs a 5-step pipeline in **933–1099 ns** against **916–1129 ns** for the equivalent `pipe(flatMap ×5)`. That is inside run-to-run noise (§5, I1 vs I2). The "avoid generators, prefer pipe" rule buys **nothing** in v4.
2. **The real cost is a fresh `function*` literal evaluated per call**, i.e. the idiom `(args) => Effect.gen(function*() { … })`. That form costs **~1 990 ns** against ~975 ns for the identical body bound once — **~2×** (§5, H1 vs H2/H3). This is a V8 effect, not an Effect one: the same experiment with plain JS generators and no Effect at all shows **950 ns vs 153 ns, ~6×** (§5.4). The fix upstream ships for this is `Effect.fnUntraced`, which is *still a generator*.
3. **`Effect.fn` is expensive, and more expensive than the map assumed — but for the stack frame, not the span.** Unnamed `Effect.fn` costs **~3 200 ns per call** over `fnUntraced` purely to capture a stack frame with a per-call `new Error()` (§3.2, §5 I2 vs I3). Naming it adds a span on top, another **~2 500 ns**.
4. **Tracing is *not* zero-cost when "no tracer is installed" — because there is always a tracer.** `Tracer.Tracer` is a `Context.Reference` whose default value builds real `NativeSpan` objects, and `References.TracerEnabled` defaults to `true` (§3.3). Forcing `TracerEnabled = false` only **halves** span cost; it does not remove it (§5, I4 vs J3).
5. **The map's second-order consequence is wrong.** "Spans must come from explicit `Effect.withSpan` because `Effect.fn` is the traced variant" buys nothing: `Effect.fn("op")` and `pipe + Effect.withSpan("op")` measure the same (**6 322–6 962 ns vs 6 547–6 872 ns**, §5 I4 vs I5) — `Effect.fn`'s named form *calls `useSpan` internally* (`internal/effect.ts:1279`). Choosing `withSpan` over `Effect.fn` is a readability choice, not a performance one.
6. **Upstream's own guidance for library code says the opposite of the map's rule** — and says it in the exact words the map uses. `references/effect/.patterns/effect.md:85-90` lists "Use `Effect.fnUntraced` when: **Building library implementations** / **Performance is critical (hot paths)** / Function is called many times per operation / **Tracing overhead is unacceptable**." Pipe-based combinators are never named as the faster alternative anywhere in the repo.

**The rule that replaces it, if you want one:**

> Internal library code uses `Effect.fnUntraced` for anything that returns an Effect and is called more than once. Never `(args) => Effect.gen(…)`. `Effect.fn` — named or not — only at deliberate, coarse observability boundaries, because it costs microseconds per call, not nanoseconds.

And the absolute magnitudes deserve stating plainly: the *entire* gen-vs-pipe delta this constraint was protecting against is **~25 ns per `yield*`** (§5.2). A single Shopify Storefront API round trip is 10⁵–10⁶ times that. See §7 before spending any design budget here.

---

## 1. What v4 changed about generator handling

### 1.1 `Effect.gen` is a single runtime primitive that drains the generator in a loop

`Effect.gen` is `suspend(() => fromIteratorUnsafe(body()))` (`references/effect/packages/effect/src/internal/effect.ts:1174-1194`). `fromIteratorUnsafe` is one fiber primitive whose success continuation drains the iterator inline (`internal/effect.ts:1355-1377`):

```ts
const fromIteratorUnsafe = makePrimitive({
  op: "Iterator",
  single: false,
  [contA](value, fiber) {
    const iter = this[args][0]
    while (true) {
      const state = iter.next(value)
      if (state.done) return succeed(state.value)
      if (!effectIsExit(state.value)) {
        fiber._stack.push(this)
        return state.value
      } else if (state.value._tag === "Failure") {
        return state.value
      }
      value = state.value.value
    }
  },
  …
})
```

A yielded value that is already an `Exit` (`Effect.succeed`, a resolved service read) is consumed **without re-entering the fiber loop**. So an N-step `gen` block allocates **one** primitive node where an N-step `pipe(flatMap, flatMap, …)` allocates **N**. That is a structural reason to expect gen to be *competitive*, and the measurements bear it out.

This is also the shape that got backported *to v3* — [Effect-TS/effect#5772](https://github.com/Effect-TS/effect/pull/5772) "backport Effect.gen optimization", merged 2025-11-20, a 14-line diff in `internal/fiberRuntime.ts` turning the gen continuation into exactly this loop. Upstream has been optimising *toward* generators for two years, not away from them.

### 1.2 v4 removed `YieldWrap`, an allocation per yielded value

The v4 runtime came from [`Effect-TS/effect-smol`](https://github.com/Effect-TS/effect-smol) ("Core libraries and experimental work for Effect v4"), merged into `effect` wholesale by [#6324 "Cut over Effect main to V4"](https://github.com/Effect-TS/effect/pull/6324) (IMax153, merged 2026-07-13, 2 274 commits / 3 930 files). The generator-specific work is in smol:

[`effect-smol#386`](https://github.com/Effect-TS/effect-smol/pull/386) — "refactor: remove YieldWrap infrastructure, adapter, and simplify generator system" (mikearnaldi, merged 2025-08-04):

> "**YieldWrap wrapper class** that added unnecessary runtime overhead […] ### Performance Improvements — **Eliminated wrapper object creation** for every yielded value; **Reduced memory allocation** in generator processing; **Simplified runtime execution path** for Effect.gen"

[`effect-smol#213`](https://github.com/Effect-TS/effect-smol/pull/213) — "Implement Eager Versions of Effect Functions" (mikearnaldi, merged 2025-07-02) added `fnUntracedEager`, which resolves a fully-synchronous generator without ever constructing a fiber step (`internal/effect.ts:1296-1330`, the `fromIteratorEagerUnsafe` sync loop with async fallback).

**So yes: v4 changed generator handling, and the changes target generator overhead specifically.** They are the only runtime work in v4 that targets a composition style at all.

### 1.3 What upstream published about v4 performance

`references/effect/MIGRATION.md:52-57`:

> "The fiber runtime has been rewritten for reduced memory overhead and faster execution. The core `effect` package supports aggressive tree-shaking — a minimal Effect program bundles to ~6.3 KB (minified + gzipped). With Schema, ~15 KB."

The v4 beta announcement (`Effect-TS/website` [#1294](https://github.com/Effect-TS/website/pull/1294), `content/src/content/docs/blog/releases/effect/4.0-beta.mdx`) claims "Faster runtime. Leaner bundles." and "v4 is faster and lighter than v3 in every dimension", but quantifies **only bundle size** (~70 kB → ~20 kB for Effect + Stream + Schema). No throughput numbers, no gen-vs-pipe numbers.

---

## 2. Does the repo ship a gen-vs-pipe benchmark?

**No. It never has, in either repo.** This is a firm negative result, checked three ways.

- `references/effect/packages/effect/benchmark/` contains exactly five files: `http/multipart.ts`, `http/tracer.ts`, `httpapi/sseClientDecoder.ts`, `schema/Optic.ts`, `stream/splitLines.ts`. None compares composition styles.
- `references/effect/packages/effect/runtimeperf/` is the statistical harness (fresh Node processes, paired git-revision comparison, regression classification). Its README states its scope: *"focused Effect Schema diagnostics; the upstream Effect, Valibot and Zod benchmark matrix; paired comparisons between Git revisions"* (`runtimeperf/README.md:3-11`). Its `suites/` directory contains only `schema/` and `schema-benchmarks/`. **`pnpm runtimeperf` cannot answer this question** — there is nothing in the registry to run.
- PR search `benchmark in:title` on `Effect-TS/effect` returns 5 results (#6543, #4395, #3328, #1981, #1912), all Schema or scheduler. Same search on `effect-smol` returns 15, none gen-vs-pipe.

Consequence for method: **the numbers in §5 are mine, not upstream's.** There is no in-tree benchmark to run against rc.109 and no upstream baseline to compare to.

---

## 3. What `Effect.fn` does in v4

### 3.1 It is still the traced variant, and the JSDoc is explicit about the tradeoff

`Effect.fn` is exported at `packages/effect/src/Effect.ts:13600`, `Effect.fnUntraced` at `:13476`. The `fnUntraced` JSDoc (`Effect.ts:13393-13397`) states the whole design in three sentences:

> "reuses the generator body instead of allocating a fresh generator closure around the arguments on every call. It does not record an Effect stack-frame boundary and does not create tracing spans. Use `fn` when you need those stack frames or spans."

That first clause is the entire performance story, and §5.3 measures it.

### 3.2 `Effect.fn` allocates an `Error` on **every call**

`makeFn` (`internal/effect.ts:1250-1290`) — the per-call body, abridged:

```ts
return defineFunctionLength(body.length, function(this: any, ...args) {
  let result = suspend(() => { … })
  for (let i = 0; i < pipeables.length; i++) result = pipeables[i](result, ...args)
  if (!isEffect(result)) return result
  const prevLimit = getStackTraceLimit()
  setStackTraceLimit(2)
  const callError = new globalThis.Error()      // ← per call, unconditional
  setStackTraceLimit(prevLimit)
  return updateService(
    addSpan ? useSpan(name, spanOptions!, (span) => provideParentSpan(result, span)) : result,
    CurrentStackFrame,
    (prev) => ({ name, stack: fnStackCleaner(() => callError.stack), parent: { … } })
  )
})
```

Three things follow, all of which matter:

- The `new Error()` is **unconditional and has no opt-out**. `setStackTraceLimit` degrades to a no-op only under frozen intrinsics (SES/Temporal — `internal/stackTraceLimit.ts:25-37`); there is no reference, config flag, or environment check that skips the capture. Setting `Error.stackTraceLimit = 0` globally does not help: `makeFn` overwrites it to `2` and restores your value afterwards.
- Stack *formatting* is lazy (`fnStackCleaner(() => callError.stack)`), but V8 captures the structured frames at construction. Measured on this machine: `new Error()` at `stackTraceLimit = 2` costs **1 686 ns** against **43 ns** for a no-op loop body (§5.4).
- The named form (`addSpan`) routes through `useSpan` — **`Effect.fn("op")` is `Effect.withSpan` plus a stack frame**, which is why §5 finds them equal.

`Effect.fnUntraced` does none of this: `suspend(() => fromIteratorUnsafe(body.apply(this, arguments)))`, plus optional pipeables (`internal/effect.ts:1198-1211`).

### 3.3 Tracing is **not** zero-cost without a tracer, because "without a tracer" is not a state you can be in

This is the finding that kills the map's second-order consequence.

- `Tracer.Tracer` is a `Context.Reference` with a **default value that builds real spans** (`packages/effect/src/Tracer.ts:632-638`): `defaultValue: () => make({ span: (options) => new NativeSpan(options) })`. There is no "no tracer installed" state — omitting a tracer layer gets you the native one.
- `NativeSpan`'s constructor (`Tracer.ts:656-696`) allocates a `Map`, an events array, a status object, and generates two random hex ids (`Encoding.randomHex(32)` + `randomHex(16)`, lines 694-695).
- `References.TracerEnabled` **defaults to `true`** (`internal/references.ts:22-24`, `defaultValue: constTrue`), as does `TracerTimingEnabled` (`:27-29`).
- Setting `TracerEnabled = false` does not skip span creation — `makeSpanUnsafe` (`internal/effect.ts:5689-5750`) still walks the parent chain, still allocates a `noopSpan` (`:5675-5679`, `Object.assign(Object.create(NoopSpanProto), options)`) and still does a `Context.add`. Measured: it halves span cost, from ~3 950 ns to ~1 900 ns (§5.3).

Upstream's own numbers agree on the direction. [Effect-TS/effect#7248](https://github.com/Effect-TS/effect/pull/7248) "Improve tracing performance in span creation and HTTP tracer middleware" (tim-smart, merged 2026-08-14T03:32Z) reports, for the HTTP tracer middleware on Node 26:

| Case | Before | After |
|---|---|---|
| tracer middleware end-to-end (NativeSpan) | 2 033 ns | 1 613 ns |
| bare app baseline | 571 ns | 571 ns |
| middleware with tracing **disabled** | 731 ns | 721 ns |

Tracing disabled is 150 ns over baseline — cheap, but not zero.

> **Version note.** #7248 landed **after** `4.0.0-rc.109` was published (rc.109: 2026-08-14T01:28Z; #7248 merged 03:32Z), and `.changeset/tracer-perf.md` is still pending in the submodule. Verified in the installed artifact: `node_modules/effect/dist/Tracer.js:314-324` still contains the old per-character `randomHexString`, and `Encoding.randomHex` is absent from rc.109's `dist/Encoding.js`. So **every span number in §5 is an upper bound relative to rc.110+.** I measured rc.109's id generation directly at **711 ns** per span (§5.4); #7248 takes that to ~132 ns on the author's machine. That removes roughly 15 % of the span cost I measured. It does not change any conclusion.

---

## 4. Maintainer guidance on generators in *library* code

The clearest statement is a checked-in guidance file, `references/effect/.patterns/effect.md:77-90` (last edited by Giulio Canti, commit `dc11250e`, "Refine agent guidance"):

> **Use `Effect.gen`** when: Writing inline effect composition · One-off operations that don't need to be reused · Inside other functions already being traced
>
> **Use `Effect.fnUntraced`** when: **Building library implementations** · **Performance is critical (hot paths)** · Function is called many times per operation · **Tracing overhead is unacceptable**

That is the map's exact use case — library code, cost lands on consumers — and upstream's answer is `fnUntraced`, a generator. Same file, `:60-75`: *"Prefer `Effect.fnUntraced` over functions that only return `Effect.gen`"* (`:62`), with the anti-pattern spelled out as `const fn = (param) => Effect.gen(function*() { … })`.

Corroborating, all in the submodule:

- `.agents/AGENTS.md:110` — "Prefer `Effect.fnUntraced` over functions that only return `Effect.gen`." `:112` — "use Effect APIs such as `Effect.gen`, `Effect.fnUntraced`, and `Effect.tryPromise`."
- `LLMS.md:14` / `ai-docs/src/01_effect/01_basics/index.md:3` — "Prefer writing Effect code with `Effect.gen` & `Effect.fn("name")`. Then attach additional behaviour with combinators. This style is more readable and easier to maintain **than using combinators alone**."
- `LLMS.md:54` — "**Avoid creating functions that return an Effect.gen**, use `Effect.fn` instead."
- **Effect's own shipped source uses generators pervasively.** Call sites of `Effect.gen(` / `Effect.fn(` / `Effect.fnUntraced(` under `packages/effect/src/unstable/` and `packages/effect/src/internal/`, excluding JSDoc lines: **489** (`grep -rn "Effect\.gen(\|Effect\.fn(\|Effect\.fnUntraced(" --include="*.ts" unstable internal | grep -v "^[^:]*:[0-9]*: *\*" | wc -l`, run from `packages/effect/src`). Effect is a library whose cost lands on every consumer, and it does not follow the map's rule.

**Nowhere in either repo did I find a maintainer statement that generators are slower than pipe-based composition.** Searches on `Effect-TS/effect` and `Effect-TS/effect-smol` for the phrases `"generators are slow"`, `"gen is slower"`, `"slower than pipe"`, `"generator overhead"`, `"cost of generators"`, `"avoid Effect.gen"` returned zero relevant hits. Neither repo has GitHub Discussions enabled (`hasDiscussionsEnabled: false` for both), so there is nothing there either. **Caveat:** a great deal of Effect maintainer commentary happens on Discord, which is not searchable from here — see Open questions.

---

## 5. Measurements

All numbers: `effect@4.0.0-rc.109` from npm, `tinybench@6.0.2`, Node v22.20.0, AMD Ryzen 9 5900XT under WSL2, no CPU pinning, no turbo/frequency control. `time: 2000ms`, `warmupTime: 500ms` per case. Where two runs are shown they are two separate process invocations; reported relative-margin-of-error was ≤ 0.08 % throughout, so **run-to-run drift (up to ~20 %) dominates within-run noise** — read the columns as a range, not as precision.

**Absolute values on WSL2 run high** and should not be quoted as Effect's performance. The ratios are the durable part, and they reproduce across runs.

### 5.1 Composition style — 5-step synchronous chain, built and run per call

`bench4.mjs`, §6. Every row is wrapped in one `Effect.suspend`, and any `provideService` is applied once outside the measured loop, so the only per-call difference is what happens inside the fiber.

| # | variant | run 1 (ns) | run 2 (ns) |
|---|---|---|---|
| I1 | `pipe(succeed, flatMap ×5)` | 1 129.1 | 916.4 |
| I2 | `Effect.fnUntraced(body)` | 1 099.3 | 933.3 |
| I3 | `Effect.fn(body)` — stack frame, no span | 4 055.0 | 3 597.1 |
| I4 | `Effect.fn("op")(body)` — stack frame + span | 6 961.7 | 6 322.5 |
| I5 | `pipe + Effect.withSpan("op")` | 6 872.2 | 6 547.5 |
| J1 | I1 with `TracerEnabled = false` | 1 428.7 | 1 118.5 |
| J2 | I2 with `TracerEnabled = false` | 1 234.8 | 1 170.7 |
| J3 | I4 with `TracerEnabled = false` | 5 820.0 | 5 175.0 |
| J4 | I5 with `TracerEnabled = false` | 5 981.2 | 5 569.8 |

Reading:

- **I1 ≈ I2.** `fnUntraced` and pipe are indistinguishable. The map's rule protects nothing.
- **I3 − I2 ≈ 3 200 ns.** That is the per-call `new Error()` stack frame, and it is the single largest avoidable cost in this table.
- **I4 ≈ I5.** `Effect.fn("op")` and `pipe + withSpan` cost the same. The map's "use explicit `withSpan` instead" is performance-neutral.
- **J1/J2 are *slower* than I1/I2** — that is the `provideService` wrapper itself (~790 ns, measured independently as K3 − K1 in §5.3), not tracing. Compare J-rows only to J-rows.
- **J3 − J2 ≈ 4 000 ns vs I4 − I2 ≈ 5 400 ns.** Disabling the tracer recovers ~26 % of span cost. Not zero.

### 5.2 How the gap scales with chain length

`bench2.mjs`, §6. Effects built once, run repeatedly — isolates fiber-run cost from construction.

| steps | pipe (ns) | `Effect.gen` (ns) | `fnUntraced` (ns) |
|---|---|---|---|
| 1 | 445.6 | 578.5 | 596.8 |
| 5 | 566.7 | 953.5 | 972.1 |
| 20 | 1 078.8 | 1 641.8 | 1 711.6 |

Marginal cost per additional step, from the 1→20 slope:

- pipe `flatMap`: **33.3 ns/step**
- `Effect.gen`: **56.0 ns/step**
- `Effect.fnUntraced`: **58.7 ns/step**

**So a `yield*` costs about 25 ns more than a `flatMap` link.** That is the entire honest magnitude of the premise, and it is a per-`yield*` figure — it does not scale with anything a consumer of solidifront controls. Baseline for scale: `Effect.runSync(Effect.succeed(1))` is **61.0 ns** (bench2 G1) / **43.8–45.2 ns** (bench5 K1).

Note also `Effect.gen` ≈ `fnUntraced` here (953 vs 972 ns at 5 steps) — because in this table the `gen` value is built once. That equality is the setup for §5.3.

### 5.3 Where the "gen overhead" actually lives

`bench3.mjs`, §6. Identical 5-step body in all four rows; the only variable is how the body reaches the runtime.

| # | variant | run 1 (ns) | run 2 (ns) |
|---|---|---|---|
| H1 | `(n) => Effect.gen(function*() { … })` — fresh generator literal per call | 2 045.5 | 1 932.5 |
| H2 | `(n) => Effect.gen(() => body(n))` — hoisted generator body | 1 012.4 | 938.8 |
| H3 | `Effect.fnUntraced(body)` | 1 071.5 | 1 005.7 |
| H4 | `(n) => pipe(flatMap ×5)` — rebuilt per call | 913.9 | 925.8 |

**H1 is 2× H2, and H2 ≈ H3 ≈ H4.** The only difference between H1 and H2 is whether a `function*` literal is evaluated per call. That is the whole of the "Effect.gen is slow" folk wisdom, and it is fixed by binding the body once — which is precisely what `Effect.fnUntraced` and `Effect.fn` do, and precisely what `.patterns/effect.md` and `LLMS.md:54` tell you to do.

Isolated cost of one span (`bench5.mjs`):

| # | variant | run 1 (ns) | run 2 (ns) |
|---|---|---|---|
| K1 | `runSync(Effect.succeed(1))` | 43.8 | 45.2 |
| K2 | `runSync(withSpan(succeed, "op"))` | 3 959.1 | 4 017.7 |
| K3 | `runSync(provideService(succeed, TracerEnabled, false))` | 842.3 | 829.6 |
| K4 | K2 with `TracerEnabled = false` | 2 570.4 | 2 854.9 |
| K5 | `fnUntraced` body, 1 `yield*` | 708.0 | 646.3 |
| K6 | `Effect.fn` (anon), 1 `yield*` | 3 717.7 | 4 122.5 |
| K7 | `Effect.fn("op")`, 1 `yield*` | 6 353.4 | 7 287.2 |

- **One span ≈ 3 950 ns** (K2 − K1) with the default native tracer on rc.109.
- **With `TracerEnabled = false`, ≈ 1 880 ns** (K4 − K3). Halved, not eliminated.
- `TracerTimingEnabled = false` changes almost nothing (3 666 ns vs 3 959 ns) — the WSL2 clock is not the bottleneck (`process.hrtime.bigint()` measured at 109.8 ns).

### 5.4 Control experiments — is this Effect, or is it V8?

It is V8. Plain generators, no Effect involved, 5 `yield`s drained to completion:

| variant | ns |
|---|---|
| fresh `function*` literal evaluated per call | 949.9 |
| hoisted `function*` literal | 152.8 |

**6.2×.** A generator function created fresh on each call gets a fresh V8 closure and fresh feedback, and its body does not stay optimised across calls. *(The measurement is solid; the "fresh feedback vector defeats tiering" explanation is my reading of V8 behaviour, not something I verified with `--trace-opt`.)*

Supporting micro-measurements on this machine:

| thing | ns |
|---|---|
| `new Error()` at `Error.stackTraceLimit = 2` | 1 686.5 |
| `new Error()` at default `stackTraceLimit` | 2 992.1 |
| empty benchmark body (floor) | 42.5 |
| `process.hrtime.bigint()` | 109.8 |
| rc.109 `randomHexString(32) + randomHexString(16)` (one span's ids) | 711.2 |

The `new Error()` figure is the mechanism behind I3 − I2 ≈ 3 200 ns.

### 5.5 What these numbers do and do not prove

**They prove:** in `4.0.0-rc.109` on Node 22, with a generator body bound once, generator-based composition is not measurably slower than pipe-based composition; the per-`yield*` penalty is ~25 ns; `Effect.fn`'s stack-frame capture and span each cost microseconds; and disabling the tracer does not make spans free.

**They do not prove:** anything about a real workload. These are tight synchronous loops with a hot instruction cache and everything inlined. Real solidifront code interleaves I/O, allocates request objects, and parses JSON — conditions under which a 25 ns/step difference is unmeasurable. They also say nothing about **memory** (I measured time only), nothing about bundle size, and nothing about other engines — no Bun, no Deno, no Workerd, no Safari/JSC, where generator support characteristics differ. WSL2 inflates absolute values; the ratios reproduced across runs but were not validated on a second machine.

---

## 6. Benchmark sources

Written to `/tmp/claude-1000/…/scratchpad/genbench/` — outside both the repo and `references/`. `package.json` is `{"name":"genbench","type":"module","private":true}` with `effect@4.0.0-rc.109` and `tinybench@6.0.2` installed from npm.

Shared preamble for all files:

```js
import { Bench } from "tinybench"
import { Effect, References, pipe } from "effect"
const add1 = (n) => Effect.succeed(n + 1)
const body5 = function* (n) {
  let x = yield* Effect.succeed(n)
  x = yield* add1(x); x = yield* add1(x); x = yield* add1(x)
  x = yield* add1(x); x = yield* add1(x)
  return x
}
```

**`bench4.mjs`** (§5.1) — the `provideService`/`suspend` wrappers are applied once, outside the loop:

```js
const untraced = Effect.fnUntraced(body5)
const fnAnon   = Effect.fn(body5)
const fnNamed  = Effect.fn("op")(body5)
const pipe5     = (n) => pipe(Effect.succeed(n),
  Effect.flatMap(add1), Effect.flatMap(add1), Effect.flatMap(add1),
  Effect.flatMap(add1), Effect.flatMap(add1))
const pipe5Span = (n) => Effect.withSpan(pipe5(n), "op")

const S   = (f) => Effect.suspend(() => f(1))
const off = (e) => Effect.provideService(e, References.TracerEnabled, false)

const I_PIPE = S(pipe5), I_UNTRACED = S(untraced), I_FNANON = S(fnAnon)
const I_FNNAMED = S(fnNamed), I_PIPESPAN = S(pipe5Span)
const I_PIPE_OFF = off(S(pipe5)), I_UNTRACED_OFF = off(S(untraced))
const I_FNNAMED_OFF = off(S(fnNamed)), I_PIPESPAN_OFF = off(S(pipe5Span))
// each bench case is: () => { sink += Effect.runSync(<one of the above>) }
```

**`bench3.mjs`** (§5.3, H rows) — the one that isolates the fresh-closure effect:

```js
const genPerCall = (n) => Effect.gen(function* () {      // H1: fresh literal per call
  let x = yield* Effect.succeed(n)
  x = yield* add1(x); x = yield* add1(x); x = yield* add1(x)
  x = yield* add1(x); x = yield* add1(x)
  return x
})
const genHoistedBody = (n) => Effect.gen(() => body5(n)) // H2: hoisted body
const fnU            = Effect.fnUntraced(body5)          // H3
const pipePerCall    = (n) => pipe(Effect.succeed(n),    // H4
  Effect.flatMap(add1), Effect.flatMap(add1), Effect.flatMap(add1),
  Effect.flatMap(add1), Effect.flatMap(add1))
```

H1 and H2 differ in exactly one thing: H1 evaluates a `function*` literal on every call, H2 evaluates a plain arrow that calls a hoisted `function*`. Both allocate one closure and both capture `n`, so the ~1 000 ns gap is attributable to the generator literal alone.

**`bench2.mjs`** (§5.2) — chain-length scaling, values built once at module scope:

```js
const mkPipe = (steps) => { let e = Effect.succeed(1)
  for (let i = 0; i < steps; i++) e = Effect.flatMap(e, add1); return e }
const P1 = mkPipe(1), P20 = mkPipe(20)
const G20 = Effect.gen(function* () {
  let x = 1; for (let i = 0; i < 20; i++) x = yield* add1(x); return x })
const F20 = Effect.fnUntraced(function* (n) {
  let x = n; for (let i = 0; i < 20; i++) x = yield* add1(x); return x })
```

**`bench5.mjs`** (§5.3, K rows) — one span and one stack frame, isolated:

```js
const trivial        = Effect.succeed(1)
const trivialSpan    = Effect.withSpan(trivial, "op")
const trivialOff     = Effect.provideService(trivial,     References.TracerEnabled, false)
const trivialSpanOff = Effect.provideService(trivialSpan, References.TracerEnabled, false)
const bodyTrivial = function* () { return yield* Effect.succeed(1) }
const fU = Effect.fnUntraced(bodyTrivial)
const fA = Effect.fn(bodyTrivial)
const fN = Effect.fn("op")(bodyTrivial)
```

**Control (§5.4)** — no Effect at all:

```js
const drain = (it) => { let v, r; while (!(r = it.next(v)).done) v = r.value + 1; return r.value }
const HOISTED = function* (n) { let x = yield n; x = yield x; x = yield x; x = yield x; x = yield x; return x }
// A: () => { const g = function*(n){ …same body… }; drain(g(1)) }   ← fresh literal
// B: () => drain(HOISTED(1))                                        ← hoisted
```

Every case accumulates its result into a module-level `sink` to prevent dead-code elimination.

**API notes for anyone re-running these against v4:** `Effect.async` no longer exists — it is `Effect.callback`. `References.TracerEnabled` and `References.TracerTimingEnabled` are `Context.Reference`s and are provided with `Effect.provideService`. tinybench 6's result object exposes `latency.samplesCount`, not `latency.samples`.

---

## 7. What this means for solidifront

### 7.1 Drop the constraint from the map

The rule as written — "avoid `Effect.gen` and `Effect.fn`, prefer pipe-based combinators" — is not supported by anything in v4, is contradicted by upstream's own library-code guidance (§4), and protects a ~25 ns/`yield*` difference (§5.2). It also has a real cost: pipe-based code for anything with branching or sequential dependencies is harder to read and harder to type, and 489 call sites inside Effect itself demonstrate that upstream does not consider it necessary.

### 7.2 Replace it with the rule upstream actually gives

- **`Effect.fnUntraced` is the default for internal library functions that return an Effect.** It is generator syntax at pipe-level cost (§5.1 I1 vs I2), and it is exactly what `.patterns/effect.md:85-90` prescribes for "building library implementations".
- **Never `(args) => Effect.gen(function*() { … })`.** That is the one form that is genuinely ~2× slower (§5.3), and upstream flags it independently (`LLMS.md:54`).
- **Bare `Effect.gen` is fine for values built once** — layer bodies, service constructors, module-level programs. It measures the same as `fnUntraced` when the value is not rebuilt per call (§5.2).
- **`Effect.fn` — named or not — is a microsecond-scale decision.** Reserve it for a small, deliberate set of observability boundaries. Unnamed `Effect.fn` is the worst of both worlds for a library: ~3 200 ns per call for a stack frame with no span to show for it.

### 7.3 The OTEL consequence (#19) inverts

The map's reasoning was: `Effect.fn` is the traced variant, therefore spans must come from explicit `Effect.withSpan`. Measurement says **`Effect.fn("op")` and `pipe + Effect.withSpan("op")` cost the same** (§5.1 I4 vs I5), because the former *is* the latter plus a stack frame (`internal/effect.ts:1279`). So:

- The choice between them is about readability and about whether you want the stack frame, not about cost.
- **The real OTEL decision is span *granularity*, not span *syntax*.** At ~3 950 ns each on rc.109 (~3 400 ns after [#7248](https://github.com/Effect-TS/effect/pull/7248)), spans are cheap per storefront request and ruinous per row of a parsed response. Decide where the boundaries are; the API you use to draw them is free to be the readable one.
- **Do not design around "consumers can turn tracing off."** They cannot turn it off to zero — `References.TracerEnabled = false` halves span cost, it does not remove it (§5.3 K2 vs K4), and there is no "no tracer installed" state to fall back to (§3.3).

### 7.4 The `@effect/tsgo` consequence dissolves

Both rules were to be disabled because they argued against the convention. Checked against `@effect/tsgo@0.36.4` and the [tsgo rule docs](https://github.com/Effect-TS/tsgo/tree/main/docs/rules):

- **`effectDoNotation`** — default severity **`off`** ([effect-do-notation.md](https://github.com/Effect-TS/tsgo/blob/main/docs/rules/effect-do-notation.md), diagnostic `TS377085`). **There is nothing to disable.** It only fires if you opt in, and it suggests `Effect.gen`/`Effect.fn` over `Effect.Do` — advice solidifront should now take anyway.
- **`effectFnOpportunity`** — default severity **`suggestion`**, fixable, diagnostic `TS377047` ([effect-fn-opportunity.md](https://github.com/Effect-TS/tsgo/blob/main/docs/rules/effect-fn-opportunity.md)). It fires on exactly the anti-pattern §5.3 measures — a function returning `Effect.gen` — so **keep it on**. Rather than disabling it, retune its quickfix: the plugin option `effectFn` (`node_modules/@effect/tsgo/schema.json`) defaults to `["span"]` but accepts `["span", "untraced", "no-span", "inferred-span", "suggested-span"]`. Setting **`"effectFn": ["untraced"]`** makes the offered fix `Effect.fnUntraced` instead of `Effect.fn("name")` — the rule then enforces solidifront's new convention instead of fighting it.
- Bonus, same family: **`nestedEffectGenYield`** (default `off`, `TS377083`) flags `yield* Effect.gen(…)` nested inside another generator — an avoidable extra generator allocation on a hot path. Worth turning on to `warning` once the convention lands.

Nothing in `tsconfig.json` or `packages/start/tsconfig.json` currently sets `diagnosticSeverity` at all, so no existing configuration has to be undone.

### 7.5 Scale check before any of this gets design budget

The entire measured gen-vs-pipe delta is ~25 ns per `yield*`. A storefront operation that yields 50 times pays ~1.2 µs. A Shopify Storefront API round trip is tens to hundreds of milliseconds. The composition-style decision is **five to six orders of magnitude** below the thing solidifront actually spends time on.

The costs in this document that *are* worth caring about are the microsecond-scale ones — per-call `Effect.fn` stack frames and span granularity — and they are worth caring about only where a function is called thousands of times per request. If nothing in solidifront is, then the correct engineering answer to this whole question is: **write the readable thing.**

---

## 8. Open questions / could not verify

1. **Discord.** Effect's maintainers discuss design on Discord, which is not searchable from here. The "gen is slow" claim most plausibly originated there and cannot be traced to a GitHub artifact. Several `Effect-TS/effect` issues are Discord-thread summaries auto-filed by `effect-bot`; none I surfaced touch generator performance. **If the original source of the map's premise is known, it is worth checking directly** — this document can only say that the claim is not supported by anything in the repo or by measurement.
2. **Only one machine, one engine, one Node version.** Node v22.20.0 on WSL2. Not validated on bare-metal Linux, macOS, Bun, Deno, Workerd, or any browser engine. Generator performance is engine-specific and V8's optimisation of generator bodies has changed across releases; the ~6× fresh-vs-hoisted control (§5.4) in particular is a V8 behaviour that may differ elsewhere. **Solidifront's SSR path is the one that matters and its runtime is not yet decided** (deployment targets are explicitly unruled on the map), so the engine this was measured on may not be the engine that runs it.
3. **Memory was not measured.** Every number here is wall-clock. Allocation rate and GC pressure — arguably the more relevant metric for a library, and the thing `effect-smol#386` explicitly optimised ("Reduced memory allocation in generator processing") — were not measured at all. A heap-profiled comparison would be a different and possibly more informative experiment.
4. **Bundle size was not measured.** `Effect.fn` and `Effect.fnUntraced` pull in stack-trace and tracer machinery; pipe combinators may tree-shake differently. Given that v4's headline claim is bundle size (§1.3) and solidifront ships to browsers, this is a real gap. The Effect repo has a `pnpm bundle-compare` workflow (`.agents/AGENTS.md:97-105`, "Bundle Size Preview") that could be adapted.
5. **The 2× fresh-closure penalty is measured, its mechanism is inferred.** §5.4 establishes the effect exists in plain JS with no Effect involved. The explanation offered — fresh closure means fresh feedback, so the body does not stay optimised — was not verified with `--trace-opt` / `--trace-deopt`. The practical conclusion does not depend on the mechanism being right.
6. **`fnUntracedEager` was not benchmarked.** `Effect.fnUntraced**Eager**` (`Effect.ts:15377`, `internal/effect.ts:1296-1330`) resolves fully-synchronous generators without a fiber step and could plausibly beat both pipe and `fnUntraced` for sync-only helpers. It is undocumented in `.patterns/effect.md` and I did not measure it. If any solidifront internal is hot *and* fully synchronous, this is the thing to test.
7. **No upstream baseline exists.** §2 establishes that neither `packages/effect/benchmark/` nor `runtimeperf/` covers composition style, so there is no upstream number to check mine against and no regression test upstream would notice if this changed. My numbers stand alone.
8. **Post-rc.109 drift.** [#7248](https://github.com/Effect-TS/effect/pull/7248) merged after rc.109 published and is not in the measured artifact (§3.3), and `.changeset/tracer-perf.md` is still pending in the submodule. At the RC's ~2–3 day cadence, span costs in particular will keep moving. Re-measuring §5.3's K-rows against a later RC is a ten-minute job with the scripts in §6.
9. **`Effect.fn`'s v3→v4 signature delta** is still open from [`effect-4.md` §9.4](./effect-4.md) and is untouched here — this document covers cost, not API shape.
