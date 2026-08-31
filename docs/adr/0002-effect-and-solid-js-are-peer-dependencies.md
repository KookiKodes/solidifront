# Effect and solid-js are peer dependencies, in every package

> **Amended by [ADR-0020](./0020-a-peer-range-is-bounded-only-where-upstream-licenses-a-break.md).** Two changes: "every package" is narrowed to every package whose `Context` tags can reach the consumer's **Runtime** — the **build-time surface** is exempt and takes `effect` as a direct dependency — and the closing instruction to choose the range deliberately is **discharged**, in [#26](https://github.com/KookiKodes/solidifront/issues/26). The correctness argument below is unchanged.

Every solidifront package whose `Context` tags can reach the consumer's **Runtime** declares `effect` and `solid-js` as **peer** dependencies rather than direct ones. This is a correctness requirement, not a packaging preference.

Effect v4 keys `Context` tags by **string**. Two copies of `effect` in a dependency tree therefore produce two distinct tags for what is nominally the same service, and service resolution fails — surfacing as a missing-service error that points nowhere near the real cause. `solid-js` has the same class of hazard for a different reason: two copies mean two reactive graphs, and reactivity silently stops crossing between them.

Declaring both as peers turns a silent, baffling runtime failure into a resolvable warning at install time.

## Consequences

Consumers must install `effect` and `solid-js` themselves. That is ordinary for a library of this kind, but it is a real ergonomic cost and the getting-started docs have to lead with it.

More significantly, **the supported peer range becomes public API**. Widening it later is harmless; narrowing it is a breaking change — and that asymmetry applies to the **floor** as much as the ceiling, since raising a lower bound is narrowing.

Given Effect 4.0 is at RC and `effect/unstable/*` may still move in minors, choose the initial range deliberately rather than defaulting to `^`. **Discharged by [ADR-0020](./0020-a-peer-range-is-bounded-only-where-upstream-licenses-a-break.md):** `effect` is minor-bounded because upstream documents a licence to break in minors, `solid-js` takes `^2.0.0` because it does not, and v1.0.0 waits for both upstreams to reach stable so the floor never has to move.
