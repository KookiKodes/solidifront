# Solidifront

## Reference checkouts

`references/` holds **read-only** git submodules, present so agents can read upstream source directly instead of guessing at APIs. Never edit, build, format, or commit into them.

| Path                   | Repo                       | Branch          | Why it's here                                          |
| ---------------------- | -------------------------- | --------------- | ------------------------------------------------------ |
| `references/solid`     | `solidjs/solid`            | `next`          | Solid 2.0 RC — the plugin contract we're rebuilding against |
| `references/effect`    | `Effect-TS/effect`         | `main`          | Effect 4.0 RC — v4 lives on `main`; `v4/next-major` is a stale beta branch |
| `references/hydrogen`  | `Shopify/hydrogen`         | `preview`       | Reference for how a normal Shopify storefront is wired |
| `references/alchemy`   | `alchemy-run/alchemy`      | `main`          | Will eventually run the docs site                      |

They're shallow (`--depth 1`) clones pinned to a branch. Refresh with `git submodule update --remote --depth 1 references/<name>`. After a fresh clone, populate with `git submodule update --init --depth 1`.

`references/` is excluded from `tsconfig.json`, `biome.json`, and `.prettierignore` — keep it that way, or `pnpm format` will rewrite 196 MB of vendored source.

## TypeScript and the Effect language service

The root installs **TypeScript 7** (native) plus `@effect/tsgo`, which supplies the `@effect/language-service` plugin. Individual packages still pin `typescript@^5.9.3` for their builds, so the editor typechecks with 7 while `turbo build` uses 5.9 — a deliberate split to revisit during the restructure.

- The plugin is wired into `tsconfig.json` (inherited by `codegen` and `storefront-client` via `extends`) and separately into `packages/start/tsconfig.json`, which does not extend the root.
- `pnpm prepare` runs `effect-tsgo patch --typescript --no-oxlint`; it re-runs on every install.
- CLI check: `pnpm exec effect-tsgo diagnostics --project "$PWD/<pkg>/tsconfig.json" --format pretty`.
- In VS Code / Cursor, install the TypeScript 7 extension — `.vscode/settings.json` already points the tsdk at `./node_modules/typescript/bin`.
- **The 7/5.9 split does not hold by itself.** The root `typescript@7.0.2` package exports only `version` and `versionMajorMinor` — no compiler API — and pnpm linked it to `dts-bundle-generator`'s `typescript` peer, which broke `build` in every package that uses it. A root `pnpm.overrides` entry (`"dts-bundle-generator>typescript": "5.9.3"`) pins that peer back to 5.9. Any other tool that consumes the TypeScript compiler API needs the same treatment.
- `moduleResolution` is **`Bundler`**. `Node` (node10) cannot resolve Effect 4's subpath `exports` (`effect/unstable/http/...`) at all.

## CI, formatting, and tests

- **CI** is `.github/workflows/ci.yml` — `lint`, `typecheck`, `test`, `build` on every PR and on pushes to `main`/`next`, sharing `.github/actions/setup`. It deliberately does **not** check out `references/`.
- **Biome is the single linter and formatter** for TS/TSX/JSON; prettier is retained for Markdown only. `pnpm format` runs both, `pnpm lint` runs `biome ci .` (fails on errors, reports warnings).
- **Tests** run from one root Vitest config using `projects` (`workspace` is deprecated). `pnpm test` is the single entry point. `resolve.conditions` includes `development` on purpose — Solid compiles its correctness diagnostics out of the production build, so a prod-condition suite cannot see them.
- **Three quarantines**, all keyed to code the restructure replaces. Remove each when its target goes.
  - `@solidifront/start` is filtered out of `pnpm typecheck`.
  - `@solidifront/storefront-client`'s live-API suite is excluded from the Vitest projects and renamed to `test:live`.
  - `example-basic` is filtered out of the **CI** build (`BUILD_FILTER` in `ci.yml`). It validates `SHOPIFY_PUBLIC_STORE_NAME` and three siblings at Vite config time, so it cannot build without live credentials — `pnpm turbo build` is 8/8 locally with `examples/basic/.env` present and 7/8 without it. **The per-PR gate is credential-free by design**; secrets belong to the nightly. Watch for this shape: a local green that a clean checkout cannot reproduce.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `kookikodes/solidifront`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context — a root `CONTEXT-MAP.md` pointing at one `CONTEXT.md` per package. See `docs/agents/domain.md`.
