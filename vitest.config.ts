import { defineConfig } from "vitest/config";

/**
 * Root Vitest harness for the monorepo.
 *
 * One runner, many projects (`workspace` is deprecated since Vitest 3.2 — see
 * https://vitest.dev/guide/projects). Packages join by adding their own
 * `vitest.config.ts`; the glob below picks them up automatically.
 *
 * Two things here are load-bearing and must not be quietly dropped:
 *
 * 1. `resolve.conditions` includes `development`. Solid compiles its
 *    correctness diagnostics out of the production build entirely, so a suite
 *    running against the default (prod) condition proves very little about
 *    reactivity. Per wayfinder #22, a signal write from a component body is
 *    fatal *and worse under hydration* — `hydrate()` throws mid-pass and halts
 *    reactivity — while SSR does not enforce the guard at all. Dev-condition
 *    tests are the only place that class of bug is visible.
 *
 * 2. `environment: "node"` is the default; DOM/hydration suites opt in per file
 *    with `// @vitest-environment happy-dom`. Browser-mode projects (stable as
 *    of Vitest 4) are a later addition, not a default.
 */
export default defineConfig({
	resolve: {
		conditions: ["development", "browser", "import", "module", "default"],
	},
	test: {
		// QUARANTINE: `@solidifront/storefront-client`'s suite reads
		// SHOPIFY_PRIVATE_STOREFRONT_TOKEN and hits the live Storefront API, so it
		// cannot run on a PR. Its package script is `test:live`, not `test`, so
		// `turbo test` skips it too. The package is replaced (not migrated) by the
		// restructure — remove this exclusion when it is deleted.
		projects: ["packages/*", "!packages/storefront-client", "packages/plugins/*", "."],
		environment: "node",
		passWithNoTests: true,
		include: ["test/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
	},
});
