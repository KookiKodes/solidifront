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

## Agent skills

### Issue tracker

Issues live as GitHub issues in `kookikodes/solidifront`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context — a root `CONTEXT-MAP.md` pointing at one `CONTEXT.md` per package. See `docs/agents/domain.md`.
