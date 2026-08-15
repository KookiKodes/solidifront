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

### Commerce domain

**Storefront client**:
The thing that executes an operation against the Shopify Storefront API. Owns versioning, transport, and context injection.
_Avoid_: API client, fetcher, SDK

**Operation**:
A single GraphQL query or mutation sent to a Shopify API.
_Avoid_: request, call

**In-context injection**:
Adding the `@inContext` directive and its variables to an operation at build time, so every operation carries country, language, and buyer identity.
_Avoid_: localization middleware, context decoration

**Locale**:
A country and language pair that determines pricing, currency, and translation for an operation.
_Avoid_: region, i18n, culture

**Market**:
A Shopify Markets configuration a locale belongs to. A market has many locales; a locale belongs to one market.
_Avoid_: storefront, region

**Buyer identity**:
The customer context attached to a cart and to `@inContext` — who is shopping, and from where.
_Avoid_: user, session, account

**Consent**:
The visitor's privacy choice, which gates where analytics events are allowed to go. It gates destinations, not the recording of events.
_Avoid_: opt-in, GDPR flag, tracking permission

**Cart**:
The Shopify-owned collection of lines a buyer intends to purchase. Checkout is off-domain — it happens on Shopify, not in a solidifront storefront.
_Avoid_: basket, order, bag

**Storefront passthrough**:
The same-origin endpoint that relays to the Storefront API. It exists solely so Shopify's browser scripts get an origin-exempt, cookie-bearing Storefront API; solidifront's own data path never uses it.
_Avoid_: proxy, storefront proxy, SFAPI proxy

**Tracking headers**:
The response headers that must land on the document for Shopify's browser scripts to establish visitor identity. Read back via the Performance API, not from `document.cookie`.
_Avoid_: analytics cookies, tracking cookies

**Minted tracking tokens**:
Tracking token values solidifront generates itself when the visitor has no Shopify cookie yet, as opposed to _captured_ ones, which come back from a real Storefront API response. Minted values are a floor, never an upgrade.
_Avoid_: fallback tokens, generated tokens, fake tokens
