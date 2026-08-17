# effect-solid-bridge — THROWAWAY PROTOTYPE

Answers wayfinder tickets [#8](https://github.com/KookiKodes/solidifront/issues/8),
[#20](https://github.com/KookiKodes/solidifront/issues/20),
[#22](https://github.com/KookiKodes/solidifront/issues/22) and
[#30](https://github.com/KookiKodes/solidifront/issues/30). Not production code.
Nothing here is meant to survive; the decisions it produced are what survive.

## The harnesses

| Command                                                                           | What it exercises                                                     | Ticket |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------ |
| `pnpm probe:node`                                                                 | `createEffect` bridge, **headless** node, `@solidjs/signals` directly | #8     |
| `pnpm probe:memo`                                                                 | `createMemo(async …)` — the data-layer primitive                      | #20    |
| `pnpm probe:hydration`                                                            | **Real streaming SSR + real hydration in chrome-headless-shell**      | #22    |
| `pnpm probe:ssr-effect`                                                           | Which primitive has a **server-side effect phase**, and what it costs | #30    |
| `node --conditions=development --experimental-strip-types src/run-flush-owner.ts` | why #8 and #22 disagreed                                              | #22    |

`probe:hydration` hosts a Vite dev server (`@solidjs/vite-plugin` SSR start
mode) in-process and drives it with `playwright-core` against the
chrome-headless-shell already in `~/.cache/ms-playwright`. Server-side log lines
are prefixed `[SSR]` and scraped off the driver's own stdout; client-side ones
are read back off `window.__PROBE`.

Captured output: [`results-22.txt`](./results-22.txt).

## Why one probe per page load

`haltReactivity()` sets a module-level latch with no public reset. A halt is
therefore process-wide and permanent, so two probes sharing a page would mean
the first halt decides the second probe's result. Each probe is `?probe=<name>`
and gets its own browser context.

## The probes

| Probe | Writes a signal from…                             | Guard fires? | App after |
| ----- | ------------------------------------------------- | ------------ | --------- |
| `H0`  | a **component body** (the control)                | **yes**      | **dead**  |
| `H0B` | the **compute phase** of `createEffect`           | **yes**      | alive     |
| `H1`  | the **effect phase**, first run, mid-hydration    | no           | alive     |
| `H1B` | the **effect phase**, post-hydration              | no           | alive     |
| `H2`  | the effect phase + a fiber observer, `ownedWrite` | no           | alive     |
| `H4`  | the same, with **no `ownedWrite` anywhere**       | no           | alive     |
| `H3`  | — (disposes a subtree with an in-flight fiber)    | —            | alive     |
| `S1`  | — (which phases run under SSR at all)             | —            | —         |

`H0` is load-bearing: without it, `H1`'s clean result is indistinguishable from
"the dev guard isn't running in this build".

## What it found

1. **The effect phase is not an owned scope.** `runEffect` calls
   `node._effectFn(...)` bare — no `runWithOwner` — so `setSignal`'s guard sees
   whatever owner the _flusher_ left on the stack. #8's rule ("effect-phase
   writes need `ownedWrite`") is an artifact of its harness calling `flush()`
   synchronously inside `createRoot`'s body. `run-flush-owner.ts` isolates it:
   F1 (flush inside the root) throws, F2/F3 (flush outside / microtask) do not.
2. **A component-body write during hydration is fatal**, and worse than on the
   client: `hydrate()` throws mid-pass and never returns, leaving unclaimed
   server-rendered nodes and a permanently halted reactive system.
   A compute-phase write raises the same diagnostic but is contained — the
   reactive system routes it and the app stays interactive.
3. **`createEffect`'s effect phase never runs under SSR.** The server build
   forwards `undefined` as the effect function; only `createRenderEffect` keeps
   it. The compute phase runs in both.
4. **SSR does not enforce the owned-scope guard at all** — `H0`/`H0B` write
   happily server-side and only explode at hydration.
5. **Effect finalizers run LIFO, Solid cleanups FIFO, interleaved by
   registration order**, identically under SSR and hydration. `Fiber.interrupt`
   drains its finalizers synchronously, so cleanups registered after the
   interrupt see the fiber as already finalized.

## The #30 probes — `pnpm probe:ssr-effect`

`run-30.mjs` adds one thing to the #22 driver: it fetches every probe **raw**
before the browser sees it, timing the response headers and each body chunk.
`serverEffect` pays for a pending compute with `ctx.block()`, so "it holds the
stream" is a number here, not a reading of the source.

`Accept: text/html` on that raw fetch is load-bearing — the plugin's dev
middleware only SSR-renders navigations, and a bare `fetch` gets a 404 that
looks exactly like "the probe rendered nothing".

| Probe                 | Question                                                               |
| --------------------- | ---------------------------------------------------------------------- |
| `E1`                  | Six primitive/option variants: which run a **server** effect phase     |
| `E2`                  | Does one logical event fire **twice** across SSR + hydration           |
| `E2P` / `E2T`         | The same effect with and without `transparent: true`                   |
| `E3`                  | A pending read in a **render-effect** compute                          |
| `E3C` / `E3D` / `E3B` | Controls: nothing pending / memo unread / read by plain `createEffect` |
| `E4`                  | A render-effect inside a `<Loading>` boundary                          |
| `E5`                  | Does async work started in an SSR effect phase **outlive the render**  |

Captured output: [`results-30.txt`](./results-30.txt).

### What it found

1. **`createRenderEffect` is the only primitive with a server-side effect phase**
   — and it runs **inline, synchronously, during the component body**, before the
   component's own children evaluate. Not after a flush. `defer: true` suppresses
   it (compute still runs); `ssrSource: "client"` suppresses **both** phases.
2. **`ssrSource: "client"` is a first-class inert-on-the-server seam.** Neither
   phase runs under SSR, and on the client both run _after_ the render pass,
   behind the pre-hydration gate — no `isServer` branch needed.
3. **`transparent: true` is NOT that seam.** `E2T` (transparent) leaves
   `1 unclaimed server-rendered node(s)` where `E2P` (identical, no flag) is
   clean. It is only safe when the server genuinely never created the effect.
4. **A server effect phase double-fires.** `E2` fires run #1 server-side and run
   #1 again client-side. One logical event, two recordings.
5. **A pending read in a render-effect compute holds the document, and it is the
   only thing that does.** Measured TTFB over two runs — `E3C` (nothing pending)
   7ms / 18ms, `E3D` (memo created, unread) 10ms / 6ms, `E3B` (read by a plain
   `createEffect`) 6ms / 3ms, `E3` (read by a render-effect) **156ms / 155ms**.
   All three controls flush the shell immediately; only the render-effect path
   pays, and it pays the source's full 150ms latency. `E3D`/`E3B` do keep the
   _connection_ open to ~155ms, so the tell is TTFB, not response completion.
   The compute re-runs once; the effect phase fires once, with the resolved
   value. (The per-run `delta` line in the output is against that run's `E3C`
   baseline, which is cold-start noisy — read the four absolute numbers.)
6. **Async work started in an SSR effect phase outlives the render.** `E5`'s
   response completes at 6ms; the forked fiber completes at 203ms and its
   finalizer reports `Success`, not an interrupt — unlike #22's component-body
   fiber. **Not measured: a serverless runtime that freezes the process after the
   response**, where this would not hold.
