# effect-solid-bridge — THROWAWAY PROTOTYPE

Answers wayfinder tickets [#8](https://github.com/KookiKodes/solidifront/issues/8),
[#20](https://github.com/KookiKodes/solidifront/issues/20) and
[#22](https://github.com/KookiKodes/solidifront/issues/22). Not production code.
Nothing here is meant to survive; the decisions it produced are what survive.

## The three harnesses

| Command                        | What it exercises                                                        | Ticket |
| ------------------------------ | ------------------------------------------------------------------------ | ------ |
| `pnpm probe:node`              | `createEffect` bridge, **headless** node, `@solidjs/signals` directly     | #8     |
| `pnpm probe:memo`              | `createMemo(async …)` — the data-layer primitive                          | #20    |
| `pnpm probe:hydration`         | **Real streaming SSR + real hydration in chrome-headless-shell**          | #22    |
| `node --conditions=development --experimental-strip-types src/run-flush-owner.ts` | why #8 and #22 disagreed | #22 |

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

| Probe | Writes a signal from…                            | Guard fires? | App after |
| ----- | ------------------------------------------------ | ------------ | --------- |
| `H0`  | a **component body** (the control)               | **yes**      | **dead**  |
| `H0B` | the **compute phase** of `createEffect`          | **yes**      | alive     |
| `H1`  | the **effect phase**, first run, mid-hydration   | no           | alive     |
| `H1B` | the **effect phase**, post-hydration             | no           | alive     |
| `H2`  | the effect phase + a fiber observer, `ownedWrite`| no           | alive     |
| `H4`  | the same, with **no `ownedWrite` anywhere**      | no           | alive     |
| `H3`  | — (disposes a subtree with an in-flight fiber)   | —            | alive     |
| `S1`  | — (which phases run under SSR at all)            | —            | —         |

`H0` is load-bearing: without it, `H1`'s clean result is indistinguishable from
"the dev guard isn't running in this build".

## What it found

1. **The effect phase is not an owned scope.** `runEffect` calls
   `node._effectFn(...)` bare — no `runWithOwner` — so `setSignal`'s guard sees
   whatever owner the *flusher* left on the stack. #8's rule ("effect-phase
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
