# Analytics and OTEL never share a pipeline

Both subsystems "record that something happened", which is exactly why the boundary is drawn once, here, rather than re-derived in [#19](https://github.com/KookiKodes/solidifront/issues/19). **Analytics records what the shopper did, for the merchant, delivered to third parties, consent-gated. OTEL records what solidifront did, for the operator, delivered to their collector, never consent-gated.** Decided in [#18](https://github.com/KookiKodes/solidifront/issues/18).

The boundary is the **audience**, not the mechanism. Two systems that both observe a cart mutation are not duplicating work if one is answering "how is the store selling?" and the other "why did that take 900ms?".

## The one-way rule

A span **may** record that an analytics event was published — a span event on the cart operation, naming the event. An analytics payload **never** carries trace context.

Both directions are closed for specific reasons, not symmetry:

- **Spans → analytics would smuggle un-gated data into a consent-gated channel.** A trace id is not consent-gated, and a destination forwards to a third party. Putting operator identifiers into a GA4 or Meta payload is a data-flow nobody signed off on.
- **Analytics → spans is fine but must stay one-way**, because the moment a span attribute is _derived_ from a consent-gated payload, the span's un-gated delivery becomes a consent question, and the entire reason this boundary exists is that it should not be.

Correlation, when an operator wants it, happens in their own tooling against their own identifiers. Solidifront does not build the join.

## Why this is not a re-litigation of #30

[#30](https://github.com/KookiKodes/solidifront/issues/30) already drew half the line: OTEL's server spans come from **Effect operations only** — `Effect.fn`/`withSpan` on the path [#13](https://github.com/KookiKodes/solidifront/issues/13) routes all Shopify traffic through, which [#25](https://github.com/KookiKodes/solidifront/issues/25) found is already traced — so no Solid primitive traces server-side, and #13's missing response-completion hook never becomes a tracing problem.

This ADR completes it from the analytics side: **no analytics primitive uses a server effect phase either.** Server-side analytics events originate in middleware and in cart operations — Effect code, the same two seams #13 established — not in a Solid effect phase. So the two subsystems overlap in _where the code lives_ (both are Effect-shaped server-side) and nowhere else.

The practical consequence: a cart mutation emits both a span and an analytics event as **two independent emissions from the same operation**, never one fanned out into the other.

## Consequences

**#19 inherits the sole use of #37.** [#37](https://github.com/KookiKodes/solidifront/issues/37)'s cross-environment dedup — `createUniqueId()` plus `sharedConfig` serialization, server wins, client suppresses its first run — is not used by analytics at all: every destination is a browser destination, the gate reads a browser global, and the buffer is per-page, so there is nothing for a server effect phase to do. Worth stating plainly, because if OTEL also turns out not to need it, a mechanism two prototypes were spent on has no consumer.

**#19's scope narrows to spans.** The span set, the `shopify.*` / `cart.*` semantic conventions, and browser OTEL are all still its. What is no longer open there is whether analytics events become spans, or whether a shared instrumentation abstraction sits above both. They do not, and it does not.

**Analytics is browser-first, OTEL is server-first, so for v1 they barely touch.** Browser OTEL carries `otel-and-testing.md` §2.2's context-manager problem and belongs to #19; browser analytics does not, because it has no notion of causal parenting to lose.
