# The locale table is generated at build time from the shop's own localization

Codegen queries `localization` against the consumer's own store at build time and emits a real module under `.solidifront/` describing every locale the shop offers. The literal union derived from that module is the type every locale-taking API accepts, so a locale the shop does not sell cannot be named in consumer code. Decided in [#16](https://github.com/KookiKodes/solidifront/issues/16).

## Why build time rather than a runtime service

A runtime `Localization` service in the app layer would always be current, and market configuration is merchant data that changes in the Shopify admin without a code change — which is the honest argument for it. It was rejected because the whole value of this table is the **literal type**: `{ locale: "fr-CA" }` typechecking against the shop's actual markets is something neither Hydrogen can offer, and a runtime service can only ever produce `CountryCode`/`LanguageCode` — the full ~200-country enum.

The objection that decided it in the other direction turned out to be false. A build-time fetch was assumed to force Storefront credentials into the build, which would have collided with the credential-free posture of the per-PR gate. It does not: `localization` is readable **tokenless**, verified against `mock.shop` (28 countries, 84 country×language pairs, 6.4 KB, no access token and no `Origin` header). This matches [#12](https://github.com/KookiKodes/solidifront/issues/12)'s re-confirmed tokenless Storefront reads, which are not origin-gated.

The data is also small and near-static, and the fetch rides the `.solidifront/` cache [ADR-0006](./0006-an-operation-is-a-generated-module-not-a-string.md) already established for introspection — so `pnpm dev` works offline after the first run.

**The accepted cost:** the table is a build-time snapshot. A merchant enabling a market in the admin does not appear in the switcher until the storefront is rebuilt. If that becomes untenable, the replacement is a runtime service _in addition to_ the table (truth at runtime, types at build time) — not instead of it, because removing the table removes the literal union that justified this decision.

## Why not fall back to the schema's enums when the shop is unreachable

Falling back to every `CountryCode`/`LanguageCode` in the schema would keep the build green with no store and no network. Rejected: it silently widens "this shop's three locales" to all ~200 countries, converting a loud build failure into a type-level lie about which markets exist. A cold clone with no reachable store fails `tsc` loudly instead — the same window [ADR-0005](./0005-the-api-version-type-is-open-and-narrowed-by-codegen.md) already accepts for the version registry.

Having the consumer commit the generated table to source control was also considered, and is defensible — it makes consumer CI hermetic — but `.solidifront/` is a cache, and it puts a manual regen-and-commit step between a merchant's market change and the storefront reflecting it.

## Why rows carry raw data and no display label

Today's plugin bakes ``label: `${language.name} (${currency.isoCode} ${currency.symbol})` `` into its output — `"English (CAD $)"`, composed in English at build time. A row now carries `isoCode`, country `name`, `language`, `endonymName`, and currency `isoCode` + `symbol`, and nothing pre-composed: the word order and typography of that string are wrong in most of the locales the table exists to serve, and `endonymName` (`"Français"`, not `"French"`) is already the right primitive for a switcher. Composition belongs to the consumer's component, where `Intl` lives.

## Consequences

**Solidifront's own CI has no store**, and the direct proxy [#12](https://github.com/KookiKodes/solidifront/issues/12) relies on serves schemas, not shop locales — so it cannot cover this. A `mock.shop` response is committed as the fixture: tokenless, real, and already that ticket's canary store.

**The cache is keyed by store domain and API version**, not version alone — the table is a property of the shop, unlike introspection.

**`@solidifront/vite-plugin-generate-shopify-locales` is deleted, not rewritten.** Its concept survives inside `@solidifront/vite`, per [ADR-0001](./0001-package-topology-splits-on-layer-not-domain.md)'s rule that the Vite package absorbs all codegen. Emitting a real file rather than a virtual module is what retires the plugin's hand-maintained ambient `.d.ts` — the artifact that ships broken on npm today, importing a deprecated package it does not depend on.
