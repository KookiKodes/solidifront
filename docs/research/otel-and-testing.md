# OpenTelemetry and E2E testing for solidifront

**Date of research:** 2026-08-14
**Scope:** (a) OpenTelemetry through a Solid 2.0 / SSR Shopify storefront, (b) end-to-end testing of the commerce flow for a *library* that must test both its own units and a consuming storefront.

Version-sensitive claims are backed by `npm view` output taken on 2026-08-14, by primary documentation URLs, or by file paths inside `references/` (read-only submodules of effect, hydrogen, solid, alchemy — never modified). Anything I could not verify is labelled `[UNVERIFIED]` and repeated in the closing section.

Companion document: `docs/research/current-state-audit.md`.

---

## What this means for solidifront

Twelve conclusions. Everything below is evidence for these.

**On OTEL**

1. **You are already one line of wiring away from your first span, and you don't know it.** `packages/storefront-client/src/services/StorefrontClient.ts:162` uses `Effect.fn("executeRequest")`. `Effect.fn(name, options?: SpanOptionsNoTrace)` is the *traced* variant (`references/effect/packages/effect/src/Effect.ts:13600`, `@since 3.11.0`, so present in the pinned `effect ^3.19.12`). Provide a tracer layer and that span appears with zero code change.

2. **But almost all your existing observability is invisible to OTEL.** `withNamespacedLogSpan` (`packages/storefront-client/src/utils/logger.ts:14`) wraps `Effect.withLogSpan`, whose entire implementation is (`references/effect/packages/effect/src/Effect.ts:14062-14067`) pushing `[label, timestamp]` onto `CurrentLogSpans`. It is a **log** decoration, not a trace span. The `Query` and `Mutation` "spans" at `StorefrontClient.ts:388,393` produce no OTEL output whatsoever. Likewise the six `Effect.annotateLogsScoped` calls (`StorefrontClient.ts:184,341,366,371,376`, `GraphQLOperation.ts:110`) that carry operation name, variables, extensions, errors and data — all log annotations, none of them span attributes. **The instrumentation work is mostly a `annotateLogs` → `annotateCurrentSpan` migration, not new code.**

3. **Use Effect's own OTLP stack in the browser, not `@opentelemetry/sdk-trace-web`.** The official browser SDK's context manager is a synchronous stack that the source itself documents as *"it doesn't fully support the async calls though"*, and the only alternative, `ZoneContextManager`, "does not work with JS code targeting `ES2017+`" — irreconcilable with a Vite/Solid 2 ES2022 build. Effect's `OtlpTracer` uses fiber context instead, imports **zero `@opentelemetry/*` packages**, and speaks the same OTLP wire format. For an Effect-first library this is strictly better. (§3.3)

4. **The SSR→browser handoff has exactly one documented, implemented pattern: `<meta name="traceparent">`.** It is in the `instrumentation-document-load` README, in the official browser getting-started guide, and in that package's shipped source. Your injection point already exists: the `document={({ assets, children, scripts }) => ...}` render prop in `examples/basic/src/entry-server.tsx`. **Server-Timing is not ready** — W3C's merged editor's draft calls the metric `trace`, shipping vendors call it `traceparent`, and the OTel spec issue is still open. (§4)

5. **There are no ecommerce semantic conventions and none are planned.** Verified four ways against the semconv registry, repo, code search and 2026 roadmap. `graphql.*` exists but is *Development* and Opt-In for `graphql.document`. HTTP conventions are Stable. **You will define `shopify.*` / `cart.*` yourself** — treat that as a deliverable with an ADR, not an afterthought. (§5)

6. **Your Promise facade will produce orphan root spans.** `packages/storefront-client/src/index.ts:68-93` builds a fresh `Scope` + `MemoMap` and calls `Effect.runPromise` per operation, forcing `LogLevel.Error`. Each call is its own root fiber, so any span it creates is a trace root unless the caller's context is threaded in explicitly. Non-Effect consumers get disconnected traces. Fix this in the rewrite by accepting an optional parent span.

7. **Two tracer-layer injection points already exist and are empty.** `packages/start/src/middleware/Runtime.ts:4` is literally `ManagedRuntime.make(Layer.empty)`, and `createStorefrontMiddleware.ts:27-59` composes `mainLayer` before handing it to `ManagedRuntime.make(..., Runtime.memoMap)`. Merge the tracer layer there.

8. **Cart mutations link, they do not nest.** A cart mutation 45 seconds after page load is not causally a child of the render; making it one produces traces that never terminate and breaks head sampling. Per the OTel trace API spec, use a span **link** to the page-load span and correlate with `session.id`. (§6.2)

**On testing**

9. **You already own a fetch-injection seam and are not using it — which is the whole reason your tests hit a live store.** `@effect/platform` exports the tag `FetchHttpClient.Fetch` (`Context.TagClass<Fetch, "@effect/platform/FetchHttpClient/Fetch", typeof fetch>`), and its shipped implementation resolves the transport **dynamically, per request, off the fiber context**:
   ```js
   // @effect/platform@0.97.1, dist/esm/internal/fetchHttpClient.js
   const context = fiber.getFiberRef(FiberRef.currentContext);
   const fetch = context.unsafeMap.get(fetchTagKey) ?? globalThis.fetch;
   ```
   So `Effect.provideService(FetchHttpClient.Fetch, mockFetch)` at the **call site** overrides the transport even though `StorefrontClient.layer()` provides `FetchHttpClient.layer` internally (`StorefrontClient.ts:405-417`). The Effect entry point (`@solidifront/storefront-client/effect`) is therefore already testable with zero mocking libraries.
   **The Promise facade is not.** `createStorefrontClient` (`src/index.ts:68-93`) builds its own context and `runPromise`s it with no way to pass extra services — so the public API most consumers use has no seam. Add one. This is the same architecture Hydrogen uses deliberately: `config.fetch ?? globalThis.fetch` at `references/hydrogen/packages/hydrogen/src/client/client.ts:118`, with every client test built on `vi.fn().mockResolvedValue(...)` and no MSW at all.

10. **Adopting Effect-aware testing forces a Vitest major jump regardless of anything else.** `@effect/vitest@0.30.0` (v3 line) peers `vitest ^3.2.0`; the v4 line peers `vitest >=4.1.0 <5.0.0`. Solidifront pins `vitest ^2.1.4` — below both floors. `@effect/vitest`'s `layer()` helper (sharing a `Layer` across a `describe`) is exactly the right shape for a stubbed-transport suite.

10b. **`mock.shop` changes the economics of E2E completely.** It is an official, tokenless Shopify Storefront API that serves the *entire* commerce flow — products, collections, search, filters, `cartCreate`, `cartLinesAdd/Update/Remove`, `cartDiscountCodesUpdate`, and a **live, reachable `checkoutUrl`** — with zero credentials. Hydrogen runs its full storefront E2E suite against it on **every push and PR**, with no secrets. There is no reason solidifront's commerce E2E cannot run on every PR too. (§9.2)

11. **You cannot E2E the commerce flow today because half of it does not exist.** `packages/start/src/storefront/index.ts` exports only `createAsyncQuery` / `createQueryCache`. There is no cart handler, no mutation action, no customer account — `createMutationAction` exists solely as commented-out code (`hooks.ts:29-61`), and `examples/basic` imports it and therefore does not compile. `packages/start/README.md` is a TODO list saying precisely this. **Build the cart flow before designing tests for it.**

12. **Start with CI, not with OTEL or E2E.** There is no `.github/` directory, `turbo.json` has no `test` or `typecheck` task, and no package defines a `lint` script. Every recommendation in this document is unenforceable until something runs on every PR.

---

## 1. OTEL JS package landscape (verified 2026-08-14)

### 1.1 Two version lines, and the trap

