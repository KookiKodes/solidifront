# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

> **Provisional.** The context split below mirrors today's package layout. A restructure is planned ahead of the Solid 2.0 RC that will consolidate packages and rework the underlying plugin — expect the set of contexts to change, and update this file when it does.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`CONTEXT.md`** inside the package you're working in.
- **`docs/adr/`** at the root for system-wide decisions, plus `packages/<package>/docs/adr/` for context-scoped decisions in the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a multi-context repo — a pnpm monorepo where each published package is its own context.

```
/
├── CONTEXT-MAP.md                     ← points at each package's CONTEXT.md
├── docs/adr/                          ← system-wide decisions
│   ├── 0001-....md
│   └── 0002-....md
├── packages/
│   ├── storefront-client/
│   │   ├── CONTEXT.md
│   │   ├── docs/adr/                  ← context-specific decisions
│   │   └── src/
│   ├── start/
│   │   ├── CONTEXT.md
│   │   ├── docs/adr/
│   │   └── src/
│   ├── codegen/
│   │   └── …
│   ├── utils/
│   │   └── …
│   └── plugins/
│       └── vite-plugin-generate-shopify-locales/
│           └── …
├── apps/
└── examples/
    └── basic/                         ← consumer of the packages, not its own context
```

Workspace globs (`pnpm-workspace.yaml`): `apps/*`, `packages/*`, `packages/plugins/*`, `examples/*`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
