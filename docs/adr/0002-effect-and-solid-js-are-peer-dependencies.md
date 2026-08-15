# Effect and solid-js are peer dependencies, in every package

Every solidifront package declares `effect` and `solid-js` as **peer** dependencies rather than direct ones. This is a correctness requirement, not a packaging preference.

Effect v4 keys `Context` tags by **string**. Two copies of `effect` in a dependency tree therefore produce two distinct tags for what is nominally the same service, and service resolution fails — surfacing as a missing-service error that points nowhere near the real cause. `solid-js` has the same class of hazard for a different reason: two copies mean two reactive graphs, and reactivity silently stops crossing between them.

Declaring both as peers turns a silent, baffling runtime failure into a resolvable warning at install time.

## Consequences

Consumers must install `effect` and `solid-js` themselves. That is ordinary for a library of this kind, but it is a real ergonomic cost and the getting-started docs have to lead with it.

More significantly, **the supported Effect version range becomes public API**. Widening it later is harmless; narrowing it is a breaking change. Given Effect 4.0 is at RC and `effect/unstable/*` may still move in minors, choose the initial range deliberately rather than defaulting to `^`.
