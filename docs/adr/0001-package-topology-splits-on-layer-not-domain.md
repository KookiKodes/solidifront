# Package topology splits on layer, not domain

Solidifront v1 ships five packages split by **layer** — `core` (framework-free Effect), `solid` (primitives), `ui` (components), `server` (server-only integration), `vite` (build-time) — with the commerce domains (cart, analytics, auth, markets) as **subpath exports** of `core` rather than packages of their own. The domains share a client, a schema, and a request context, so they would release in lockstep anyway; separate packages would buy cross-package peer-dependency churn and no isolation.

## Considered Options

A domain split (`@solidifront/cart`, `@solidifront/analytics`, …) was rejected for the lockstep reason above. A single package with subpath exports was rejected because two boundaries are real and forced rather than stylistic:

- **JSX is a build boundary.** A package containing JSX needs `tsc --jsx preserve` plus a Rollup fallback published behind the `"solid"` export condition; a package without JSX ships plain ESM. Isolating components in `ui` confines that awkward, undocumented dual build to one package.
- **Server-only is a bundling boundary.** `server` is the only package importing `@solidjs/web`, touching `getRequestEvent()`, or knowing about middleware, which lets the Vite plugin mark it server-only cleanly.

## Consequences

Splitting a subpath into its own package later is easy; merging packages back together is not — so the domains start merged deliberately.

Making components a separate package makes "opinionated" a _dependency_ decision rather than an import decision: a consumer who never installs `@solidifront/ui` cannot be quietly steered by it. `ui` depends on `solid` only, never reaching into `core` directly — if a component needs something only `core` exposes, that means a primitive is missing.

## Amended by #19 — a sixth package, and a third boundary criterion

v1 ships **six** packages. `@solidifront/otel` is added as the opt-in OTEL export path, decided in [#19](https://github.com/KookiKodes/solidifront/issues/19).

It does not fit either boundary named above, and it is emphatically not a domain split — so the criterion it does satisfy is stated as a rule rather than smuggled in as an exception:

> **A peer set is a packaging boundary.** Where a subsystem's peer dependencies would otherwise be declared by a package every consumer installs, it earns its own package — so a consumer who does not use the subsystem does not carry its peers.

`@effect/opentelemetry` must be a **peer**, forced by [ADR-0020](./0020-a-peer-range-is-bounded-only-where-upstream-licenses-a-break.md)'s tag-crossing rule: `OtelTracer` creates `Context` tags that reach the consumer's Runtime. It in turn declares nine `@opentelemetry/*` peers (all `optional: true`) and pays the full OTel JS SDK. Folding that into `@solidifront/server` would put the entire OTel peer set on the package every server consumer installs, and would undo precisely the insulation [#26](https://github.com/KookiKodes/solidifront/issues/26) bought by choosing this substrate — it cut solidifront's exposed `unstable/` namespaces from four to three.

The package is deliberately **thin**: the export layer, the semconv key constants, and the peer declarations. It holds no instrumentation, because per [ADR-0022](./0022-the-span-vocabulary.md) the span calls are unconditional in `core`, and it holds no configuration tag either — the `graphql.document` switch ships in `core`, since `StorefrontClient` is the code that reads it and `core` cannot import `otel`. A thin package whose job is to own a peer set is the point, not a smell.
