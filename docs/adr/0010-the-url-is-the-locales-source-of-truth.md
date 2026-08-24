# The URL is the locale's source of truth, and switching is a navigation

A page's locale is whatever its URL says: a locale prefix names a non-default locale, an unprefixed path is the default one. Switching locale is therefore a navigation, not a state change, and nothing else may contradict the URL. Decided in [#16](https://github.com/KookiKodes/solidifront/issues/16).

Resolution order is **locale prefix → locale carrier → default**, with one built-in strategy (path prefix), no automatic redirects, and `Accept-Language` demoted to a suggestion that is offered and never acted on.

## Why the URL wins

The alternative is a stored preference — the shape today's `createLocaleMiddleware` implements, reading a cookie first and never looking at the URL at all. Under it, a link to `/fr-ca/products/x` renders in the recipient's own locale. Link sharing, canonical URLs, and per-URL cacheability all break at once, and the page's address stops describing the page.

## Why there is a cookie at all, and why it is not a preference

Middleware fronts every request the Solid plugin dispatches — page SSR, the server-function endpoint, and API routes, sharing one event. But server functions POST to `/_server`, which carries no locale prefix. A URL-authoritative resolver therefore sees `/fr-ca/products/x` on the page render and a bare `/_server` on every mutation that follows, and without a second carrier every server function would silently run in the default market.

The cookie is that carrier and nothing more: it is written **only** when resolution came from the URL, so it records a decision that already happened rather than a guess. Today's middleware writes it on every request, which freezes the first visit's `Accept-Language` guess permanently and lets no later visit correct it — a bug, not a convention worth preserving.

## Why switching is a navigation

The rejected alternative is a reactive client-side locale that every operation reads, switching markets with no navigation. It fails twice. The URL would say `en-us` while the page renders French, contradicting the rule above; and it forces locale into the signature of every server function.

The navigation model also makes [#21](https://github.com/KookiKodes/solidifront/issues/21)'s hazard structurally unreachable. That ticket established that a layer-read locale is invisible to Solid's tracking, so a market switch would silently fail to re-run queries. If a locale can only change by navigating, there is no locale change without a fresh request, and no stale query left to re-run.

The same reasoning bounds the per-call `context` override to exactly one operation: an override that propagated would be that failure reintroduced through the call site.

## Why nothing redirects, and what that costs `Accept-Language`

An unprefixed path renders the default locale. Auto-redirecting it to a visitor's matched locale would make the storefront's most-linked URL personalized and uncacheable, split SEO signal across locales, and act on a signal Google advises against acting on.

This has a consequence worth stating plainly, because it is easy to reintroduce by accident: since the URL always yields an answer for a page request, **`Accept-Language` is never authoritative anywhere**. Its only role is computing a suggestion a consumer may render ("Shop in Français?"). A future change that makes it decide anything is a change to this ADR, not an implementation detail.

The default locale is therefore **unprefixed**, which is an accepted asymmetry: link-building special-cases it. Prefixing every locale uniformly would be tidier and forces `/` to become a redirect, which is the thing being rejected.

## Consequences

**The resolver is opinionated, not configured.** Ordering is fixed, geolocation is excluded (it is platform-specific — `oxygen-buyer-country`, `cf-ipcountry`, `x-vercel-ip-country` — for a signal Shopify itself calls a hint), and one strategy ships. The single knob is an override for the default locale, plus the documented escape hatch of providing `locale` yourself.

**Path prefix is the only built-in strategy.** Subdomain and per-market-domain mapping can only ever be consumer config: `Localization` exposes no web-presence or domain data at all — introspection against a current schema returns only `availableCountries`, `availableLanguages`, `country`, `language`. A consumer with per-country domains supplies a host→locale source rather than selecting a shipped strategy.

**An unrecognised prefix is an ordinary path segment.** The valid prefix set is known at build time from [ADR-0009](./0009-the-locale-table-is-generated-at-build-time.md)'s table, so the router matches only real prefixes and `/xx-yy` hits another route or 404s on its own — no special-case error, no redirect, no runtime validation.

**The resolved locale reaches the call site through an accessor, not a global type augmentation.** Solid 2's documented convention is `declare module "@solidjs/web" { interface RequestEventLocals { … } }`, but that is an unconditional library claim on the generic key `locale`. Solidifront writes a branded symbol key and exposes `getLocale()`, matching [#13](https://github.com/KookiKodes/solidifront/issues/13)'s two-APIs-named-apart shape.