OTel JS releases stable packages on one lockstep version and experimental packages on another. Per the [opentelemetry-js README](https://github.com/open-telemetry/opentelemetry-js/blob/main/README.md), tracing and metrics are Stable in both API and SDK; logs are Development.

Today that is **Stable `2.10.0` ↔ Experimental `0.221.0`**. `@opentelemetry/api` is versioned independently at **`1.9.1`** (2026-05-01) and moves very slowly.

**The trap: the two packages every tutorial tells you to install are both on the unstable line.** `@opentelemetry/sdk-node` is `0.221.0` and its README says verbatim *"This is an experimental package under active development. New releases may include breaking changes."* So does `@opentelemetry/exporter-trace-otlp-http`.

| Package | Version | Line |
|---|---|---|
| `@opentelemetry/api` | `1.9.1` | independent |
| `@opentelemetry/core`, `resources`, `sdk-trace-base`, `sdk-trace-web`, `sdk-trace-node`, `sdk-metrics`, `context-zone` | `2.10.0` | **stable** |
| `@opentelemetry/sdk-node`, `sdk-logs`, `api-logs`, `instrumentation`, `exporter-trace-otlp-{http,proto,grpc}`, `otlp-exporter-base`, `instrumentation-{http,fetch,xml-http-request}`, `web-common` | `0.221.0` | **experimental** |
| `@opentelemetry/semantic-conventions` | `1.43.0` | stable pkg, mixed contents |
| `auto-instrumentations-node` `0.79.0`, `auto-instrumentations-web` `0.66.0`, `instrumentation-document-load` `0.66.0`, `instrumentation-graphql` `0.69.0`, `instrumentation-user-interaction` `0.65.0`, `instrumentation-browser-navigation` `0.14.0`, `instrumentation-web-exception` `0.14.0` | contrib, independent | all `0.x` |
| `@opentelemetry/browser-instrumentation` `0.7.0`, `@opentelemetry/browser-sdk` `0.1.0` | new Browser SIG repo | `0.x` |

### 1.2 What is actually deprecated

Only legacy renames carry an npm `deprecated` field:

```
@opentelemetry/tracing            → "Package renamed to @opentelemetry/sdk-trace-base"   (0.24.0)
@opentelemetry/node               → "Package renamed to @opentelemetry/sdk-trace-node"   (0.24.0)
@opentelemetry/exporter-collector → "Please use ... @opentelemetry/exporter-trace-otlp-http ..." (0.25.0, 2021)
```

Everything current is un-deprecated. **But `@opentelemetry/auto-instrumentations-web`'s own README still tells you to import `CollectorTraceExporter` from `@opentelemetry/exporter-collector`, deprecated since 2021.** Treat OTel browser READMEs as unreliable and read the shipped `.d.ts` instead.

### 1.3 Exporter flavours

Per [opentelemetry.io/docs/languages/js/exporters](https://opentelemetry.io/docs/languages/js/exporters/):

| Protocol | Package | Browser |
|---|---|---|
| HTTP/protobuf | `exporter-trace-otlp-proto` | yes (drags in a protobuf runtime) |
| HTTP/JSON | `exporter-trace-otlp-http` | yes (lighter bundle, larger on the wire) |
| gRPC | `exporter-trace-otlp-grpc` | **no** — "Using gRPC for exporting is not supported" |

### 1.4 SDK 2.x breaking changes

From [doc/upgrade-to-2.x.md](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md): Node floor `^18.19.0 || >=20.6.0`; TypeScript ≥ 5.0.4; **compile target raised to ES2022**; `new Resource(...)` → `resourceFromAttributes(...)`; `BasicTracerProvider#addSpanProcessor()` **removed** in favour of a `spanProcessors: [...]` constructor option; `parentSpanId` → `parentSpanContext`; browser resource detection split out to `@opentelemetry/opentelemetry-browser-detector`; `OTEL_TRACES_EXPORTER` / `OTEL_PROPAGATORS` env handling dropped.

The ES2022 baseline matters — see §2.2.

---

## 2. Browser vs server instrumentation

### 2.1 `sdk-trace-web` is a thin shim

Its entire `index.js` (from the 2.10.0 tarball) re-exports `WebTracerProvider`, `StackContextManager`, `PerformanceTimingNames`, a handful of Performance-API utilities, and then re-exports ten symbols straight from `@opentelemetry/sdk-trace-base`. It sits in the stable tree at `2.10.0`, but the repo README overrides that framing:

> "Client instrumentation for the browser is **experimental** and mostly **unspecified**."

### 2.2 The context-manager problem — the single biggest browser obstacle

`StackContextManager`'s own source comment:

```js
/**
 * Stack Context Manager for managing the state in web
 * it doesn't fully support the async calls though
 */
```

It is a synchronous stack. **Context is lost across every `await`, `.then()`, `setTimeout`, and event callback.** The documented alternative is `ZoneContextManager` from `@opentelemetry/context-zone`, whose README says:

> "the `ZoneContextManager` does not work with JS code targeting `ES2017+`. In order to use the `ZoneContextManager`, please transpile back to `ES2015`."

That directly contradicts SDK 2.x's own ES2022 baseline and is a non-starter for a Vite/Solid 2 build. **In-browser automatic parent/child nesting across async boundaries does not reliably work.** Either pass parents explicitly, or use a runtime with its own context propagation — which is exactly what Effect gives you (§3.3).

### 2.3 Browser instrumentations live in three repos

A commonly-mistaken fact:

| Package | Repo | Version |
|---|---|---|
| `instrumentation-fetch`, `instrumentation-xml-http-request` | `opentelemetry-js` / **`experimental/`** | `0.221.0` |
| `instrumentation-document-load`, `-user-interaction`, `-long-task`, `-browser-navigation`, `-web-exception` | `opentelemetry-js-contrib` / `packages/` | `0.66.0` / `0.65.0` / `0.65.0` / `0.14.0` / `0.14.0` |
| `browser-instrumentation`, `browser-sdk` | **`open-telemetry/opentelemetry-browser`** | `0.7.0` / `0.1.0` |

Contrib paths moved — it is now `packages/instrumentation-document-load`, not the old `plugins/web/...` (old URLs 404).

`auto-instrumentations-web@0.66.0` bundles only document-load, fetch, user-interaction and xml-http-request. No long-task, no web-exception, no navigation.

Everything browser-side is `0.x`. Per contrib's `CONTRIBUTING.md`, beta components must have major version `0`, and a component can only stabilise once its semantic conventions are stable. **Browser semconv is Development, so stable is structurally unreachable today.**

### 2.4 The new Browser SIG

`open-telemetry/opentelemetry-browser` was created 2025-09-11 and last pushed 2026-08-13. Its README positions it as *"the future home of the OpenTelemetry Browser SDK"*, providing **event-based** instrumentations (structured log records) that *"complement the existing span-based instrumentations"* elsewhere. Its own package table classifies only `sdk-trace-web` and `context-zone` as stable and everything else browser-related as experimental.

`@opentelemetry/browser-sdk` has exactly one published version (`0.1.0`, 2026-07-09) and no documented migration path from `sdk-trace-web`.

Two SIGs exist per `open-telemetry/community` `sigs.md`: **Client Instrumentation** (biweekly Tuesdays, `#otel-client-side-telemetry`, no repos listed) and **Browser** (Thursdays, `#otel-browser`, [roadmap project 146](https://github.com/orgs/open-telemetry/projects/146)).

**Read for solidifront: the browser side of OTEL is genuinely unsettled. Do not build a public API surface that assumes it.**

---

## 3. `@effect/opentelemetry`, and what Effect gives you for free

### 3.1 Version landscape

```
$ npm view @effect/opentelemetry version dist-tags
version = '0.64.0'
dist-tags = { latest: '0.64.0', beta: '4.0.0-beta.107', rc: '4.0.0-rc.109', ... }
peerDependencies (0.64.0) = { effect: '^3.22.0', '@effect/platform': '^0.97.0', ... }
```

The vendored submodule is on the v4 line. Verified directly:

- `references/effect` HEAD = `6eebd0a618308a91f95947bae6e0fb206ae3939d`, 2026-08-14.
- `references/effect/packages/effect/package.json` → `effect 4.0.0-rc.109`
- `references/effect/packages/opentelemetry/package.json` → `@effect/opentelemetry 4.0.0-rc.109`
- `references/effect/packages/vitest/package.json` → `@effect/vitest 4.0.0-rc.109`

Solidifront pins `effect ^3.19.12`, so the v3-line `@effect/opentelemetry` release it can use is older than `0.64.0`. **Resolve the Effect 3-vs-4 question before designing the tracing layer** — the module layout differs (§3.3).

### 3.2 The `@opentelemetry/*` bridge

`references/effect/packages/opentelemetry/src/` contains exactly: `NodeSdk.ts`, `OtelLogger.ts`, `OtelMetrics.ts`, `OtelTracer.ts`, `Resource.ts`, `WebSdk.ts`, `index.ts`, `internal/`.

Its peer dependencies (all `optional: true`, verified from `packages/opentelemetry/package.json`):

```json
"@opentelemetry/api":                  ">=1.9.0 <2.0.0",
"@opentelemetry/api-logs":             ">=0.203.0 <0.300.0",
"@opentelemetry/resources":            ">=2.0.0 <3.0.0",
"@opentelemetry/sdk-logs":             ">=0.203.0 <0.300.0",
"@opentelemetry/sdk-metrics":          ">=2.0.0 <3.0.0",
"@opentelemetry/sdk-trace-base":       ">=2.0.0 <3.0.0",
"@opentelemetry/sdk-trace-node":       ">=2.0.0 <3.0.0",
"@opentelemetry/sdk-trace-web":        ">=2.0.0 <3.0.0",
"@opentelemetry/semantic-conventions": ">=1.33.0 <2.0.0"
```

All current versions (`2.10.0` / `0.221.0` / `1.43.0`) satisfy these.

**`OtelTracer.ts`** is the bridge. Key exports: `OtelTracer`, `OtelTracerProvider`, `OtelTraceFlags`, `OtelTraceState` (Context services); `make`; `makeExternalSpan({ traceId, spanId, traceFlags?, traceState? })`; `layerGlobal`, `layerGlobalTracer`, `layerGlobalProvider`, `layerTracer`, `layer`, `layerWithoutOtelTracer`; `currentOtelSpan`; `withSpanContext(spanContext)`.

Mechanics worth knowing:
- `class OtelSpan implements Tracer.Span` — each Effect span *is* an OTel span. Kind maps 1:1 (`internal→INTERNAL`, `client→CLIENT`, `server→SERVER`, `producer→PRODUCER`, `consumer→CONSUMER`).
- Parentage: Effect's own `options.parent` wins; otherwise it reads the **active OTel context**, so it interoperates with OTel auto-instrumentation. `options.root === true` calls `Otel.trace.deleteSpan(active)`.
- Error mapping: success → `SpanStatusCode.OK`; interrupt-only → `OK` plus `span.label = "⚠︎ Interrupted"`; real failures → `recordException` per error and `SpanStatusCode.ERROR`.
- `context()` wraps evaluation in `Otel.context.with(...)`, so the OTel active context tracks the Effect fiber's current span — this is how third-party OTel instrumentation nests under Effect spans.
- `makeExternalSpan` / `withSpanContext` are the documented way to continue an incoming remote trace. The module docstring warns to preserve `traceFlags` and `traceState`, "otherwise sampling defaults to sampled and trace state cannot be propagated."

**`WebSdk.ts`** confirms browser support, built on `WebTracerProvider` from `@opentelemetry/sdk-trace-web`. Docstring caveat: *"Browser resource metadata is explicit; this layer does not read OpenTelemetry environment variables."* The layer is scoped — on release it `forceFlush()` then `shutdown()`.

**`Resource.ts`** sets `telemetry.sdk.name = "@effect/opentelemetry"` and picks the SDK language by sniffing for `document`, yielding `webjs` in a browser and `nodejs` on the server.

### 3.3 The finding that matters most: Effect ships an OTLP stack with zero `@opentelemetry/*` dependencies

In Effect **v4** these modules live in core, at `references/effect/packages/effect/src/unstable/observability/`:

```
Otlp.ts   OtlpExporter.ts   OtlpLogger.ts   OtlpMetrics.ts
OtlpResource.ts   OtlpSerialization.ts   OtlpTracer.ts   PrometheusMetrics.ts
```

In the **v3** line the same modules ship inside `@effect/opentelemetry` itself (`dist/esm/Otlp.js`, `OtlpTracer.js`, …). `OtlpTracer.js` imports **only** `effect/*` — no OTel packages at all.

Public surface (v4 `Otlp.ts`):

```ts
export const layer: (options: {
  readonly baseUrl: string
  readonly resource?: { serviceName?, serviceVersion?, attributes? }
  readonly headers?: Headers.Input
  readonly maxBatchSize?: number
  readonly tracerContext?: (<X>(primitive, span) => X)
  readonly loggerExportInterval?, loggerExcludeLogSpans?, loggerMergeWithExisting?
  readonly metricsExportInterval?, metricsTemporality?
  readonly tracerExportInterval?, shutdownTimeout?
}) => Layer.Layer<never, never, HttpClient.HttpClient | OtlpSerialization.OtlpSerialization>

export const layerJson
export const layerProtobuf
export const layerFromConfig   // reads OTEL_* env vars
```

It POSTs to `/v1/logs`, `/v1/metrics`, `/v1/traces` under `baseUrl`. `OtlpExporter.ts` is a scoped batch exporter: 5s default export interval, 1000 default max batch, 3s shutdown timeout, `Retry-After`-aware retry on 429, and **self-disables for 60 seconds after an unhandled failure**. It sets `HttpClient.TracerPropagationEnabled = false` and `Effect.withTracerEnabled(false)` on its own requests to avoid an export→span→export loop.

**Because the transport is `HttpClient` — `@effect/platform/FetchHttpClient` on the v3 line, `effect/unstable/http` on v4 — this entire stack runs in a browser with no OTel packages in the bundle.** (There is no `@effect/platform` 4.x: `npm view @effect/platform dist-tags` → `{ latest: '0.97.1', snapshot: … }`. On v4 the package is gone and HTTP lives in core.) Given §2.2, that is a materially better browser story than the official SDK: Effect's fiber context *is* the context manager, so the `StackContextManager` / `ZoneContextManager` dilemma simply does not arise.

The trade-off: you lose `instrumentation-document-load`'s automatic Performance-API spans and its automatic meta-tag extraction. You would read the `<meta name="traceparent">` yourself and feed it to `OtelTracer.makeExternalSpan` / `Effect.withParentSpan`.

### 3.4 How Effect's tracing model maps onto OTEL

`Tracer.Span` (`references/effect/packages/effect/src/Tracer.ts:371`) is deliberately OTel-shaped — `name`, `spanId`, `traceId`, `parent`, `status`, `attributes`, `links`, `sampled`, `kind`, plus `end`, `attribute`, `event`, `addLinks`. `SpanKind` (`Tracer.ts:309`) is `"internal" | "server" | "client" | "producer" | "consumer"`. `ExternalSpan` (`:198`) and `SpanLink` (`:430`) exist, with `externalSpan(...)` at `:495`. `SpanOptionsNoTrace` (`:255`) carries `attributes`, `links`, `parent`, `root`, `annotations`, `kind`, `sampled`, `level` — near 1:1 with OTel's `SpanOptions`. Timestamps are `bigint` nanoseconds; `nanosToHrTime` bridges to OTel's `[seconds, nanos]`.

Relevant `Effect` APIs: `withSpan`, `withSpanScoped`, `withParentSpan`, `makeSpan`, `makeSpanScoped`, `useSpan`, `linkSpans`, `annotateCurrentSpan`, `currentSpan`, `withTracerEnabled`.

### 3.5 Effect's built-in W3C propagation — and its one gap

`references/effect/packages/effect/src/unstable/http/HttpTraceContext.ts`:

```ts
export const toHeaders = (span: Tracer.Span): Headers.Headers =>
  Headers.fromRecordUnsafe({
    b3: `${span.traceId}-${span.spanId}-${span.sampled ? "1" : "0"}...`,
    traceparent: `00-${span.traceId}-${span.spanId}-${span.sampled ? "01" : "00"}`
  })

export const fromHeaders = (headers) => { let span = w3c(headers); ... b3(headers); ... xb3(headers) }
export const w3c: FromHeaders   // version "00" only, regex-validates 32/16 lowercase hex
```

**Gap: `toHeaders` never emits `tracestate` and `w3c` never parses it.** If you need vendor `tracestate` across the SSR boundary, you handle it yourself.

Wiring:
- **Client** (`HttpClient.ts`): propagation is on by default via `HttpClient.TracerPropagationEnabled`; default span name `` `http.client ${request.method}` `` via `HttpClient.SpanNameGenerator`. Sets `http.request.method`, `server.address`, `server.port`, `url.full`, `url.path`, `url.scheme`, `url.query`, redacted `http.request.header.*`, `http.response.status_code`, `http.response.header.*` — **current stable HTTP semconv names**.
- **Server** (`HttpMiddleware.ts`): extracts the parent with `TraceContext.fromHeaders(request.headers)` and sets `kind: "server"`, plus `http.request.method`, `url.*`, `user_agent.original`, `client.address`, `http.response.status_code`.

Two minor deviations from stable semconv: the client emits `url.path`/`url.query`/`url.scheme` (Opt-In or not-applicable for client spans) and the server emits `url.full` (not a server attribute). Harmless but noisy.

**Net: adopt Effect's HTTP layers and you get W3C propagation and stable HTTP semconv for free, on both sides.** Solidifront's client already uses `@effect/platform`'s `HttpClient` (`StorefrontClient.ts:1-6,107-152`), so this is close at hand.

---

## 4. Context propagation across the SSR boundary

### 4.1 The spec

[W3C Trace Context](https://www.w3.org/TR/trace-context/) is a **W3C Recommendation, 23 November 2021** (Level 1). [Level 2](https://www.w3.org/TR/trace-context-2/) is a **Candidate Recommendation Draft, 28 March 2024**, adding the random-trace-id flag. Both are request-headers only.

```abnf
value          = version "-" version-format
version        = 2HEXDIGLC              ; version ff forbidden
version-format = trace-id "-" parent-id "-" trace-flags
trace-id       = 32HEXDIGLC             ; all zeroes forbidden
parent-id      = 16HEXDIGLC             ; all zeroes forbidden
trace-flags    = 2HEXDIGLC
```

Example: `traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01`

`tracestate` allows a maximum of 32 list-members; vendors SHOULD propagate at least 512 characters; entries over 128 characters SHOULD be dropped first; new entries go left-most.

OTel pins to Level 2: *"A W3C Trace Context propagator MUST parse and validate the `traceparent` and `tracestate` HTTP headers as specified in [W3C Trace Context Level 2]"* (`specification/context/api-propagators.md`).

Implementation note: `W3CTraceContextPropagator`, `W3CBaggagePropagator` and `CompositePropagator` live in **`@opentelemetry/core`**, not standalone packages. Standalone `propagator-*` packages exist only for non-W3C formats (b3, jaeger, aws-xray, ot-trace, instana).

### 4.2 Yes, there is an official server→browser pattern: the meta tag

Documented in two official places and actually implemented.

**(a) The `@opentelemetry/instrumentation-document-load` README**, section *"Optional: Send a trace parent from your server"*:

> "This instrumentation supports connecting the server side spans for the initial HTML load with the client side span for the load from the browser's timing API. This works by having the server send its parent trace context (trace ID, span ID and trace sampling decision) to the client.
>
> Because the browser does not send a trace context header for the initial page navigation, the server needs to fake a trace context header in a middleware and then send that trace context header back to the client as a meta tag *traceparent*."

```html
<meta name="traceparent" content="00-ab42124a3c573678d4d8b21ba52df3bf-d21f7bc17caa5aba-01">
```

**(b)** The same tag appears in the canonical `index.html` at [opentelemetry.io/docs/languages/js/getting-started/browser](https://opentelemetry.io/docs/languages/js/getting-started/browser/).

**Implementation confirmed** in that package's shipped `build/esm/instrumentation.js`:

```js
const metaElement = Array.from(document.getElementsByTagName('meta'))
  .find(e => e.getAttribute('name') === TRACE_PARENT_HEADER);
const traceparent = (metaElement && metaElement.content) || '';
context.with(propagation.extract(ROOT_CONTEXT, { traceparent }), () => { ... });
```

It routes through the globally registered propagator, so `W3CTraceContextPropagator` must be registered.

Caveat: this is an *instrumentation-level convention*. It appears nowhere in the OTel specification and nowhere in any W3C document. There is no meta-tag equivalent for `tracestate`.

**For solidifront the injection point already exists.** `examples/basic/src/entry-server.tsx` uses SolidStart's render prop with an explicit `<head>`:

```tsx
<StartServer document={({ assets, children, scripts }) => (
  <html lang={locale?.isoCode}>
    <head>
      <meta charset="utf-8" />
      {/* ← the traceparent meta tag goes here, built from Effect.currentSpan */}
      {assets}
    </head>
    ...
)} />
```

### 4.3 Server-Timing is not ready — and the naming is contested

Two distinct things, frequently conflated.

**(a) W3C direction.** `w3c/trace-context` PR **#560, "Use server-timing for trace context response"**, was created 2024-02-27 and **merged 2025-10-20**, replacing the old `traceresponse` header with a Server-Timing metric — **in the editor's draft only**:

```
server-timing: trace;desc=00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
```

The middle field is named **`child-id`**, not `parent-id`; version and flags are optional; the metric name is **`trace`**. Flags are advisory — *"An untrusted server may be able to abuse a tracing system by setting these flags maliciously."* This section is **not** in `https://www.w3.org/TR/trace-context-2/`; it is Level 3 editor's-draft material. Naming issue `w3c/trace-context#556` is **still open**.

**(b) Vendor de-facto convention.** OTel spec issue **#3811**, *"Standardize Server-Timing: traceparent 'propagator' across vendors"*, is **still open** (created 2024-01-10, last updated 2026-04-13, 24 comments), proposing:

```
Server-Timing: traceparent;desc="00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
```

Named implementers: Grafana (PHP contrib `Propagation/ServerTiming`), Splunk (`splunk-otel-java`). The related spec PR **#3825, "Context propagation to client instrumentation"**, was **closed unmerged on 2024-06-22**.

**W3C says the metric name is `trace`; shipping vendors say `traceparent`. Anyone implementing today picks a side.** Nothing about Server-Timing exists in the OTel specification.

Server-Timing's genuine advantages: it is already on the browser response-header safelist (no `Access-Control-Expose-Headers` work) and it survives non-HTML responses.

**Recommendation for solidifront: ship the meta tag. Treat Server-Timing as a later, opt-in addition, and record the `trace`-vs-`traceparent` split in an ADR so the choice is revisitable.**

---

## 5. Semantic conventions

### 5.1 Package split and versions

Spec **v1.44.0** released 2026-08-04; npm `@opentelemetry/semantic-conventions@1.43.0` (2026-07-09) lags one minor. Not deprecated. Its `next` (1.8.0) and `canary` dist-tags are abandoned — use `latest`.

- `@opentelemetry/semantic-conventions` — **stable only**, semver 2.0 guarantees.
- `@opentelemetry/semantic-conventions/incubating` — **unstable**, "MAY contain breaking changes in minor releases".

Export naming is `ATTR_${NAME}`, `${NAME}_VALUE_${ENUM}`, `METRIC_${NAME}`, `EVENT_${NAME}`. The old `SEMATTRS_*` / `SEMRESATTRS_*` / `SemanticAttributes` forms are deprecated.

### 5.2 HTTP — Stable

`docs/http/http-spans.md` is marked Stable (since spec v1.23.0). Metrics are Mixed — only `http.server.request.duration` and `http.client.request.duration` are Stable.

Span naming rule, verbatim:

> "HTTP span names SHOULD be `{method} {target}` if there is a (low-cardinality) `target` available. If there is no (low-cardinality) `{target}` available, HTTP span names SHOULD be `{method}`. … Instrumentation MUST NOT default to using URI path as a `{target}`."

**Consequence for solidifront: every Storefront API call is `POST` to the same URL, so the HTTP convention would name every span `POST`.** Set explicit span names (e.g. `storefront.query ProductByHandle`).

Client span attributes (Stable): `http.request.method`, `server.address`, `server.port`, `url.full` (all Required); `error.type`, `http.request.method_original`, `http.response.status_code`, `network.protocol.name` (conditionally required); `http.request.resend_count`, `network.peer.*`, `network.protocol.version`, `url.scheme`, `user_agent.original` (recommended); header attributes and `url.template` (Opt-In). **`url.path` / `url.query` are not client attributes.**

Migration map (from the [HTTP migration guide](https://opentelemetry.io/docs/specs/semconv/non-normative/http-migration/)): `http.method`→`http.request.method`, `http.status_code`→`http.response.status_code`, `http.url`→`url.full`, `http.target`→ split `url.path` + `url.query`, `http.scheme`→`url.scheme`, `net.peer.name`→`server.address`, `net.peer.port`→`server.port`, `http.client_ip`→`client.address`, `http.flavor`→`network.protocol.version`, `http.user_agent`→`user_agent.original`, metric `http.server.duration`→`http.server.request.duration` (ms→s).

`OTEL_SEMCONV_STABILITY_OPT_IN` still exists in v1.44.0, generalised to a comma-separated category list where `http/dup` outranks `http`.

### 5.3 GraphQL — exists, Development

[graphql-spans](https://opentelemetry.io/docs/specs/semconv/graphql/graphql-spans/), status **Development**.

> "Span name SHOULD be of the format `{graphql.operation.type}` provided `graphql.operation.type` is available. If `graphql.operation.type` is not available, the span SHOULD be named `GraphQL Operation`."

| Attribute | Requirement | Stability |
|---|---|---|
| `graphql.operation.name` | Recommended | Development |
| `graphql.operation.type` | Recommended (`query`/`mutation`/`subscription`) | Development |
| `graphql.document` | **Opt-In** | Development |

Note `@opentelemetry/instrumentation-graphql@0.69.0` instruments the **`graphql` server library** (resolver execution). It is useless for a Storefront API *client* — you emit these attributes yourself.

Solidifront already computes both values: `GraphQLOperation.extractName` gives the operation name and `validate({ type })` distinguishes query from mutation (`packages/storefront-client/src/services/GraphQLOperation.ts:67-80,119-133`). They currently go to `Effect.annotateLogsScoped`; they should go to span attributes. `graphql.document` should stay Opt-In — the minified operation is already computed at `StorefrontClient.ts:339`, but attaching full documents to every span is expensive and can leak.

### 5.4 Ecommerce — nothing exists, and nothing is planned

Verified four ways: (1) the [attribute registry](https://opentelemetry.io/docs/specs/semconv/registry/attributes/) has no commerce/ecommerce/retail/cart/order/product/checkout namespace; (2) the repo `model/` directory matches; (3) GitHub code search for `ecommerce` and `commerce` in `open-telemetry/semantic-conventions` returns **0 results each**; (4) issue/PR title search for `ecommerce`/`e-commerce`/`commerce`/`retail` returns **0 each**. The [Semconv 2026 Roadmap](https://github.com/open-telemetry/semantic-conventions/issues/3330) lists every active sub-SIG; there is no commerce or retail SIG.

**This is a clean negative and it is good news framed correctly: solidifront gets to define the vocabulary.** Follow the [attribute naming guide](https://opentelemetry.io/docs/specs/semconv/general/naming/), pick a collision-resistant namespace, and write it down. Candidates: `shopify.shop_domain`, `shopify.api_version`, `shopify.request_id`, `cart.id`, `cart.line_count`, `commerce.currency`.

### 5.5 Browser and session — all Development

`session.id` and `session.previous_id` are Development and **Opt-In** on spans; events `session.start` / `session.end` exist. `browser.brands`, `browser.language`, `browser.mobile`, `browser.platform`, `browser.document.url.full` and `browser.web_vital.{name,value,delta,id,rating,navigation_type}` are all Development, with web-vital names `cls`, `fcp`, `inp`, `lcp`, `ttfb`. **v1.44.0 reshaped `browser.web_vital`**, moving name/value/delta/id from body to attributes — pin your semconv version. `client.address` and `client.port` are Stable.

---

## 6. Exporting from a browser

### 6.1 `sendBeacon` is gone; it is `fetch` + `keepalive` now

From the shipped `@opentelemetry/otlp-exporter-base@0.221.0`, `build/esm/otlp-browser-http-export-delegate.js`:

```js
/**
 * @deprecated Use {@link createOtlpFetchExportDelegate} instead. Modern browsers use `fetch` with
 * `keepAlive: true` when `sendBeacon` is used. ...
 */
export function createOtlpSendBeaconExportDelegate(options, serializer, metrics) {
    return createOtlpFetchExportDelegate(options, serializer, metrics);
}
```

It is a pure alias. `build/esm/transport/` contains only `fetch-transport.js` and `http-exporter-transport.js` — **no XHR transport, no beacon transport**.

### 6.2 The keepalive budget — a real data-loss risk

From `build/esm/transport/fetch-transport.js`:

```js
/** Browsers enforce a 64KiB cumulative limit across all pending keepalive requests.
 *  We use 60KB to leave headroom for headers. */
const MAX_KEEPALIVE_BODY_SIZE = 60 * 1024;
/** Chrome enforces 9 concurrent keepalive fetch requests per renderer process. */
const MAX_KEEPALIVE_REQUESTS = 9;
```

```js
const wouldExceedSize  = pendingBodySize + requestSize > MAX_KEEPALIVE_BODY_SIZE;
const wouldExceedCount = pendingKeepaliveCount >= MAX_KEEPALIVE_REQUESTS;
const useKeepalive = !wouldExceedSize && !wouldExceedCount;
```

**Exceed either budget and keepalive is silently disabled — those spans are dropped on unload.** Keep `maxExportBatchSize` small if unload-time delivery matters. This applies to a storefront directly: a cart mutation immediately followed by a navigation to checkout is exactly the unload case.

CORS mode is auto-selected (`same-origin` / `cors` / `no-cors`), and the transport unwraps a patched `fetch` via `fetchApi.__original` to avoid an *"indirect endless loop Export -> Span -> Export"*. Retry honours `Retry-After`, else exponential backoff (1s initial, 5s max, ×1.5, 5 attempts). Default endpoint `http://localhost:4318/v1/traces`; browser URLs must end in `/v1/traces`.

### 6.3 CORS and cross-origin propagation

Cross-origin `traceparent` propagation is **off by default**. `sdk-trace-web@2.10.0` `build/esm/utils.js`:

```js
export function shouldPropagateTraceHeaders(spanUrl, propagateTraceHeaderCorsUrls) {
    ...
    if (parsedSpanUrl.origin === getOrigin()) { return true; }
    else { return propagateTraceHeaderUrls.some(u => urlMatches(spanUrl, u)); }
}
```

The option is `propagateTraceHeaderCorsUrls` — **present in `fetch.d.ts` but absent from the README's options table**. Adding `traceparent` to a cross-origin fetch triggers a **CORS preflight** (it is not a safelisted request header); `FetchInstrumentation` emits those preflights as child spans.

**Direct consequence for solidifront: if the browser ever calls `<shop>.myshopify.com` directly, propagation is off unless you opt in, and opting in adds a preflight to every Storefront API call — and Shopify will not honour the header anyway (§7). Do not enable it.**

### 6.4 Collector as a browser-facing endpoint

CORS is supported on the OTLP HTTP receiver ([confighttp README](https://github.com/open-telemetry/opentelemetry-collector/blob/main/config/confighttp/README.md)):

```yaml
receivers:
  otlp:
    protocols:
      http:
        cors:
          allowed_origins: [https://foo.bar.com, "https://*.test.com"]
          max_age: 7200
```

> "If left blank or set to `null`, CORS will not be enabled."
> "Do not use a plain wildcard `["*"]`, as our CORS response includes `Access-Control-Allow-Credentials: true`, which makes browsers to disallow a plain wildcard."

**There is no official OTel guidance on exposing a Collector publicly to browsers.** The [security best-practices docs](https://opentelemetry.io/docs/security/config-best-practices/) push the opposite way — bind to localhost, authenticate, encrypt. **Authentication, per-origin rate limiting, payload caps and abuse prevention for a browser-facing OTLP endpoint are entirely your problem.** This is a genuine ecosystem gap and the strongest argument for solidifront proxying browser telemetry through its own SSR server rather than exposing a Collector.

### 6.5 Official browser/RUM docs are thin

[The browser getting-started guide](https://opentelemetry.io/docs/languages/js/getting-started/browser/) is the only substantive page and uses `ConsoleSpanExporter` with no CORS or collector guidance. [The client-apps/web page](https://opentelemetry.io/docs/platforms/client-apps/web/) reads, in full, *"Content coming soon!"*

---

## 7. Stitching a real storefront trace

### 7.1 Where continuity breaks

```
[A] Browser navigation (no traceparent — browsers never send one)
      │  ← BREAK 1 (unavoidable, by design)
[B] SSR request span (server kind, Effect HttpMiddleware.tracer)  ← trace root
      ├── [C] Storefront API GraphQL client span
      │        └── ← BREAK 2: Shopify will not continue your trace
      └── HTML response must carry trace context out
             │  ← BREAK 3 (solved by <meta name="traceparent">)
[D] documentFetch / documentLoad / resourceFetch (browser)
      │  ← BREAK 4: StackContextManager loses context across await
[E] hydration
      │  ← BREAK 5: OTEL has no notion of hydration
[F] client-side cart mutation → your server → Shopify
```

- **BREAK 1** is by design. The SSR request span is a trace root. The meta tag fixes 3, not 1.
- **BREAK 2**: Shopify is a third party and will not honour an outbound `traceparent`. `[C]` is a leaf. The one correlation handle Shopify offers is the request ID in the GraphQL `extensions` object — capture it as `shopify.request_id` so you can join to support tickets. Solidifront already threads `extensions` through (`StorefrontClient.ts:211,221,367`), so this is nearly free.
- **BREAK 4** is the nasty one (§2.2). In the browser, do not rely on ambient parenting. Either pass span context explicitly, or use Effect's OTLP tracer, which is not subject to the problem.
- **BREAK 5**: there is no OTEL convention for hydration. The closest thing is `@opentelemetry/instrumentation-browser-navigation@0.14.0`, which emits **log records** (not spans) with `eventName = browser.navigation`, `url.full`, `browser.navigation.same_document`, `browser.navigation.hash_change` and `browser.navigation.type` (`push|replace|reload|traverse`).

### 7.2 Parent-child vs links

From the [OTEL trace API spec](https://opentelemetry.io/docs/specs/otel/trace/api/#specifying-links):

> "During `Span` creation, a user MUST have the ability to record links to other `Span`s." … "adding links at span creation is preferred to calling `AddLink` later … because head sampling decisions can only consider information present during span creation."

Applied here:

| Edge | Relationship | Why |
|---|---|---|
| `[B] → [C]` SSR → Storefront API | **parent-child** | same trace, same process, causal, synchronous. `Effect.withSpan` does this automatically. |
| `[B] → [D]` SSR → documentLoad | **parent-child**, via the meta tag | the one cross-process, cross-runtime parent-child edge you get for free |
| `[F] → [B]` cart mutation → page load | **link** | a mutation 45s after render is not causally a child. Making it one yields traces that never terminate and defeats head sampling. |
| everything in a visit | `session.id` attribute | for the "what did this user do" view, correlate by attribute, not by forcing one trace |

### 7.3 The concrete span set

| Span | Kind | Where | Notes |
|---|---|---|---|
| `GET /products/:handle` | `server` | SSR middleware | trace root; name `{method} {http.route}` |
| `storefront.query ProductByHandle` | `client` | `StorefrontClient` | + `graphql.operation.name`, `graphql.operation.type`, `server.address`, `shopify.api_version`, `shopify.request_id`. **Set the name explicitly** — the HTTP convention would call it `POST`. |
| `documentFetch` / `documentLoad` / `resourceFetch` | `internal` | browser | from `instrumentation-document-load`, parented via the meta tag |
| `hydrate` | `internal` | browser | you must create it; no convention exists |
| `cart.linesAdd` | `internal` | browser | **new trace root**, `links` → page-load span |
| `POST /api/cart` | `client` → `server` | browser → SSR | ordinary W3C `traceparent` propagation |

### 7.4 Recommended shape for solidifront

1. **Server**: `Effect.withSpan` throughout; either `@effect/opentelemetry`'s `NodeSdk.layer` (full OTel SDK, access to the Node auto-instrumentation ecosystem) or `Otlp.layerJson` / `OtlpTracer.layer` (zero OTel dependencies). Merge it at `packages/start/src/middleware/Runtime.ts:4` — currently `ManagedRuntime.make(Layer.empty)`.
2. **Client instrumentation**: convert the six `Effect.annotateLogsScoped` sites to span attributes. Keep the existing `buyer` redaction (`StorefrontClient.ts:344-357`) — factor it into one attribute-builder so redaction cannot be forgotten on the span path.
3. **SSR→browser**: inject `<meta name="traceparent" content="00-{traceId}-{spanId}-{01|00}">` from the middleware, built from `Effect.currentSpan`, into the `entry-server.tsx` `document` render prop. Server-Timing later, behind a flag, with the naming split recorded in an ADR.
4. **Browser**: prefer Effect's `OtlpTracer` over `sdk-trace-web`. Read the meta tag yourself and feed it to `OtelTracer.makeExternalSpan` / `Effect.withParentSpan`.
5. **Export path**: proxy browser telemetry through the SSR server rather than exposing a Collector — §6.4 shows the ecosystem has no answer for authenticating a public OTLP endpoint.
6. **Pin `@opentelemetry/semantic-conventions`** and import `graphql.*`, `session.*`, `browser.*` only from `/incubating`, knowing minors can break.
7. **Write the `shopify.*` / `cart.*` namespace down as an ADR** — nothing exists upstream and nothing is planned.

---

# Part II — E2E testing a Shopify storefront

---

## 8. Testing against Shopify without a live store

### 8.1 Rate limits: none for buyers, real limits for CI

[shopify.dev/docs/api/usage/limits](https://shopify.dev/docs/api/usage/limits) lists the Storefront API as `None` across every plan tier, and the [July 2023 changelog](https://shopify.dev/changelog/remove-rate-limits-on-the-storefront-api) says the API "serves all legitimate requests from both private and public clients without rate limits."

**That is not the whole story, and the rest is what bites CI.** From the [Storefront API reference](https://shopify.dev/docs/api/storefront/2026-04):

> "Automated traffic — such as bots and crawlers — is rate-limited. Bot operators that need higher limits should sign their requests with Web Bot Auth."
> "If a request appears to be malicious, Shopify responds with a `430 Shopify Security Rejection` error code."
> "Ensure requests to the Storefront API include the correct Buyer IP header."
> "Tokenless access has a query complexity limit of 1,000."

CI traffic from shared GitHub Actions IP ranges looks exactly like an anonymous bot. Hydrogen's own answer is a secret internal "loadtest header" (`references/hydrogen/examples/hydrogen/e2e/fixtures/test-secrets.ts:109`, `getLoadtestHeaders()`) that marks traffic as first-party Shopify — **not available to you**.

**Two direct consequences for solidifront:**
- Running the test suite against a live store on every PR is a flakiness generator, not a safety net. It belongs on a nightly.
- `430` is not in the client's error taxonomy — see audit bug #15. Add it before any live-store testing.

### 8.2 `mock.shop` — the finding that changes the plan

Official, per the [changelog](https://shopify.dev/changelog/introducing-mock-shop-api-for-prototyping-storefronts): "a free prototyping tool to build a proof-of-concept storefront without having to set up a shop or run any server-side code… publicly available - no server, or access tokens required."

Endpoints: `https://mock.shop/api` and `https://mock.shop/api/{version}/graphql.json`. Backed by a real store (`shop.primaryDomain.url = https://demostore.mock.shop`). Base currency CAD.

Empirically verified, all with **zero credentials**:

| Capability | Result |
|---|---|
| `products`, `collections`, `pages`, `blogs`/`articles`, `menu`, `localization`, shop policies | works |
| `search(query:)` | works |
| `collection.products.filters` (labels + value counts) | works |
| `cartCreate` | real cart id + `checkoutUrl` |
| `cartLinesAdd` / `cartLinesUpdate` / `cartLinesRemove` | `totalQuantity` updates correctly |
| `cartDiscountCodesUpdate` | returns `{code:"SAVE10", applicable:false}` |
| **following `checkoutUrl`** | **HTTP 200 — a real checkout page** |
| `@inContext(country:)` | `extensions.context` echoed back |
| `__schema` introspection | full 428-type schema |
| `predictiveSearch` | empty |
| `metafields` / `metaobjects` | `null` / `[]` |

**The entire PLP → PDP → add to cart → cart mutation → checkout handoff runs against mock.shop with no secrets.** That is the single most important fact in this half of the document.

Caveats: no published SLA, no documented rate limit, no versioning commitment for its *data*. Product handles could change — **discover fixtures at runtime rather than hardcoding them** (see §9.3).

`@solidifront/start`'s `createStorefrontMiddleware` currently *requires* `storeName` + `privateAccessToken` (`packages/start/src/middleware/createStorefrontMiddleware.ts:16-32`), so **there is no tokenless path today.** Adding one is a prerequisite for cheap E2E.

### 8.3 Tokenless access works against real stores too, and introspection needs no credentials

Verified against Shopify's own public demo store: `POST https://checkout.hydrogen.shop/api/2026-04/graphql.json` with **no token header** returns `200 {"data":{"shop":{"name":"Hydrogen Demo Store"}}}`, and a full `__schema` introspection likewise succeeds.

Shopify also runs a credential-free schema proxy, found inside `@shopify/api-codegen-preset@3.0.0` (`dist/helpers/api-configs.js`):

```
https://shopify.dev/storefront-graphql-direct-proxy/{YYYY-MM}
```

A `getIntrospectionQuery()` POST to `.../2026-07` returns **HTTP 200, ~771 KB, 428 types**. No store, no token, per API version. (The bare URL without a version segment returns 400.) It is not documented in prose on shopify.dev — treat it as semi-public: officially used by Shopify's own tooling, no stability guarantee page.

### 8.4 API versions — and a free nightly canary

A tokenless `publicApiVersions` query against mock.shop returns, today:

```json
[{"handle":"2025-10","supported":true},
 {"handle":"2026-01","supported":true},
 {"handle":"2026-04","supported":true},
 {"handle":"2026-07","supported":true,"displayName":"2026-07 (Latest)"},
 {"handle":"2026-10","supported":false,"displayName":"2026-10 (Release candidate)"},
 {"handle":"unstable","supported":false}]
```

**Current stable is `2026-07`.** Solidifront's `ValidVersion` tops out at `2025-10` and defaults to `2025-04` (audit §3) — of the four supported versions, only `2025-10` is even expressible, and it expires 2026-10-16.

**This one query is a free, credential-free nightly canary for version drift.** Wire it up.

### 8.5 Development stores

Per [shopify.dev/docs/apps/build/dev-dashboard/stores/development-stores](https://shopify.dev/docs/apps/build/dev-dashboard/stores/development-stores): free, owned and controlled by you, require a Partner account or merchant store with developer permissions; test orders via the Bogus gateway; **"You can't remove the password page"** — a real E2E obstacle, since every request needs the storefront password or a bypass; and they can't be transferred to a client.

Tokens come from the Headless channel or the Hydrogen channel.

Shopify's only E2E-specific documentation is [the Hydrogen E2E page](https://shopify.dev/docs/storefronts/headless/hydrogen/debugging/end-to-end-testing), and it is exclusively about **Oxygen auth-bypass tokens** (`--auth-bypass-token`, valid two hours, `oxygen-auth-bypass-token` header, Oxygen URLs only). Irrelevant to a Solid app on Vercel or Cloudflare. **There is no official Shopify guidance on mocking the Storefront API for tests.**

---

## 9. What Hydrogen actually does

Read from `references/hydrogen`, branch `preview` (`@shopify/hydrogen@2026.10.0-preview.0`). Note this is the **next-gen framework-agnostic rewrite** — templates for React Router and Next.js, examples for Astro, Nuxt, SvelteKit and **Solid Start**. Upstream `main` is the shipped `2026.4.5` line and still contains `packages/hydrogen-react`; patterns below may still change.

Hydrogen runs **three** suites: unit (Vitest), a portable live-data contract E2E, and an MSW-in-the-server-entry E2E.

### 9.1 Unit tests — Vitest, injected `fetch`, no mocking library

`packages/hydrogen/vitest.config.ts`:

```ts
test: {
  globals: true,
  environment: "node",
  typecheck: { enabled: true, include: ["src/**/*.type-test.ts"] },
  include: ["plugins/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.type-test.ts"],
}
```

- **100 test files**; heaviest areas `src/core/cart` (15), `src/react` (10), `src/core/request-routing/interceptors` (9).
- Default environment `node`; DOM tests opt in per-file with `// @vitest-environment happy-dom`.
- **No `@vitest/browser`, no workspace/projects file.** Orchestration is Turborepo: `"test": { "dependsOn": ["^build"] }`.
- **Type-level tests are first-class** — `vitest --typecheck` over `*.type-test.ts`; `src/client/client.type-test.ts` is 25 KB.
- devDeps: `vitest ^3.0.0`, `happy-dom ^20.9.0`, `@testing-library/react ^16.3.2`, `graphql ^16.13.2`.

**The client test double is an injected `fetch`, not a network mock.** `src/client/types.ts:87` declares `fetch?: Fetch` on every client config; `src/client/client.ts:118` reads `const originFetch = config.fetch ?? globalThis.fetch;`. `client.test.ts` (34 KB) uses only that:

```ts
function mockResponse(body, init?) {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  if (!headers.has("x-request-id")) headers.set("x-request-id", "mock-req-id");
  return new Response(JSON.stringify(body), { ...init, headers });
}
function createMockFetch(response?) {
  return vi.fn().mockResolvedValue(response ?? mockResponse({ data: { shop: { name: "Test Shop" } } }));
}
```

**This is the most important architectural lesson in the whole report**, and solidifront already has the equivalent seam via `FetchHttpClient.Fetch` (conclusion 9).

### 9.2 E2E suite A — `packages/storefront-e2e`: portable, credential-free, live-data

The most directly reusable artifact in the repo. `docs/storefront-contract.md:3`:

> "This package runs one Playwright suite against an already-running storefront. **It uses live data only. It does not start a server, set environment variables, or mock Storefront API responses.**"

Run as `STOREFRONT_BASE_URL=https://your-storefront.example pnpm test:e2e:storefront`.

**The clever part** — `src/storefront-api-discovery.ts`:

```ts
export function createStorefrontApiClient(storefrontDomain: string): StorefrontClient {
  const requestContext = createShopifyRequestContext({
    request: new Request(storefrontDomain),
    i18n: { country: "US", language: "EN" },
  });
  return createStorefrontClient({
    type: "public",
    requestContext,
    config: { storeDomain: storefrontDomain, publicStorefrontToken: undefined },
  });
}
```

`storeDomain` is **the base URL of the app under test**, and `normalizeStoreDomain` preserves `http://localhost:4201` — so `apiUrl` becomes `http://localhost:4201/api/2026-04/graphql.json`. **The suite discovers its fixtures by querying the app's own Storefront API proxy route.** The test process holds no credentials; the app already has them.

Structure: per-group `specs/*/config.ts` does GraphQL discovery plus route probes and exports a `test` built by `createTest({ discover })`; `specs/*/*.spec.ts` holds only assertions. Discovery is a **worker-scoped** fixture (`src/matcher-fixture.ts`), so it runs once per worker and its failures either abort or skip a whole group:

```ts
matcherState: [async ({ browserName: _browserName }, use) => { /* discover */ },
  { scope: "worker", timeout: MATCHER_TIMEOUT_MS }],
data: async ({ matcherState }, use, testInfo) => {
  if (matcherState.status === "skipped") { testInfo.skip(true, matcherState.reason); return; }
  await use(matcherState.data);
},
```

Two error classes drive policy: `AbortSuiteError` (cart, checkout, product — required) and `SkipTestGroupError` (collection, filters, search, variants — skip if the store lacks the data). `src/contract.ts` defines 11 named capabilities and formats failures as actionable contract errors with "Route/page", "Expected", "Likely fix" and a docs anchor.

**The cart-settlement trick** — the contract *requires the app* to expose an ARIA live region so tests never need `waitForTimeout` (`docs/storefront-contract.md:67`):

> "Cart totals must expose a `role=\"status\"` region that says `Updating cart totals` while cart totals are stale, then `Cart totals updated` after mutation settlement. Do not announce `Cart totals updated` on initial idle render before a mutation cycle."

This is the single best idea in Hydrogen's test architecture: **it turns a flaky-timing problem into an accessibility requirement the app must satisfy anyway.**

**Checkout boundary** — click checkout, wait for `domcontentloaded`, assert `/checkout|checkouts/i.test(url) || pathname.startsWith('/cart/c/')`, assert product and variant text. Per `docs/storefront-contract.md:75`: "It must not enter customer data, payment data, or any irreversible checkout step."

`playwright.config.ts`: `fullyParallel: true`, `retries: 0`, workers 4 local / 2 CI, `screenshot: "only-on-failure"`, `trace: "retain-on-failure"`, `video: "off"`.

**CI** (`.github/workflows/storefront-e2e.yml`) runs on **every push and PR**, matrixed over React Router (port 4201) and Next.js (4202): copy `.env.example` → `.env` (i.e. **mock.shop mode**), build, start dev server, poll until 200, run Playwright with `STOREFRONT_BASE_URL`, upload the report on failure. **Full commerce E2E on every PR, with no secrets.**

### 9.3 E2E suite B — `examples/hydrogen/e2e`: MSW inside the SSR worker

The answer to "how do you mock the Storefront API during a Playwright run". devDeps: `@playwright/test ^1.57.0`, `msw ^2.14.3`.

Store selection is per-spec via `setTestStore(...)`, and the split is deliberate:

| Specs | Store | Mocked? |
|---|---|---|
| `smoke/{home,cart,pages,subrequest-cache}`, `skeleton/*`, all cookie specs | real dev store + public token | **No** |
| `smoke/account`, `skeleton/deliveryAddresses`, b2b/subscriptions recipes | `mockShop` + `{ mock: { scenario } }` | **Yes, MSW** |

**They mock only the Customer Account API OAuth flows** — the thing you genuinely cannot exercise headlessly. Commerce runs live.

`e2e/fixtures/msw/entry.ts` (331 lines) is an alternate **worker entry** wrapping the real app:

```ts
const { getResponse } = await import("msw");
let currentMswScenarioMeta: MswScenarioMeta | undefined = undefined;

function installFetchInterceptor() {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const request = toRequest(input, init);
    if (request && currentMswScenarioMeta && currentMswScenarioMeta.handlers.length > 0) {
      const mockedResponse = await getResponse(currentMswScenarioMeta.handlers, request);
      if (mockedResponse) return mockedResponse;
    }
    return originalFetch(input, init);
  };
}
```

Key detail: **`getResponse(handlers, request)`** — MSW's low-level matcher — **not `setupServer`**. That sidesteps MSW's Node interceptor machinery inside workerd. They still polyfill `localStorage` ("MSW stores handler state in localStorage. Workerd doesn't provide localStorage… Without this, MSW's `getResponse` silently fails to match registered handlers"), `BroadcastChannel`, and `process.versions.node`.

Wiring: a temp `.env.mock` carries `HYDROGEN_E2E_MSW_SCENARIO`, and the dev server is spawned with `HYDROGEN_E2E_ENTRY` + `HYDROGEN_E2E_ENV_VARS`, read by `vite.config.ts` and passed into `oxygen({ entry, env })`. One dev server per Playwright worker, port 0 for parallel safety.

**Typed handler factory** — `e2e/fixtures/msw/graphql.ts`, the reusable idea:

```ts
export function mockCustomerAccountOperation<TDocument extends CAAPI.AnyCustomerAccountDocument>(
  document: TDocument, resolver: CustomerAccountResolver<TDocument>,
): RequestHandler {
  const operation = parseOperation(document.source);
  const createHandler = operation.type === "query" ? graphql.query : graphql.mutation;
  return createHandler(operation.name, async ({ variables, request }) => {
    const data = await resolver({ variables, request });
    return HttpResponse.json({ data });
  });
}
```

It regexes the operation name and type out of the **same document the app uses**, and throws if absent — so handlers are typed by, and cannot drift from, the real operations.

`e2e/CLAUDE.md` (356 lines) is a genuinely good style guide: role-based locators only; **never** `waitForTimeout`, `networkidle`, or `waitForResponse`; "assert absence broadly, presence specifically"; "writing tests should drive better markup"; `expect.poll` for data settlement; always headless.

### 9.4 What Hydrogen ships, and the contract-check CLI

Hydrogen ships **no public mock-storefront utilities**. What it does ship in `@shopify/hydrogen@2026.4.5` is more valuable:

```
dist/storefront.schema.json          789,467 bytes   → exported as "./storefront.schema.json"
dist/customer-account.schema.json    905,780 bytes
dist/storefront-api-types.d.ts       493,281 bytes   → exported as "./storefront-api-types"
```

Plus a contract-check CLI: `hydrogen gql check` (`src/cli/gql.ts`) writes a temp tsconfig injecting `gql.tada/ts-plugin` pointed at the bundled schemas and shells out to `gql.tada check --fail-on-warn`. Its integration test is the pattern in miniature:

```ts
it("accepts a valid Storefront API query", () =>
  expect(runGraphQLCheck("query { shop { name } }").status).toBe(0));
it("rejects an invalid Storefront API field", () => {
  const result = runGraphQLCheck("query { shop { doesNotExist } }");
  expect(result.stdout).toContain("doesNotExist");
  expect(result.status).not.toBe(0);
});
```

**`examples/solid-start` has no tests at all.** There is no prior art to copy for Solid specifically.

---

## 10. Mocking tools — what actually works for a GraphQL API

The core problem: every request is `POST /api/{version}/graphql.json`; the discriminator is inside the JSON body.

### 10.1 Recorded fixtures / VCR — maintenance reality

| Package | Version | Last publish | Verdict |
|---|---|---|---|
| `nock` | `14.0.17` | 2026-07-30 | **Healthy** — repo pushed 2026-08-05 |
| `@pollyjs/core` | `6.0.6` | **2023-07-20** | **Soft-abandoned** (repo pushed 2025-05-31, 59 open issues) |
| `undici` | `8.10.0` | 2026-08-03 | Healthy, but see below |
| `@mswjs/data` | `0.16.2` | 2025-10-14 | **npm-deprecated** → `@msw/data@1.1.7` |
| `@mswjs/source` | `0.5.0` | 2025-11-10 | **npm-deprecated** → `@msw/source@0.6.1` |

| Library | Body in the match key? | Recording? |
|---|---|---|
| **MSW** | Yes — AST-parsed out of the body | No (only HAR→handlers conversion via `@msw/source`) |
| **nock** | Yes — matcher receives the **parsed JSON object** | Yes, `nock.back` |
| **Polly.js** | Yes — `md5(stableStringify({method,url,headers,body}))`, `body: true` by default | Yes, HAR |
| **undici MockAgent** | Yes — `body: (raw) => boolean` | No |

- **nock** — `.post('/graphql', body => body?.query?.includes('GetUser'))` works with native `fetch` on nock 14. `.filteringRequestBody()` normalises volatile fields. Cost: one-shot interceptors, so N operations × M renders = N×M registrations, and unconsumed interceptors fail `scope.done()`.
- **Polly.js** — structurally the best *design* for GraphQL VCR (body hashed into the key by default, `matchRequestsBy.body` accepts a normaliser). Two default traps: `headers: true` means a varying `x-request-id` busts the key and `recordIfMissing: true` then silently re-records against live; `order: true` makes identical operations in one render order-sensitive. **Fatal issue: the core hasn't shipped in ~3 years and `adapter-node-http` drags `nock@13` behind it.**
- **undici MockAgent — disqualified.** With `undici@8.10.0`, `setGlobalDispatcher(mockAgent)` **does not intercept Node 22's global `fetch`** (requests hit real DNS); with `undici@7.29.0` it does. Since solidifront's client resolves to `globalThis.fetch` through `FetchHttpClient`, this is a non-starter. `[UNVERIFIED]` mechanism: undici 8's `lib/global.js` introduced `Symbol.for('undici.globalDispatcher.2')` while writing a `Dispatcher1Wrapper` to the legacy `.1` symbol.

### 10.2 MSW

`msw@2.15.0` (2026-07-08). `graphql@^16.13.2` is a **hard dependency**, not a peer. (Note the `/docs/basics/*` URLs are gone — restructured into `/docs/http/*` and `/docs/graphql/*`.)

Signatures per [mswjs.io/docs/api/graphql](https://mswjs.io/docs/api/graphql):

```ts
graphql.query(predicate, resolver, options?)
graphql.mutation(predicate, resolver, options?)
graphql.operation(resolver, options?)
graphql.link(url): { query, mutation, operation }
```

**Matching is AST-based, and the JSON `operationName` field is ignored** — `parseGraphQLRequest` reads only `{ query, variables }` and takes `node.definitions.find(d => d.kind === 'OperationDefinition')`.

Verified behaviour against Hydrogen/solidifront-shaped bodies:

| Request | Result |
|---|---|
| `query CartEnabledProducts(...)` | matched by `graphql.query('CartEnabledProducts')` |
| `mutation CartCreate(...)` | matched by `graphql.mutation('CartCreate')` |
| `{ shop { name } }` (anonymous) | **rejected** — "anonymous GraphQL operations are not supported" |
| `query { shop { name } }` (anonymous keyword) | **rejected** |
| `graphql.link(url)` matching / non-matching | correct in both directions |
| `GET ?query=…` | matched |
| Multi-operation doc + JSON `operationName:'GetCart'` | **wrong handler ran** — resolves to the first `OperationDefinition` |

The source is explicit: `if (!args.parsedResult.operationName && this.info.operationType !== 'all') { warn(...); return false }`.

**→ solidifront must enforce named, single-operation GraphQL documents if it wants MSW-mockable queries.** Lint for it.

Node: `setupServer` from `msw/node`, `beforeAll(server.listen)` / `afterEach(server.resetHandlers)` / `afterAll(server.close)`, `onUnhandledRequest: 'warn'|'error'|'bypass'|fn`, and **`server.boundary(cb)`** to scope `server.use()` to one test under parallel workers. MSW cannot intercept `net.connect()`; global `fetch` is fine.

Browser: `setupWorker` from `msw/browser`, `npx msw init <PUBLIC_DIR> --save`. Firefox does not intercept `XMLHttpRequest`.

**Playwright**: there is now an official `@msw/playwright@0.6.7` (2026-04-03, peers `msw ^2.12.10`, repo `mswjs/playwright`, not archived). **But it uses `page.route()`, so it is browser-context only and does not solve SSR.** The community `playwright-msw@3.0.1` last shipped 2023-12-09 and is superseded.

**`setupRemoteServer` does not exist.** [PR mswjs/msw#1617](https://github.com/mswjs/msw/pull/1617) is open and unmerged since 2023-05-12. Per [discussion #1668](https://github.com/mswjs/msw/discussions/1668), kettanaito: *"your app and your test are running in two separate processes."*

**The official SSR recipe** (`mswjs/examples/with-remix`) is deliberately blunt: `setupServer(...handlers)` in `app/entry.server.tsx` behind `if (process.env.NODE_ENV === 'development')`, and Playwright's `webServer` boots it. Structurally identical to Hydrogen's `msw/entry.ts`, minus the workerd polyfills.

### 10.3 Playwright's own network mocking

`@playwright/test@1.62.1` (2026-08-14).

Per [playwright.dev/docs/api/class-page#page-route](https://playwright.dev/docs/api/class-page#page-route): "every request matching the url pattern will **stall** unless it's continued, fulfilled or aborted"; "the **most recently registered route takes precedence**"; "Enabling routing **disables http cache**." Glob gotchas: `*` excludes `/`, `**` includes it, `?` matches only a literal `?`.

**There is no GraphQL example anywhere on playwright.dev** — the docs source contains zero matches for "graphql". The body-discrimination primitive is `request.postDataJSON()`.

**HAR replay does match the POST body — byte-exactly.** Per [playwright.dev/docs/mock#replaying-from-har](https://playwright.dev/docs/mock#replaying-from-har):

> "HAR replay matches URL and HTTP method strictly. **For POST requests, it also matches POST payloads strictly.** If multiple recordings match a request, the one with the most matching headers is picked."

Confirmed in `playwright-core@1.62.1`'s `harBackend.ts` `_harFindResponse()`: `if (!buffer.equals(postData)) { ... continue }`, ties broken by `countMatchingHeaders()`. Four consequences for GraphQL:

1. **Byte-exact `buffer.equals()`** — no JSON normalisation. Any whitespace change in a codegen'd query, any variable-key reordering, breaks the match. **This is fatal for a library whose operations are minified at runtime** (`GraphQLOperation.minify`, `StorefrontClient.ts:339`).
2. `updateMode: 'minimal'` is safe — `postData` is populated unconditionally.
3. `content: 'omit'` silently breaks matching — writes an empty `postData` that passes the truthiness guard then fails `equals()`. `[UNVERIFIED]` — read from source, not an official statement.
4. Bodyless recorded entries fail open — one bodyless entry answers *every* GraphQL operation.

**`page.route` cannot see SSR fetches.** "Routing provides the capability to modify network requests **that are made by a page**." Under SSR the browser makes one request (`GET /page`); the server's own `fetch` never touches the browser's network stack. The supported lever is [`webServer`](https://playwright.dev/docs/test-webserver).

**Playwright component testing is being deleted, not stabilised.** Per [playwright.dev/docs/test-components](https://playwright.dev/docs/test-components): "the experimental `@playwright/experimental-ct-react`, `-ct-react17` and `-ct-vue` packages **have been removed and are no longer published**… **stay on Playwright 1.62** until you have followed the migration guide." Removal lands in 1.63. The replacement is a built-in `mount(storyId, props?)` fixture driving a story gallery you own — with **react and vue templates only**. Solid is name-checked but you author the gallery. **Do not adopt `@playwright/experimental-ct-*`.**

### 10.4 Contract testing against the schema

**Pin `graphql@^16`.** `graphql@17.0.2` (current `latest`) **rejects the Shopify schema**:

```
graphql 17.0.2 → Error: Interface field Node.id is not deprecated, so implementation
                 field MediaPresentation.id must not be deprecated.
                 at assertValidSchema (graphql/type/validate.mjs:36)
graphql 16.14.2 → works
```

Hydrogen itself pins `graphql: ^16.13.2`, and `msw@2.15.0` hard-depends on `graphql@^16`. Solidifront currently has `graphql: ^16.12.0` — correct by luck; make it deliberate.

**Document validation is the highest-value, cheapest contract test.** With `graphql@16` and a committed introspection JSON, ~15 lines and no other dependencies:

```js
const schema = buildClientSchema(introspectionJson)
validate(schema, parse(`query CartEnabledProducts($count: Int!) { products(first:$count){nodes{handle title}} }`))
  // → []
validate(schema, parse(`query Bad { products(first:1){nodes{handle doesNotExist}} }`))
  // → ['Cannot query field "doesNotExist" on type "Product".']
```

Alternatives: `gql.tada@1.11.3` (what Hydrogen uses — validation at *typecheck* time, no codegen step), `@graphql-eslint/eslint-plugin@4.4.1`, `@graphql-inspector/cli@6.0.8` for breaking-change diffs.

**Schema-driven mocks work, with two caveats.** Officially documented by MSW at [schema-first-mocking](https://mswjs.io/docs/graphql/schema-first-mocking/) — the reason `graphql.operation()` exists. Verified end-to-end against the *real* Shopify schema with `@graphql-tools/mock@9.1.13` + `graphql@16.14.2` + `msw@2.15.0`:

```js
const mocked = addMocksToSchema({ schema: buildClientSchema(introspection), mocks: {
  Decimal: () => '25.00', URL: () => 'https://cdn.shopify.com/mock.jpg',
  DateTime: () => '2026-01-01T00:00:00Z', HTML: () => '<p>mock</p>', JSON: () => ({}),
  UnsignedInt64: () => '10', Color: () => '#000000', ISO8601DateTime: () => '2026-01-01T00:00:00Z',
}})
const handlers = [graphql.operation(async ({ query, variables, operationName }) =>
  HttpResponse.json(await execute({ schema: mocked, source: query, variableValues: variables, operationName })))]
```

Caveats found empirically: **you must supply all 8 Shopify custom scalars** (`Color, DateTime, Decimal, HTML, ISO8601DateTime, JSON, URL, UnsignedInt64`) or it throws; and **connection arguments are ignored** — `variants(first:1)` returned 2 nodes, and `cartCreate` returned `totalQuantity: -47`. **Schema mocks give you shape, never commerce semantics.** Use them as a catch-all fallback under explicit `graphql.query('X', …)` handlers.

**Schema-drift detection is free.** Diffing the vendored `hydrogen-react` schema (2026-04) against the live proxy (2026-07): 428 vs 424 types; added in 2026-07 are `BaseCartDiscountApplication`, `CartAutomaticDiscountApplication`, `CartCodeDiscountApplication`, `CartCustomDiscountApplication`; none removed. Twenty lines of `graphql@16`, no credentials.

There is **no official Shopify mock generator**. The community `graphql-codegen-typescript-mock-data@5.1.2` (2026-06-16) generates typed mock factories.

---

## 11. Vitest

`vitest@4.1.10` (2026-08-11); `dist-tags` show `V3: 3.2.7`, `beta: 5.0.0-beta.7`, `rc: 5.0.0-rc.1` — **Vitest 5 is at RC**. Hydrogen is on `^3.0.0`. **Solidifront is on `^2.1.4`, two majors behind.**

**Browser mode is STABLE as of v4.** [vitest.dev/guide/browser](https://vitest.dev/guide/browser/) has no stability banner; v3.2.7's docs carried an "Experimental" badge and "Breaking changes might not follow SemVer". [The v4 blog post](https://vitest.dev/blog/vitest-4): "we are **removing the `experimental` tag** from Browser Mode."

v4 restructured providers into separate packages and made `provider` a **factory call**:

```ts
import { playwright } from '@vitest/browser-playwright'
test: { browser: { enabled: true, provider: playwright(), instances: [{ browser: 'chromium' }] } }
```

`@vitest/browser-playwright@4.1.10` peers `{ vitest: '4.1.10', playwright: '*' }` — **not optional**. `browser.name` is **removed** in v4; use `browser.instances`.

**Workspace → projects.** Per [vitest.dev/guide/projects](https://vitest.dev/guide/projects): "**The `workspace` is deprecated since 3.2** and replaced with the `projects` configuration." For a monorepo: `test: { projects: ['packages/*'] }`. v4 also removed `poolMatchGlobs`/`environmentMatchGlobs` and renamed `maxThreads`/`maxForks` → `maxWorkers`.

Environments: `node` (default), `jsdom`, `happy-dom`, `edge-runtime`. Critically, "**`browser` is not considered an environment in Vitest.**" Per-file override: `// @vitest-environment happy-dom`.

**Vitest and Playwright coexist fine** — separate runners, separate configs, one shared browser download. One real conflict: **opposite service-worker defaults.** Vitest *forces* `serviceWorkers: 'allow'` — "to support module mocking via MSW" ([vitest.dev/config/browser/playwright](https://vitest.dev/config/browser/playwright)) — while Playwright's component-testing guidance sets `serviceWorkers: 'block'` so SWs don't shadow `page.route()`. **Choosing MSW as the single mocking layer is the only way to share handlers across both suites.** Also: Vitest isolates per *test file*, not per test; `launch.headless` is ignored (use `test.browser.headless`); Vitest binds port 63315.

**MSW is Vitest's officially recommended request-mocking tool** ([vitest.dev/guide/mocking/requests](https://vitest.dev/guide/mocking/requests)): "We recommend Mock Service Worker… It allows you to mock `http`, `WebSocket` and **`GraphQL`** network requests."

**`@effect/vitest` forces the version jump too.** The v3 line (`@effect/vitest@0.30.0`) peers `vitest ^3.2.0`; the v4 line (`4.0.0-rc.109`) peers `vitest >=4.1.0 <5.0.0`. Solidifront's `^2.1.4` is below both floors. Its exports (`references/effect/packages/vitest/src/index.ts`) are worth adopting: `it.effect` (:169), `it.live` (:174), **`layer(...)` (:216)** for sharing a `Layer` across a `describe` — exactly the shape for a stubbed-transport suite — plus `flakyTest` (:231) and `prop` (:239, property-based).

**Solid support.** `vite-plugin-solid@2.11.14` (`next: 3.0.0-next.27`), `@solidjs/testing-library@0.8.10` (`next: 1.0.0-beta.2`, peers `solid-js >=1.0.0`, `@solidjs/router >=0.9.0`), `@testing-library/jest-dom@7.0.1`, `@testing-library/user-event@14.6.4`. The old `solid-testing-library@0.5.1` is **npm-deprecated**: *"This package is now available at @solidjs/testing-library"*. vitest.dev ships a Solid tab in the browser-mode code-group but puts Solid in the "unsupported frameworks → use testing-library" bucket; there is no first-party `vitest-browser-solid` (community `vitest-browser-solid@1.0.1`, last published 2025-10-31). **Doc bug on vitest.dev**: its Solid samples import from `@testing-library/solid`, which does not exist on npm.

---

## 12. The recommended strategy for solidifront

### 12.1 Five layers

**L1 — Unit (Vitest, `environment: 'node'`). Every PR. No network, no secrets.**
Inject the transport: `Effect.provideService(FetchHttpClient.Fetch, vi.fn().mockResolvedValue(...))`. Copy Hydrogen's `mockResponse()` helper (always set `content-type` and `x-request-id`). Cover URL construction per API version, public-vs-private header selection, `@inContext` injection, error mapping (**including 430**), retry, and the header-mutation bug (audit #1). Add `vitest --typecheck` over `*.type-test.ts` — Hydrogen's is 25 KB and catches exactly the class of bug that matters most in a typed GraphQL client. **Delete the env-var dependency from the four existing test files.**

**L2 — Contract (Vitest, node). Every PR. No network.**
Commit the introspection JSON for the pinned API version, fetched from `shopify.dev/storefront-graphql-direct-proxy/{version}`. Then `validate(buildClientSchema(schema), parse(doc))` over every operation the library ships (~15 lines, `graphql@^16` only), and assert `ValidVersion` matches the committed schema's version. Optionally adopt `gql.tada` and mirror `hydrogen gql check` for typecheck-time validation.

**L3 — SSR-handler integration (Vitest). Every PR.**
Import the SSR handler and call it with a `Request`, asserting on rendered HTML, with MSW `setupServer` + `graphql.link(storefrontUrl).query(...)` intercepting the SSR fetch in-process. No browser, no port, full SSR path. Nothing in Hydrogen does this. Browser component tests are a second, lower-priority option: Vitest browser mode is stable in v4 with `@vitest/browser-playwright` + `vite-plugin-solid` + `@solidjs/testing-library` (track `1.0.0-beta.2` for Solid 2).

**L4 — Full commerce E2E (Playwright). Every PR, against `mock.shop`, zero secrets.**
This is the big unlock, and Hydrogen has proven the exact shape:
- Build a **portable contract suite** modelled on `packages/storefront-e2e`: worker-scoped discovery fixture, `AbortSuiteError`/`SkipTestGroupError`, named capabilities with actionable errors, and a committed `storefront-contract.md`.
- **Discover fixtures through the app's own Storefront API proxy route** so the test process holds no credentials. This requires solidifront to ship a `/api/{version}/graphql.json` proxy handler — do it; it pays for itself twice.
- Boot with Playwright `webServer` (`command`, `url`, `reuseExistingServer: !process.env.CI`, `env`).
- Add tokenless / `mock.shop` support to `createStorefrontMiddleware`. mock.shop covers PLP, PDP, variants, filters, search, the full cart mutation set, and a live `checkoutUrl`.
- **Adopt the `role="status"` cart-settlement contract** and the "never `waitForTimeout`/`networkidle`/`waitForResponse`" rule. This is what makes commerce E2E non-flaky.
- Stop at the checkout handoff. Never enter payment data.

**L5 — Nightly, against a real dev store.**
- The tokenless `publicApiVersions` canary → fail if the pinned version is no longer `supported`, or if a new `(Latest)` appeared.
- Re-fetch the schema proxy and diff type maps against the committed introspection → open an issue on drift.
- Run the same L4 suite against a real dev store to catch what mock.shop cannot: metafields, metaobjects, predictive search, product tags, real inventory limits, real discount applicability. Expect flakiness from the dev-store password page and from `430` on shared CI IPs — which is exactly why this is nightly, not per-PR.

### 12.2 Tool per job

| Need | Tool | Why |
|---|---|---|
| Unit tests of the client | **`Effect.provideService(FetchHttpClient.Fetch, mock)`** | No library. You already have the seam; Hydrogen proves the approach. |
| SSR-handler + component tests | **MSW `setupServer` + `graphql.link().query()`** | Only GraphQL-aware option; Vitest's official recommendation; handlers reusable in the browser. |
| Playwright, browser-originated traffic | **`@msw/playwright@0.6.7`**, same handler array | Official, `page.route`-based. |
| Playwright, SSR traffic | **MSW handlers in the server entry, env-gated** | The only supported seam. Both Hydrogen and `mswjs/examples/with-remix` do exactly this. |
| Recorded fixtures | **Don't. Use mock.shop.** | If forced: `nock@14` + `nock.back`. Polly is soft-abandoned; Playwright HAR is byte-exact and your operations are minified at runtime; undici MockAgent 8 cannot see global `fetch`. |
| Catch-all schema-shaped responses | `graphql.operation()` + `addMocksToSchema` | Proven against the real schema; supply the 8 custom scalars; shape only, no commerce semantics. |

### 12.3 Four prerequisites, in order

1. **Stand up CI.** No `.github/`, no `test`/`typecheck` turbo task, no `lint` script anywhere. Everything above is unenforceable until this exists.
2. **Enforce named, single-operation GraphQL documents.** MSW hard-rejects anonymous operations and silently mis-routes multi-operation documents. Lint for it. (Hydrogen's own `gql('query { shop { name } }')` is anonymous, and therefore unmockable via `graphql.query` — do not copy that.)
3. **Pin `graphql@^16`** deliberately. `17.0.2` throws `assertValidSchema` on Shopify's schema.
4. **Fix `ValidVersion` / `LatestVersion`**, derive them from the committed schema, and guard with the nightly canary.

---

## Open questions / could not verify

**OTEL**

1. **Shopify Storefront API response headers.** The request ID appears **inside the error `message` string** — `"Internal error… Request ID: 1b355a21-… (include this in support requests)."` (https://shopify.dev/docs/api/storefront/2026-04) — so capturing `shopify.request_id` means regex-parsing a message. Whether an `X-Request-Id` **response header** is also returned is `[UNVERIFIED]`; Hydrogen's test helper sets one on mocked responses (`x-request-id`), which is suggestive but not proof. Worth one `curl -i` against a real shop. Whether Shopify emits `Server-Timing` is also `[UNVERIFIED]`.
2. **Whether `@opentelemetry/instrumentation-http` still honours `OTEL_SEMCONV_STABILITY_OPT_IN`.** The spec text is present in semconv v1.44.0 and explicitly permits instrumentations to drop the variable in their next major. Not checked per-SDK.
3. **npm publish of semconv v1.44.0.** npm `latest` is `1.43.0`; spec v1.44.0 released 2026-08-04.
4. **`@opentelemetry/browser-sdk` v0.2.0.** A GitHub tag `browser-sdk-v0.2.0` (2026-07-30) exists but `npm view … versions` returns exactly `["0.1.0"]`. Publish failure, intentional hold, or registry lag — unknown.
5. **W3C Trace Context Level 3 rendered editor's draft.** `https://w3c.github.io/trace-context/` is a ReSpec shell that could not be read. The Server-Timing findings come from the merged source markdown plus PR #560's merge state — high confidence, but the rendered SOTD wording is unverified. `https://www.w3.org/TR/trace-context-3/` returns 404.
6. **Exhaustiveness of "the OTEL spec never mentions Server-Timing."** Based on `specification/context/api-propagators.md` plus a code search; a stray reference elsewhere cannot be fully ruled out.
7. **Effect v4 GA timing.** `references/effect` is at `4.0.0-rc.109`; the repo pins `effect ^3.19.12`. No release date verified. **The Effect 3-vs-4 decision gates the entire tracing design** — in v4 the OTLP modules live in `effect/unstable/observability`, in v3 they live in `@effect/opentelemetry`.
8. **Whether `Otlp.layer`'s browser path has been exercised in production anywhere.** The code has no `@opentelemetry/*` imports and uses `HttpClient`, so it *should* work under `FetchHttpClient` — but I found no primary source documenting Effect's OTLP stack running in a browser. `[UNVERIFIED]` and worth a spike before committing to conclusion 3.

**Testing**

9. **`mock.shop`'s stability and SLA.** No published uptime guarantee, no documented rate limit, no versioning commitment for its data. Product handles could change — discover fixtures at runtime.
10. **`shopify.dev/storefront-graphql-direct-proxy`** is not documented in prose on shopify.dev. Found inside `@shopify/api-codegen-preset@3.0.0`'s shipped source and verified working. Semi-public: used by Shopify's own tooling, no citable stability guarantee.
11. **Chromium `postDataJSON()` returning null for some GraphQL calls** ([microsoft/playwright#24572](https://github.com/microsoft/playwright/issues/24572)) — issue located, current resolution state not read.
12. **`content: 'omit'` breaking Playwright HAR POST matching** — read from `harBackend.ts` / `harTracer.ts`, not an official statement.
13. **undici 8's `Dispatcher1Wrapper` as the mechanism** for the global-`fetch` regression — the symptom is reproduced and unambiguous; the causal explanation is inferred.
14. **`menu` working tokenlessly on mock.shop** contradicts Hydrogen's own skill doc, which lists menus as token-required. Possibly a mock.shop-specific allowance.
15. **The `references/hydrogen` submodule is on branch `preview`** (`@shopify/hydrogen@2026.10.0-preview.0`, grafted). Upstream `main` is the shipped `2026.4.5` line and still contains `packages/hydrogen-react`. The §9 patterns are from the preview rewrite and may still change.
16. **How the Solid 2 target exposes an SSR handler for L3 testing.** L3 assumes you can import a handler and call it with a `Request`. **Corrected:** the target is *not* `@solidjs/start@2.0.0` — that release depends on `solid-js: ^1.9.14` and is a Solid 1.9 framework. Per `docs/research/solid-2.md`, there is no SolidStart for Solid 2.0; start mode moved into `@solidjs/vite-plugin`. **Resolve the handler entry point against `@solidjs/vite-plugin`.** If it exposes no importable handler, L3 collapses into L4 (boot a real server via Playwright `webServer`) and the MSW-in-the-server-entry pattern from §9.3 becomes the only SSR mocking seam. `[UNVERIFIED]` here; likely answered in the sibling doc.
17. **Solid 2 component-testing story.** `@solidjs/testing-library@1.0.0-beta.2` exists on the `next` tag but I did not verify it works against `solid-js@2.0.0-rc.0`.
18. **Solid 2's synchronous dependency tracking changes what a "component test" must assert.** Per `docs/research/solid-2.md`, reads after an `await` do not create dependency edges — dev escalates to `Errored`, production fails silently. Every async data path in this document (`createAsyncQuery`, the `query()`-cached storefront reads, cart mutation handlers) is exactly that shape. **L3 should assert on the `Errored` state explicitly**, since a test that only checks rendered output will pass in dev and mask a silent production failure. I have not designed that assertion; flagging it as a requirement the test layer must meet.
19. **Hydrogen `preview` ships `examples/solid-start/` — a full SolidStart storefront — and it is the closest structural prior art that exists.** But I verified it contains **no tests of any kind**: no `*.spec.*`, no `*.test.*`, no `playwright.config.*`, no `vitest.config.*`; its scripts are only `dev`/`build`/`start`/`typecheck`, and it still runs on vinxi (`vinxi dev`) with Solid 1.9.5. **Useful as a reference for storefront structure and route shape; useless as a testing reference.** There is no prior art for testing a Solid commerce storefront.
