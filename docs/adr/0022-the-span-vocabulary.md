# The span vocabulary

There are no ecommerce OTel semantic conventions and none are planned — verified four ways in `otel-and-testing.md` §5.4 against the attribute registry, the repo's `model/` directory, code search, and the [Semconv 2026 Roadmap](https://github.com/open-telemetry/semantic-conventions/issues/3330), which lists every active sub-SIG and contains no commerce or retail one. So solidifront defines its own vocabulary. This ADR fixes it, and fixes the three rules that generate it. Decided in [#19](https://github.com/KookiKodes/solidifront/issues/19).

## Rule 1 — semconv first; invent only what nothing names

Where a **stable** semantic convention already names a fact, use its key. Invent a key only for a fact upstream does not name.

This is not deference for its own sake; it deletes keys. `shopify.shop_domain` appears in §5.4's candidate list and **does not exist** in the vocabulary below, because the Storefront API host _is_ the shop domain and `server.address` already names it. One fact, one key, and the key that has semver 2.0 guarantees behind it.

Unstable conventions are used but pinned: `graphql.*` is Development and imported from `@opentelemetry/semantic-conventions/incubating`, which documents that it "MAY contain breaking changes in minor releases". Pin the package.

## Rule 2 — namespace by who the fact is about

- **`shopify.*`** — facts Shopify itself names and echoes. `shopify.api_version`, `shopify.request_id`, `shopify.cart_id`.
- **`solidifront.*`** — facts about what solidifront did. `solidifront.request_id`, `solidifront.cart.operation`, `solidifront.cart.user_error_count`.

The split exists because the two namespaces carry **opposite collision risk**. If Shopify ever publishes conventions it owns `shopify.*`, and a collision on `shopify.request_id` is _desirable alignment_ — same key, same meaning, their definition winning. A bare `cart.*` is the opposite: it is generic, unprefixed, and precisely what a future ecommerce SIG would claim first, and solidifront would lose that argument. So `cart.*` as a top-level namespace is rejected; cart facts live under whichever of the two owns them.

This is [ADR-0016](./0016-solidifront-ships-only-what-shopify-documents.md)'s instinct applied to telemetry: name Shopify's things in Shopify's vocabulary, own your own behaviour under your own name.

Span **names** take no namespace prefix — OTel span names are not namespaced by convention, and provenance is what the attributes are for.

## Rule 3 — a span attribute may never carry request data

Only a bounded, enumerated set of attributes is ever set. Request variables and response bodies are **deleted from the instrumentation path**, not redacted.

The existing log annotations show why redaction is the wrong mechanism. `StorefrontClient.ts:340` redacts `variables.buyer` **only in the browser** and passes it raw on the server — and per [ADR-0015](./0015-the-customer-account-access-token-is-the-buyer-identity-credential.md) buyer identity carries the customer's OAuth access token directly. A server-only span pillar exports exactly the branch that redacts nothing. A redaction rule that has already been got wrong once, in the direction that matters, is not a rule worth porting; an allowlist cannot be got wrong the same way.

`graphql.document` is the one deliberate exception, and it is a _switch_, default off, not a deletion: a document is the consumer's own static text with no request data in it, so refusing to expose it at all would be over-reach. It stays off because attaching full documents to every span is expensive.

## The set

**Both spans:** `solidifront.request_id` (see [ADR-0021](./0021-solidifront-ships-no-request-root-span.md)).

**Storefront-client span** — name `storefront.query {OperationName}` / `storefront.mutate {OperationName}`, kind `client`:

| Attribute                    | Source                         |
| ---------------------------- | ------------------------------ |
| `graphql.operation.name`     | `GraphQLOperation.extractName` |
| `graphql.operation.type`     | `validate({ type })`           |
| `graphql.document`           | opt-in switch, default off     |
| `http.request.method`        | always `POST`                  |
| `http.response.status_code`  | response                       |
| `server.address`, `url.full` | pinned endpoint                |
| `shopify.api_version`        | pinned API version             |
| `shopify.request_id`         | GraphQL `extensions`           |
| `error.type`                 | on failure                     |

