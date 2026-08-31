# Solidifront ships no request root span

Every span solidifront creates is either an **operation** span or a child of one. There is no library-owned `server`-kind span covering the HTTP request, so a page that runs eight operations produces **eight independent traces**, correlated by a `solidifront.request_id` attribute rather than by a shared parent. Decided in [#19](https://github.com/KookiKodes/solidifront/issues/19).

This is the decision a future reader is most likely to try to "fix", because `otel-and-testing.md` §7.3 designs the opposite — a `GET /products/:handle` root created in middleware, with everything nested beneath it. That design predates two findings that kill it.

## Why the root cannot exist

A root span has to **end**, and the framework offers no honest place to end it.

[#13](https://github.com/KookiKodes/solidifront/issues/13) established that Solid 2 has **no response-completion hook**, and that streamed bodies outlive the middleware unwind. Middleware is the only request-scope seam there is — so a middleware-created root can only be ended at unwind, which produces two failures:

- **The duration is a lie.** It measures middleware, not the request. Every streamed response reports a fraction of its real latency.
- **Worse, it orphans its own children.** [#27](https://github.com/KookiKodes/solidifront/issues/27) found response headers commit at the shell flush. Any operation below a `<Loading>` boundary runs _after_ the unwind — so its parent span has already ended, and it attaches to a closed span or to nothing. The operations most worth tracing, the slow ones that pushed themselves below a suspense boundary, are exactly the ones that break.

A third option — holding the root open in a forked fiber — was rejected on evidence. [#30](https://github.com/KookiKodes/solidifront/issues/30) measured a fiber forked from the effect phase completing 200ms after the response closed, so it _can_ work; but that was never measured on a serverless runtime that freezes the process between requests, and a root span whose termination depends on unmeasured host behaviour fails by silently never terminating. Traces that never end are worse than traces that never start.

## This is the load-bearing half of ADR-0019

[ADR-0019](./0019-analytics-and-otel-never-share-a-pipeline.md) asserts that #13's missing response-completion hook "never becomes a tracing problem", because OTEL's server spans come from Effect operations only and no Solid primitive traces server-side.

That claim is true **only under this ADR**. A request root span is not a Solid primitive and not an operation — it is middleware, the one seam #13 left without a closing edge. Shipping one would have made ADR-0019's central reassurance quietly false while every word of its reasoning stayed correct. The two ADRs have to be read together.

## What replaces it

**`solidifront.request_id`** — minted per request in middleware, carried on `RequestContext` (which #13 already provides per call), and stamped on every span solidifront creates. An operator joins on it in their own tooling.

This is not a breach of ADR-0019's "solidifront does not build the join". That rule closes the **analytics↔OTEL** join, because it would carry un-gated operator identifiers into a consent-gated channel. This join has one audience on both ends, is un-gated on both ends, and crosses no consent boundary. Same word, different boundary.

## Consequences

- **Sampling is per operation, and solidifront ships no sampler.** With every operation a trace root, a probabilistic sampler keeps an arbitrary subset of a page's operations. `solidifront.request_id` makes the loss recoverable in the operator's backend; nothing makes it recoverable in the trace graph. Operators who need whole-page traces should sample by that attribute, or install platform instrumentation that supplies a real HTTP root.
- **An operator's own root is welcome and works.** `OtelTracer`'s parentage reads the active OTel context when Effect has no parent of its own (`otel-and-testing.md` §3.2), so Node auto-instrumentation or a platform-provided `server` span adopts solidifront's operation spans as children with no code change. The library declines to own the root; it does not prevent one.
- **This is why the cart-operation span is `internal`, not `server`.** Kind is fixed rather than inferred from "am I a root?", so it stays correct whether or not an operator's root exists. See [ADR-0022](./0022-the-span-vocabulary.md).
- **`links` are absent from v1 entirely.** #19 inherited a bullet asserting that cart mutations link rather than nest — correct reasoning about a browser-originated mutation span, which [#26](https://github.com/KookiKodes/solidifront/issues/26) then ruled out of v1 along with the rest of the browser leg. With no browser span to link from and no root to link to, the edge has no producer. The bullet is moot, not decided.
