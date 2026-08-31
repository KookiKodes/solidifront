# Solidifront

A collection of utilities for building Shopify storefronts on Solid 2.0, built on Effect. This glossary fixes the words the project uses; it is not a spec.

## Language

### Library shape

**Core**:
The framework-free layer. Effect services and layers that know Shopify but know nothing about Solid.
_Avoid_: SDK, base, kernel

**Primitive**:
A Solid-reactive function the library exposes, built on the core. The contract consumers are expected to build against.
_Avoid_: hook, composable, helper

**Component**:
An opinionated Solid component shipped for fast setup, built on primitives. Always optional.
_Avoid_: widget, block

**Server integration**:
The server-only surface — middleware, request context, and `"use server"` wiring.
_Avoid_: adapter, start, runtime

**App layer**:
The merged Effect layer for one environment. It holds everything that lives for the whole process; request-scoped values are never part of it.
_Avoid_: runtime, container, root layer

**Runtime**:
An Effect `ManagedRuntime` built from an app layer, one per environment, for the life of the process. The word is reserved for this and nothing else — not the server integration surface, and not Solid's server-function machinery.
_Avoid_: container, executor, effect runtime

### Commerce domain

**Storefront client**:
The thing that executes an operation against the Shopify Storefront API. Owns versioning, transport, and context injection.
_Avoid_: API client, fetcher, SDK

**Operation**:
A single GraphQL query or mutation sent to a Shopify API.
_Avoid_: request, call

**Document**:
The GraphQL text a developer writes for one operation.
_Avoid_: query string, gql, tag

**Generated operation**:
What codegen produces from a document — the document after in-context injection, its schema, and its types, as one module. The only thing a storefront client accepts.
_Avoid_: typed document, document node, artifact

**Pinned API version**:
The Shopify API version a storefront is built against. It fixes both the URL an operation is sent to and the schema its types are generated from — the two can never drift apart. There is exactly one, and it governs the Storefront and Customer Account APIs together.
_Avoid_: apiVersion, API level, target version, CAAPI version

**Fall-forward**:
Shopify serving a request against a version other than the one requested, because the requested one is past end-of-support. Observable on a data response, which echoes the version served; **silent** when a schema is fetched, which echoes nothing — so on that path it is ruled out in advance from the version registry rather than detected after the fact.
_Avoid_: version fallback, downgrade, version drift

**Retired version**:
A pinned API version Shopify no longer serves. It is recognised by its **absence** from the supported set, never by a flag, and it fails the build — distinct from a **pre-release version**, which is present in the supported set, marked unsupported, and only warns.
_Avoid_: unsupported version, deprecated version, expired version

**Schema tier**:
The privilege level a given Customer Account schema describes. Solidifront can only obtain the standard tier, which is also the surface Shopify documents — its own reference pages render exactly that tier — so a field Shopify does not document cannot be named in a consumer's code, and no configuration moves the boundary. Customer Account only; the Storefront API has no tier, and its documented boundary is **privately documented** instead — which a consumer _can_ cross, because their own store serves it.
_Avoid_: scope, privilege, access level, plan

**Privately documented**:
A field a Shopify API serves but publishes no reference page for, marked by Shopify's own `isPrivatelyDocumented` flag. Solidifront ships no operation that touches one, and warns rather than blocks when a consumer's document selects one — the boundary is a scope rule for the library, not a limit on the consumer's store ([ADR-0016](docs/adr/0016-solidifront-ships-only-what-shopify-documents.md)).
_Avoid_: undocumented, private field, internal, hidden

**In-context injection**:
Adding the `@inContext` directive and its variables to a document at build time, so every operation carries the locale, buyer identity and consent of the request that runs it. Which arguments exist is a property of the pinned API version, never a fixed list.
_Avoid_: localization middleware, context decoration

**Locale**:
A country and language pair that determines pricing, currency, and translation for an operation. It is the only localization concept solidifront models: a locale has no URL of its own, and no market it reports belonging to.
_Avoid_: region, i18n, culture

