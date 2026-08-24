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
The Shopify API version a storefront is built against. It fixes both the URL an operation is sent to and the schema its types are generated from — the two can never drift apart.
_Avoid_: apiVersion, API level, target version

**Fall-forward**:
Shopify serving an operation against a version other than the one requested, because the requested one is past end-of-support. Observable on the response, never inferred.
_Avoid_: version fallback, downgrade, version drift

**In-context injection**:
Adding the `@inContext` directive and its variables to a document at build time, so every operation carries the locale, buyer identity and consent of the request that runs it. Which arguments exist is a property of the pinned API version, never a fixed list.
_Avoid_: localization middleware, context decoration

**Locale**:
A country and language pair that determines pricing, currency, and translation for an operation.
_Avoid_: region, i18n, culture

**Market**:
A Shopify Markets configuration a locale belongs to. A market has many locales; a locale belongs to one market.
_Avoid_: storefront, region

**Buyer identity**:
Who is shopping, and from where. A property of the request, established once and read by every operation — not something a cart owns. The cart and `@inContext` see different projections of the same value.
_Avoid_: user, session, account

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
