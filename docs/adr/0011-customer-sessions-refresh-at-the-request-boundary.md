# A customer session refreshes at the request boundary, and there is no refresh endpoint

A customer session's tokens are refreshed in middleware, before the handler runs, and on a server-function response. They are never refreshed during page SSR. Consequently solidifront serves **three** `/account/*` routes — `login`, `authorize`, `logout` — and no `/account/refresh`. Decided in [#17](https://github.com/KookiKodes/solidifront/issues/17).

## Why not refresh where the token is used

The obvious design refreshes lazily, at the operation that needs a token. It cannot work here, and the reason is a Solid constraint rather than a Shopify one.

A customer session is stored in a cookie ([ADR-0012](./0012-customer-authentication-is-a-requirement-not-an-argument.md)), so persisting a rotated refresh token means writing a response header. [#27](https://github.com/KookiKodes/solidifront/issues/27) established that `event.response` **commits at shell flush** and a later write throws in the dev build; [#15](https://github.com/KookiKodes/solidifront/issues/15) established that cookies are written only on server-function responses. So an operation resolving below a `<Loading>` boundary can refresh but cannot store the result.

That failure is not a dropped header. Shopify may have already invalidated the old refresh token, so the storefront has spent the session's only means of renewal and has nowhere to put what it got back. The visitor is silently signed out on their next request, and nothing on this one looks wrong.

Middleware and server-function responses are the two points where the response is guaranteed writable. Refreshing only there makes the write always possible instead of usually possible.

## Why the refresh endpoint disappears

Hydrogen ships `GET /account/refresh` as a full-page redirect, and its docs make the app detect the refresh-needed state, redirect once, and hand-roll a one-shot loop guard against redirecting forever.

That route exists _only because_ Hydrogen cannot refresh mid-render. Refreshing at the request boundary removes the condition the route exists to work around: by the time any handler runs, the session is either fresh, absent, or unreachable. There is no state left for a redirect to fix. The route, the dance, the guard param, and their failure UX all go together.

This is the second instance of the same finding on this map. [#27](https://github.com/KookiKodes/solidifront/issues/27) reached it for tracking identity — "server functions are the upgrade channel, so there is **no refresh endpoint**" — from the same constraint, in a different subsystem. Two subsystems independently concluding that the writable-response boundary is the only place to renew state is worth treating as a property of the platform, not a coincidence.

## What the 120-second buffer is for

Hydrogen bakes staleness in at write time: `expiresAt = now + (expires_in - 120)s`, so a token reports stale two minutes early. Under lazy refresh that constant is arbitrary padding.

Under boundary refresh it has a job: the token must stay valid for the whole request it was checked at the start of. The buffer is the request's latency budget, which is the first principled reading the constant has had.

## Consequences

**A refresh costs one round trip.** The token endpoint, and nothing after it.

> **Corrected by [ADR-0015](./0015-the-customer-account-access-token-is-the-buyer-identity-credential.md).** This ADR originally recorded **two** round trips, on #17's finding that filling buyer identity needed a separate _storefront_ customer access token minted by `storefrontCustomerAccessTokenCreate` — a mutation whose payload carries no expiry field, so coupling its renewal to the refresh cycle was the only available signal. [#45](https://github.com/KookiKodes/solidifront/issues/45) refuted that: there is one credential, the exchange is deprecated and unnecessary, and the unobservable-lifetime hazard goes with it.

The conclusion above is unaffected — `/account/refresh` disappears because of [#27](https://github.com/KookiKodes/solidifront/issues/27)'s shell-flush commit, not because of what a refresh costs. But the figure fed the latency-budget reading above, and the budget is roughly twice as generous as this ADR assumed. [#40](https://github.com/KookiKodes/solidifront/issues/40) should weigh single-flight against one round trip, not two.

**A failed refresh has two outcomes, not one.** Hydrogen collapses both into `undefined`, so a caller cannot tell "signed out" from "Shopify is down." Solidifront keeps them apart: a 400/401 clears the session and the request proceeds anonymous, because a signed-out visitor is a valid state and not an error; any other failure leaves the session intact and withholds the authenticated context, so Customer Account operations fail with a typed error and everything else renders normally. Degrading a signed-in customer to anonymous during an outage would show them anonymous pricing and an empty account — wrong data, which [#14](https://github.com/KookiKodes/solidifront/issues/14) treats as the failure class worth engineering against.

**Reading a session is three-valued.** Signed in, anonymous, or signed in and unreachable. A boolean would force the third case to impersonate the second, which is the collapse above reintroduced at the read API.

**Concurrent requests can race.** Two requests from one browser can both reach the boundary with the same expired token and both present the same refresh token. Hydrogen's single-flight guard is an in-closure `Map`, per-instance and per-process, keyed on the _old_ refresh token — no help across isolates, and a cookie store shares no state at all. Whether Shopify rotates refresh tokens at all decides how bad this is, and it is unverified: [#40](https://github.com/KookiKodes/solidifront/issues/40).

**The routes are not configurable.** `redirect_uri` must byte-match what is registered in the Shopify dev dashboard, so a config field buys a footgun whose failure surfaces as an opaque Shopify error. Hydrogen hardcodes `${origin}/account/authorize`; solidifront does too. The paths are served from middleware, which [#13](https://github.com/KookiKodes/solidifront/issues/13) established as the single request-scope seam and [#27](https://github.com/KookiKodes/solidifront/issues/27) already uses to serve the storefront passthrough.