**Market**:
The Shopify-admin configuration that decides which locales a storefront offers. It explains where a locale set comes from, and is deliberately absent from every solidifront type and signature — the Storefront API no longer exposes it, so nothing could observe it anyway.
_Avoid_: storefront, region

**Locale table**:
The record of every locale a shop offers, generated from the shop's own localization data. It is the source of the locale type consumers see, so a locale that does not exist in the shop cannot be named in their code.
_Avoid_: countries map, locale list, i18n config

**Locale prefix**:
The leading URL segment naming the locale a page is being viewed in. The default locale has none, so its pages keep unprefixed URLs.
_Avoid_: path prefix, locale segment, market path

**Locale carrier**:
The cookie reporting which locale's page a request came from. It exists because a server-function request has no URL to read a locale out of, and it records a resolution that already happened — never a visitor's preference.
_Avoid_: locale cookie, preference cookie, i18n cookie

**Locale suggestion**:
The locale a visitor's `Accept-Language` header matches. It is offered to them and never acted on, which is what separates it from the resolved locale — that one comes from the URL.
_Avoid_: detected locale, preferred locale, browser locale

**Buyer identity**:
Who is shopping, and from where. A property of the request, established once and read by every operation — not something a cart owns. The cart and `@inContext` see different projections of the same value.
_Avoid_: user, session, account

**Customer session**:
What a storefront stores to keep a customer signed in, and the lifecycle of that state. It is how a storefront knows the buyer identity, never the identity itself — a session is storage, a buyer identity is a property of the request.
_Avoid_: auth session, user session, login, credentials

**Login attempt**:
What a storefront remembers between sending a visitor to Shopify to sign in and receiving them back. It expires on its own and is discarded whether the sign-in succeeds or fails, which is what separates it from a customer session.
_Avoid_: pending login, oauth state, handshake, flow

**Customer access token**:
The one credential a signed-in customer has. A customer session obtains it from the Customer Account API's OAuth flow; it authorizes Customer Account operations and, unchanged and unexchanged, identifies the buyer to the Storefront API. The definite article is the whole point of the term — an earlier design had a second, storefront-only token minted from this one, and it does not exist ([ADR-0015](docs/adr/0015-the-customer-account-access-token-is-the-buyer-identity-credential.md)).
_Avoid_: storefront customer access token, customer token, buyer token, SFAPI token

**Consent**:
The visitor's privacy choice, which gates where analytics events are allowed to go. It gates destinations, not the recording of events.
_Avoid_: opt-in, GDPR flag, tracking permission

**Cart**:
The Shopify-owned collection of lines a buyer intends to purchase. Checkout is off-domain — it happens on Shopify, not in a solidifront storefront. The boundary is a scope rule, not just a description: an API that advances checkout is outside the cart.
_Avoid_: basket, order, bag

**Cart operations**:
The service whose members are the cart mutations, each named for the mutation it sends. Consumers replace a member by layer, and a replacement receives the one it replaces.
_Avoid_: cart handler, cart methods, cart client

**Optimistic line**:
A cart line that exists only in the browser, before Shopify has confirmed it. Identified by what was added rather than by a server id, so the same merchandise added twice is one line.
_Avoid_: pending line, local line, temp line

**Storefront passthrough**:
The same-origin endpoint that relays to the Storefront API. It exists solely so Shopify's browser scripts get an origin-exempt, cookie-bearing Storefront API; solidifront's own data path never uses it.
_Avoid_: proxy, storefront proxy, SFAPI proxy

**Tracking headers**:
The response headers that must land on the document for Shopify's browser scripts to establish visitor identity. Read back via the Performance API, not from `document.cookie`.
_Avoid_: analytics cookies, tracking cookies

**Minted tracking tokens**:
Tracking token values solidifront generates itself when the visitor has no Shopify cookie yet, as opposed to _captured_ ones, which come back from a real Storefront API response. Minted values are a floor, never an upgrade.
_Avoid_: fallback tokens, generated tokens, fake tokens
