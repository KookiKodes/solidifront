# Package topology splits on layer, not domain

Solidifront v1 ships five packages split by **layer** — `core` (framework-free Effect), `solid` (primitives), `ui` (components), `server` (server-only integration), `vite` (build-time) — with the commerce domains (cart, analytics, auth, markets) as **subpath exports** of `core` rather than packages of their own. The domains share a client, a schema, and a request context, so they would release in lockstep anyway; separate packages would buy cross-package peer-dependency churn and no isolation.

## Considered Options

A domain split (`@solidifront/cart`, `@solidifront/analytics`, …) was rejected for the lockstep reason above. A single package with subpath exports was rejected because two boundaries are real and forced rather than stylistic:

- **JSX is a build boundary.** A package containing JSX needs `tsc --jsx preserve` plus a Rollup fallback published behind the `"solid"` export condition; a package without JSX ships plain ESM. Isolating components in `ui` confines that awkward, undocumented dual build to one package.
- **Server-only is a bundling boundary.** `server` is the only package importing `@solidjs/web`, touching `getRequestEvent()`, or knowing about middleware, which lets the Vite plugin mark it server-only cleanly.

## Consequences

Splitting a subpath into its own package later is easy; merging packages back together is not — so the domains start merged deliberately.

Making components a separate package makes "opinionated" a *dependency* decision rather than an import decision: a consumer who never installs `@solidifront/ui` cannot be quietly steered by it. `ui` depends on `solid` only, never reaching into `core` directly — if a component needs something only `core` exposes, that means a primitive is missing.