The name is set **explicitly** because the HTTP convention would name every span `POST` — §5.2 forbids defaulting to the URI path as a target, and every Storefront API call is a `POST` to one URL. Operation names come from generated operations, a set fixed at build time, so the cardinality is bounded. This also retires the name `executeRequest` (`StorefrontClient.ts:161`), where `request` is on `CONTEXT.md`'s avoid-list for **Operation**.

**Cart-operation span** — name the **verbatim member name** (`cartLinesAdd`), kind `internal`:

| Attribute                           | Source                                   |
| ----------------------------------- | ---------------------------------------- |
| `solidifront.cart.operation`        | the member name                          |
| `solidifront.cart.user_error_count` | `userErrors.length`                      |
| `shopify.cart_id`                   | **query component stripped** — see below |

Span events carry one entry per user error with its `code` and `field`. `field` is a path into the mutation _input_ per [ADR-0008](./0008-cart-operations-are-one-service-overridden-by-layer.md), not a line id, so it is low-cardinality.

The span is named for the member verbatim rather than §7.3's suggested `cart.linesAdd`, because ADR-0008 made verbatim naming load-bearing: the member, the GraphQL mutation, and now the span are **one word** a consumer can grep across their own `Layer.updateService` override, Shopify's docs, and their trace viewer. Trimming the prefix would add a third name for one concept.

Two spans, not three: the `HttpClient` layer gets none — it would duplicate the client span's timing for no added structure, and it is the one that would come from `unstable/http`, which [ADR-0020](./0020-a-peer-range-is-bounded-only-where-upstream-licenses-a-break.md) is minimising.

## `shopify.cart_id` is stripped, because a cart id contains a capability

A Storefront API cart id has the shape `gid://shopify/Cart/<id>?key=<32-hex>`. That `key` is **not part of the identifier** — it is a capability: holding id and key together is sufficient to read and modify the cart. Confirmed against a live cart id while resolving #19.

So the query component is stripped before the attribute is set. Setting the raw value would put a cart-mutation capability into the operator's collector — Rule 3 violated through a field that looks like an id rather than through a payload. Omitting the cart id entirely was considered and rejected: it is the join an operator needs for "why did this shopper's cart break", and the stripped form carries no capability.

## `userErrors` never set span status `Error`

ADR-0008 established that `userErrors` are a **success value** — the Storefront API returns the cart _and_ the errors, a partial success resolved to targets at the call site.

OTel span status is a two-state operator signal, so mapping `userErrors` onto `Error` would put ordinary merchandising outcomes — "quantity not available" — into the operator's error rate, which is the fastest way to make an error dashboard worthless. The count and the per-error events carry the information; the status stays `Ok`.

`Error` status and `error.type` are reserved for the three cases where solidifront itself failed: transport, decode, and GraphQL top-level `errors`.

## Consequences

- **The migration is mostly deletion.** Of the six `Effect.annotateLogsScoped` sites, three migrate (operation name/type, api version, `extensions` → `shopify.request_id`) and three are deleted outright (`variables`, `data`, `accessToken`). `withNamespacedLogSpan` and `utils/logger.ts` go with them — a log span is a second, weaker answer to the question a real span answers, under a name that invites confusion with it. `GraphQLOperation.ts:105`'s `filterLevelOrNever(LogLevel.None, …)` block computes annotations and discards them, and is removed rather than ported.
- **Instrumentation is unconditional; export is opt-in.** [#25](https://github.com/KookiKodes/solidifront/issues/25) found there is no "no tracer installed" state — `Tracer.Tracer` defaults to a real `NativeSpan`-building tracer and `TracerEnabled` defaults to `true`, so a span costs ~1900–3950ns whether or not anyone exports. Gating the span calls behind a flag would buy nothing, so they stay unconditional and `@solidifront/otel` supplies only the export path.
- **Solidifront sets no resource attributes.** `service.name` is the operator's fact, not the library's, and the two facts solidifront uniquely knows (shop domain, API version) are already per-span. Writing none means the `OTEL_*`-vs-explicit-config precedence question — flipped, shipped, reported ([Effect-TS/effect#6742](https://github.com/Effect-TS/effect/issues/6742)) and reverted upstream inside eight weeks, catchable by no type check and by no canary — **cannot apply to solidifront at all.** Dodging an upstream bug by holding no stake in it beats managing it.
