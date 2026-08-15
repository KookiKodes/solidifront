# Solid 2 library build recipe

JSX-bearing packages build with `tsc --jsx preserve && rollup -c` and publish both branches behind the `"solid"` export condition. JSX-free packages build with `tsc` alone and publish plain ESM. Validated end-to-end in this repo (`prototypes/recipe-*`) against `solid-js@2.0.0-rc.0` and `@solidjs/vite-plugin@3.0.0-next.28`.

Only `@solidifront/ui` ships JSX (ADR-0001), so only it needs the first path.

```jsonc
// JSX package
"exports": { ".": { "solid": "./dist/index.jsx", "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
"scripts": { "build": "rm -rf dist && tsc && rollup -c" }

// JSX-free package
"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
"scripts": { "build": "rm -rf dist && tsc" }
```

`tsconfig`: `"jsx": "preserve"`, `"jsxImportSource": "@solidjs/web"`.
Rollup: `@rollup/plugin-babel` with `babel-preset-solid@2.0.0-rc.0` + `@babel/preset-typescript`, entry `dist/index.jsx`, output `dist/index.js`.

## Why ship JSX at all

The `.jsx` branch lets the **consumer's** compiler target their own build. Verified from one library source: a client build produced `template()` / `insert()` / `delegateEvents()`; an SSR build produced `ssr()` / `escape()`. The Rollup bundle is a **client-DOM-only fallback** for consumers without the `solid` condition — it cannot serve SSR, which is precisely why the condition exists.

## Non-obvious details that cost time

- **`jsxImportSource` is `@solidjs/web`, not `solid-js`.** `solid-js@2` exports only `.`, `./refresh`, `./types/*` — there is no `solid-js/jsx-runtime`. Getting this wrong fails with a confusing `JSX.IntrinsicElements` error while still emitting output.
- **`babel-preset-solid@2.0.0-rc.0` exists**, on the `next` tag, and is what `@solidjs/router@2.0.0-next.16` builds with. Earlier research concluded the Solid 2 library toolchain had "no successor" after `tsup-preset-solid`/`esbuild-plugin-solid` — correct about those two, but it missed the babel preset, which is the actual compiler.
- **Never use a regex for Rollup `external`.** `external: [/solid-js/]` also matches any absolute path containing "solid-js" — including this repo's own checkout path — which silently externalises the entry module. Match exactly.

## Consequences

The recipe is reverse-engineered from `@solidjs/router`; `v2.solidjs.com` has no library-authoring page. Solidifront is an early adopter of an undocumented convention, so pin the toolchain versions and re-verify on Solid 2 upgrades. Worth filing an upstream docs issue.

An **undeclared** library dependency does not silently break SSR under pnpm — the build fails loudly at resolution. That safety comes from pnpm's strict `node_modules`; a hoisting package manager could still resolve a phantom dependency and externalise it, so the risk is not zero for consumers on npm or yarn.
