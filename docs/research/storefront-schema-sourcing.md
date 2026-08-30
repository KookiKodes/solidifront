# Does the Storefront schema come from the dev-mcp tarball too?

**Research date:** 2026-08-30
**Question:** [KookiKodes/solidifront#48](https://github.com/KookiKodes/solidifront/issues/48) — does L2's committed Storefront introspection JSON come from `@shopify/dev-mcp`'s tarball instead of `shopify.dev/storefront-graphql-direct-proxy/{version}`, and does that give [ADR-0014](../adr/0014-the-customer-account-schema-is-a-committed-standard-tier-fixture.md)'s nightly cross-check a second observer on the Storefront side?
**Status:** Answered. **No to minting, and no to independence** — the tarball is the *documented* schema and omits two operations ADR-0008 ships; the independence answer separately inverts ADR-0014's, for Customer as well as Storefront.

**Primary sources.** Everything below was measured on 2026-08-30 from a clean scratch directory. The npm artifact is immutable and pinned by hash; the HTTP endpoints are live and pinned by response hash at fetch time.

| Artifact | Identity | Size |
| --- | --- | ---: |
| `@shopify/dev-mcp@1.14.7` tarball | `sha1 88d97b8ae3cdb54b9e923687039df45f8fc9c6ff` (= npm `dist.shasum`); `sha256 043a66a4c4633930a4d1abfa2ae25ec6797b1221c91086b99d30ac18325d86bc` | 13,338,847 B |
| published | `2026-08-28T14:59:36.967Z` | — |
| `shopify.dev/storefront-graphql-direct-proxy/2026-07` | extended introspection, `sha256 b3ecef9937c31a4d2a6069cb9f672b5ccf5cc3f89377f36d447ea9b35f18d037` (canonical JSON) | 983,502 B |
| `mock.shop/api/2026-07/graphql.json` | same query, **same hash** | 983,502 B |
| `shopify.dev/api-versions.json` | `etag W/"9a62fb94cd7b0e37"`, `cache-control: public, max-age=60, s-maxage=300` | 4,259 B |
| `graphql` used for every schema operation | `16.13.2` (scratch install; = the version dev-mcp itself pins) | — |

Per-version SHA-256 of the six extracted Storefront files is in §1. Comparison scripts live in the session scratchpad, not the repo; every command that produced a number is quoted inline.

---

## Verdict

1. **The tarball ships all six supported Storefront versions**, `2025-10 … unstable`, matching `api-versions.json`'s `storefront.available` and the `customer_*` set ADR-0014 relies on — exactly (§1).
2. **The files are complete, described, deprecation-carrying introspection JSON**, `buildClientSchema`-clean, with `@inContext`'s full five-argument set at every supported version (six at `unstable` — `channelId` is new) (§2).
3. **They are not the same document as the proxy's.** The proxy returns a **strict superset**: 428 named+meta types at `2026-07` against the tarball's 392, plus 7 root fields and 15 `CartErrorCode` enum values. The tarball is exactly the live schema with `isPrivatelyDocumented` fields stripped and then reachability-pruned (§3.1–3.3, §3.5).
   **That filter is not confined to out-of-scope surface.** Two of the six private cart mutations — `cartClone` and `cartRemovePersonalData` — are among the **twenty [#15](https://github.com/KookiKodes/solidifront/issues/15) decided solidifront ships**, and are absent from the tarball at **all six versions**. A tarball-minted fixture fails codegen on them deterministically (§3.5).
4. **On the shared surface they are semantically identical.** Across all six versions: **zero** argument-set differences, **zero** deprecation differences, and of 3,111 descriptions compared at `2026-07`, **3,106 identical after whitespace normalisation**. The five that differ are `Boolean`, `Float`, `ID`, `Int`, `String` — and the tarball's are **graphql-js's own** built-in scalar descriptions, not Shopify's (§3.4).
5. **The tarball is not a second observer of the proxy. It is a graphql-js re-serialisation of Shopify's *documented-schema* artifact — the same artifact shopify.dev renders.** Proven three ways: a `buildClientSchema` → `introspectionFromSchema` round-trip of the *proxy's* response reproduces the tarball's built-in-scalar descriptions and all four introspection meta-type field sets **exactly**; the tarball's descriptions are hard-wrapped at ~80 columns and shopify.dev's per-type Markdown front-matter carries **byte-identical line breaks**, while the live API serves the same text unwrapped; and the tarball's content boundary is exactly the documentation's (§5).
6. **So route 3 is not the independent observer for Storefront, and — on this evidence — was not one for Customer either.** ADR-0014's "genuinely independent second observer" is the claim this research corrects (§6, §10).
7. **The genuinely independent Storefront observer is the live API**, and there are two keyless routes to it that return **byte-identical** introspection: the direct proxy and `mock.shop/api/{version}/graphql.json` (§4).
8. **The consumer-facing path is untouched.** ADR-0005 has the consumer introspect their own store; nothing here reaches it (§7).
9. **`dist/data/` moved under measurement, on a stable version, within the last three months.** `storefront-graphql_2026-07.json.gz` lost two types between `1.14.0` (2026-06-02) and `1.14.7` — `InContextAnnotation` and `InContextAnnotationType`, neither of them privately documented. Pinning and nightly diffing is not optional (§8).

**Confidence: high** for 1–4 and 7–9 (direct measurement, reproducible from the commands below). **High** for 5 on the *fingerprints*, **medium** on the exact build mechanism, which is not observable — `@shopify/shopify-dev-tools` is private and npm-404 (#44). **Medium-high** for 6: it follows from 5 plus the CAAPI spot-check in §6.3, which is one type, not a corpus.

---

## 1. Inventory: what Storefront files the tarball ships

```bash
npm view @shopify/dev-mcp version          # -> 1.14.7
npm view @shopify/dev-mcp dist.tarball     # -> https://registry.npmjs.org/@shopify/dev-mcp/-/dev-mcp-1.14.7.tgz
npm view @shopify/dev-mcp dist.shasum      # -> 88d97b8ae3cdb54b9e923687039df45f8fc9c6ff
curl -sS -o dev-mcp-1.14.7.tgz "https://registry.npmjs.org/@shopify/dev-mcp/-/dev-mcp-1.14.7.tgz"
sha1sum dev-mcp-1.14.7.tgz                 # -> 88d97b8ae3cdb54b9e923687039df45f8fc9c6ff  (matches npm)
tar xzf dev-mcp-1.14.7.tgz --wildcards 'package/dist/data/storefront-graphql_*.json.gz'
```

Six members, one per API version, plus the `customer_*` set ADR-0014 already commits:

| version | `.json.gz` | uncompressed | SHA-256 (uncompressed) |
| --- | ---: | ---: | --- |
| 2025-10 | 113,876 | 1,687,390 | `874a307f7dda0bb4caafb22bee8a909fd48df0a531f632e9d1f2e94cadec912f` |
| 2026-01 | 114,288 | 1,693,858 | `616cd05e9195be665577ef0aa124ad25b3e9c9ee42f88219fe5e88f9c2b6d50b` |
| 2026-04 | 114,414 | 1,695,781 | `f1444c49780685a5d28951c8c04328ec67642e2f8d3141703fc8ab881232fca9` |
| 2026-07 | 116,252 | 1,725,609 | `54b992d0bc6ceffd030f9d4de69be944159cc9686e1e030d97b8293a5fe059bc` |
| 2026-10 | 116,309 | 1,725,484 | `936d2f14b6f847bd67a66f97806998d27c2e119e60258d4137a0a6d5bd72fe37` |
| unstable | 118,592 | 1,762,843 | `8d06ba29389e601af5eeabc19f634788e022a6cb8d06f3da2a196d97b24ffe10` |

**The set matches, three ways.** `curl -sS https://shopify.dev/api-versions.json` returns

```json
"storefront": {"stable":"2026-07","rc":"2026-10","available":["unstable","2026-10","2026-07","2026-04","2026-01","2025-10"]}
"customer":   {"stable":"2026-07","rc":"2026-10","available":["unstable","2026-10","2026-07","2026-04","2026-01","2025-10"]}
```

— identical to each other (ADR-0005's nightly assertion, holding today) and identical to the six `storefront-graphql_*` **and** six `customer_*` members. The two sets also *move together*: at `1.14.4` both were `2025-07 … 2026-07, unstable`; at `1.14.5` both became `2025-10 … 2026-10, unstable`. One publish rotated both (§8).

Top-level shape is `{"data":{"__schema":{…}}}` — the raw envelope of a GraphQL introspection response, pretty-printed at 2-space indent (47,305 lines at `2026-07`).

---

## 2. Characterising each Storefront file

Counted directly out of the JSON (`chars.py` in the scratchpad; one pass per file):

| version | types (incl. 8 meta) | named | types w/ description | fields | fields w/ description | **deprecated fields** | args | inputFields | enumValues | **deprecated enumValues** | directives |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2025-10 | 386 | 378 | 386 | 1195 | 1163 | 49 | 377 | 185 | 988 | 4 | 7 |
| 2026-01 | 388 | 380 | 388 | 1202 | 1170 | 49 | 377 | 185 | 990 | 4 | 7 |
| 2026-04 | 388 | 380 | 388 | 1205 | 1173 | 49 | 377 | 185 | 991 | 4 | 7 |
| **2026-07** | **392** | 384 | 392 | 1237 | 1205 | 49 | 381 | 187 | 992 | 4 | 7 |
| 2026-10 | 392 | 384 | 392 | 1237 | 1205 | 50 | 381 | 187 | 992 | 4 | 7 |
| unstable | 401 | 393 | 401 | 1257 | 1225 | 51 | 391 | 208 | 1008 | 5 | 7 |

392 at `2026-07` is the figure #48 quotes; the 384 named types break down as 242 `OBJECT`, 60 `ENUM`, 46 `INPUT_OBJECT`, 13 `SCALAR`, 12 `UNION`, 11 `INTERFACE`.

**Descriptions are populated.** Every type carries one at every version; 1,205 of 1,237 fields do at `2026-07`. This is what let #45 settle buyer identity from a laptop.

**Deprecated members are present.** 49 deprecated fields and 4 deprecated enum values at `2026-07`. This is not a given — `includeDeprecated: true` is a per-introspection choice, and #45's whole argument turned on reading a *deprecated* member's description (`storefrontCustomerAccessTokenCreate`). The tarball preserves that. The stale `packages/codegen/storefront.schema.json` does too, so the risk is real but not realised here.

**Directives are present, `@inContext` included, with the full argument list.**

| version | `@inContext` arguments |
| --- | --- |
| 2025-10 … 2026-10 | `buyer: BuyerInput`, `country: CountryCode`, `language: LanguageCode`, `preferredLocationId: ID`, `visitorConsent: VisitorConsent` |
| unstable | the above **plus `channelId: ID`** — *"The channel ID used for context. Overrides the channel from API credentials."* |

`locations: [MUTATION, QUERY]`, `isRepeatable: false`, no defaults, at every version. This independently re-confirms [#14](https://github.com/KookiKodes/solidifront/issues/14)/[#16](https://github.com/KookiKodes/solidifront/issues/16)'s five-argument reading, and surfaces a sixth argument arriving at `unstable` that [ADR-0007](../adr/0007-incontext-is-injected-at-build-time-from-the-pinned-schema.md)'s build-time injector will meet when `2027-01` stabilises. The tarball carries seven directives; the live API carries eight — see §3.3.

**`buildClientSchema` accepts all six**, with `printSchema` round-tripping cleanly:

```
storefront-graphql_2025-10.json  OK  sdl bytes= 355640  typeMap= 386
storefront-graphql_2026-01.json  OK  sdl bytes= 356539  typeMap= 388
storefront-graphql_2026-04.json  OK  sdl bytes= 356842  typeMap= 388
storefront-graphql_2026-07.json  OK  sdl bytes= 363173  typeMap= 392
storefront-graphql_2026-10.json  OK  sdl bytes= 363352  typeMap= 392
storefront-graphql_unstable.json OK  sdl bytes= 370945  typeMap= 401
```

So either the introspection JSON or generated SDL can be committed, exactly as ADR-0014 records for the CAAPI files.

---

## 3. Head to head: tarball vs. the direct proxy, same version

### 3.1 The proxy is alive, versioned, and its failure mode is unambiguous

It answers a POST at every version in `storefront.available` and rejects everything else with a **`400`**, not a `404`:

```bash
curl -sS -X POST -H 'Content-Type: application/json' \
  -d '{"query":"{ __schema { queryType { name } } shop { name } }"}' \
  "https://shopify.dev/storefront-graphql-direct-proxy/$v"
```

| version | HTTP | body |
| --- | --- | --- |
| 2025-10 / 2026-01 / 2026-04 / 2026-07 / 2026-10 / unstable | 200 | `{"data":{…,"shop":{"name":"graphql-admin"}},"extensions":{"cost":{"requestedQueryCost":4}}}` |
| **2025-07** (retired 2026-07-16) | **400** | `{"error":"Invalid API version"}` |
| 2025-04, 2024-01, 2027-01, 2026-13, `latest` | **400** | `{"error":"Invalid API version"}` |
| `GET` on the same path | 404 | 80,640-byte shopify.dev HTML 404 page |

This matters for ADR-0005's framing. The exposure it names is *"one undocumented endpoint"*, and #42's complaint about the retired CAAPI key was that its `404` **could not distinguish "deleted" from "never existed."** The proxy has no such ambiguity: a retired version gets a typed JSON `400` from a live endpoint, while a dead endpoint would get an HTML `404`. A tarball's immutability is a real property the proxy lacks — but *diagnostic rot* is not one of the proxy's failure modes, and #48 borrows that argument from #44 where it does not transfer.

**It is a real GraphQL server, not a canned document.** `{ shop { name } }` returns `graphql-admin`; `{"query":"this is not graphql"}` returns a parse error at `[1, 1]`; `{}` returns `{"errors":[{"message":"No query string was present"}]}`. **The query shape therefore determines the answer completely** — `{ __schema { types { name } } }` returns 13,501 bytes of names and nothing else. Everything below was fetched with graphql-js `getIntrospectionQuery({descriptions:true, specifiedByUrl:true, directiveIsRepeatable:true, schemaDescription:true, inputValueDeprecation:true})`, i.e. `includeDeprecated: true` in all five positions, then a second pass extended with Shopify's own meta-fields (§3.3).

### 3.2 They are not byte-identical, and the difference is one-directional

```
canonical JSON, sorted keys, minified — tarball 957,278 B vs proxy 810,337 B
tarball sha256 008b30bcfab01fdd…   proxy sha256 6d25d76f3882644b…   equal: False
```

The proxy is a **strict superset**. At every version, the tarball has **zero** types the proxy lacks:

| version | tarball types | proxy types | proxy-only types | tarball-only | proxy-only root fields | deprecated fields tar/prox |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| 2025-10 | 386 | 422 | 36 | none | 7 | 49/52 |
| 2026-01 | 388 | 424 | 36 | none | 7 | 49/52 |
| 2026-04 | 388 | 424 | 36 | none | 7 | 49/52 |
| 2026-07 | 392 | 428 | 36 | none | 7 | 49/52 |
| 2026-10 | 392 | 429 | 37 | none | 7 | 50/53 |
| unstable | 401 | 453 | 52 | none | 8 | 51/54 |

Enumerated by name at `2026-07`, the 36 proxy-only types are one cluster — the private cart-completion / wallet-payment API:

```
ApplePayWalletContentInput, ApplePayWalletHeaderInput, CartBillingAddressUpdatePayload,
CartCardSource, CartClonePayload, CartCompletionAction, CartCompletionActionRequired,
CartCompletionAttemptResult, CartCompletionFailed, CartCompletionProcessing,
CartCompletionSuccess, CartDirectPaymentMethodInput, CartFreePaymentMethodInput,
CartOperationError, CartPaymentInput, CartPaymentUpdatePayload,
CartPrepareForCompletionPayload, CartPrepareForCompletionResult,
CartRemovePersonalDataPayload, CartStatusNotReady, CartStatusReady,
CartSubmitForCompletionPayload, CartSubmitForCompletionResult, CartThrottled,
CartWalletPaymentMethodInput, CompletePaymentChallenge, CompletionError,
CompletionErrorCode, InContextAnnotation, InContextAnnotationType,
ShopPayWalletContentInput, SubmissionError, SubmitAlreadyAccepted, SubmitFailed,
SubmitSuccess, SubmitThrottled
```

and the 7 proxy-only root fields are `Mutation.{cartBillingAddressUpdate, cartClone, cartPaymentUpdate, cartPrepareForCompletion, cartRemovePersonalData, cartSubmitForCompletion}` plus `QueryRoot.cartCompletionAttempt`.

The three-field deprecation gap is not schema drift: it is `__Directive.{onField, onFragment, onOperation}`, legacy meta-fields deprecated *"Use `locations`."* that graphql-js 16 does not model (§5).

**One difference is not private-only and is worth naming.** `CartErrorCode` — the enum on `CartUserError.code`, which solidifront's cart pillar will decode — is **58 values live and 43 in the tarball**:

```bash
curl -sS -X POST -H 'Content-Type: application/json' \
  -d '{"query":"{ __type(name:\"CartErrorCode\"){ enumValues(includeDeprecated:true){ name isPrivatelyDocumented } } }"}' \
  https://shopify.dev/storefront-graphql-direct-proxy/2026-07
# total 58  private 15  public 43
```

All 15 missing values are `isPrivatelyDocumented: true` (`INVALID_PAYMENT`, `PAYMENT_METHOD_NOT_SUPPORTED`, `PAYMENT_METHOD_NOT_APPLICABLE`, `INVALID_PAYMENT_DEFERRED_PAYMENT_REQUIRED`, `INVALID_PAYMENT_EMPTY_CART`, and ten `PAYMENTS_CREDIT_CARD_*`), and `shopify.dev/docs/api/storefront/2026-07/enums/CartErrorCode.md` (4,952 B) lists **zero** of them — its 43 published values are **set-identical** to the tarball's 43. Under [ADR-0006](../adr/0006-an-operation-is-a-generated-module-not-a-string.md)'s exact-identity decode, a generated `Schema.Literal` union over the tarball's 43 would **reject** a live response carrying one of the other 15. Whether the documented cart mutations can ever emit them is **unverified** — but it is the one place where "the schema Shopify documents" and "the schema Shopify serves" is a decode-time distinction rather than a typing-coverage one. Three more, at pre-release only: `ShopPayPaymentRequestReceipt.shopUser` (2026-10, unstable), `ShopPayPaymentRequestLineItemInput.subscription` and `SubmissionErrorCode.BUYER_IDENTITY_CONTACT_METHOD_REQUIRED` (unstable).

### 3.3 The query shape does change the answer — and the proxy carries meta-fields graphql-js cannot ask for

The tarball carries five JSON keys the standard introspection query never produces: `isPrivatelyDocumented`, `requiredAccess`, `tokenRequired`, `inContextAnnotations`, `isOneOf`. These are not tarball inventions — they are **Shopify's own introspection extensions**, and the proxy exposes them:

```bash
curl -sS -X POST -H 'Content-Type: application/json' \
  -d '{"query":"{ __type(name:\"__Type\"){ fields{name} } d:__type(name:\"__Field\"){ fields{name} } }"}' \
  https://shopify.dev/storefront-graphql-direct-proxy/2026-07
```

> `__Type`: description, enumValues, fields, inputFields, interfaces, **isOneOf**, **isPrivatelyDocumented**, kind, name, ofType, possibleTypes, **requiredAccess**, specifiedByURL, **tokenRequired**
> `__Field`: args, deprecationReason, description, **inContextAnnotations**, isDeprecated, **isPrivatelyDocumented**, name, **requiredAccess**, **tokenRequired**, type

Re-fetching with those added (`iq-ext.graphql`, 983,502 B) is what produced the tables above. Values in the tarball at `2026-07`: 198 of 1,237 fields are `tokenRequired: true`; 26 fields and 63 types carry a `requiredAccess` string naming an `unauthenticated_*` scope; 5 fields on `ProductVariant` (`price`, `compareAtPrice`, `unitPrice`, `quantityRule`, `quantityPriceBreaks`) carry `inContextAnnotations: [{description:"Buyer identity", type:{name:"BuyerInput"}}]` — a machine-readable list of which fields `@inContext` actually changes, which ADR-0007's injector currently derives by hand. **Every type in the tarball is `isPrivatelyDocumented: false`.**

The live schema also carries an eighth directive the tarball drops: **`@accessRestricted`**, present at all six versions on the proxy, absent from all six tarball files.

### 3.4 On the shared surface, they agree exactly

Comparing the 384 shared non-meta types field-by-field, argument-by-argument, description-by-description (`deep.py`), with descriptions normalised for whitespace only:

| version | descriptions compared | identical | differing | which | field-set diffs (non-meta, non-root) | **arg-set / arg-type / default diffs** | **deprecation diffs** |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| 2025-10 | 3053 | 3048 | 5 | Boolean, Float, ID, Int, String | 1 | **0** | **0** |
| 2026-01 | 3064 | 3059 | 5 | same | 1 | **0** | **0** |
| 2026-04 | 3068 | 3063 | 5 | same | 1 | **0** | **0** |
| 2026-07 | 3111 | 3106 | 5 | same | 1 | **0** | **0** |
| 2026-10 | 3111 | 3106 | 5 | same | 2 | **0** | **0** |
| unstable | 3187 | 3182 | 5 | same | 4 | **0** | **0** |

The `@inContext` argument sets are identical at every version, including `channelId` at `unstable`. The field-set diffs are the four named in §3.2. **Nothing else differs.** For every purpose ADR-0005's L2 has — validating shipped operations, injecting `@inContext`, generating types — the two documents describe the same API.

Two structural differences remain and are pipeline artifacts, not content: the tarball sorts arguments and enum values alphabetically (`Article.comments` → `after, before, first, last, reverse`; the proxy → `first, after, last, before, reverse`), and orders its type list by graphql-js reference-collection order with the eight `__` meta types appended last, where the proxy's is alphabetical.

### 3.5 The omission reaches two operations #15 committed to shipping

§3.2 called the 36 proxy-only types "one cluster — the private cart-completion / wallet-payment API". That is not quite right, and the remainder is the most consequential finding in this document.

The exact relationship is: **the tarball is the live schema with `isPrivatelyDocumented` fields stripped, then reachability-pruned, then re-serialised through graphql-js.** Splitting the 36 at `2026-07`:

```
proxy-only total: 36
  type-level isPrivatelyDocumented: true   28
  type-level public, orphaned by pruning:   8
    CartBillingAddressUpdatePayload, CartClonePayload, CartPaymentUpdatePayload,
    CartPrepareForCompletionPayload, CartRemovePersonalDataPayload,
    CartSubmitForCompletionPayload, InContextAnnotation, InContextAnnotationType
```

The eight are the payload types of the six private mutations, plus the two types reachable only from the `inContextAnnotations` meta-field graphql-js cannot model (§3.3) — which is also why they were the pair dropped between `1.14.0` and `1.14.7` (§8.2). In the other direction the filter is clean: **no tarball type is marked private at any of the six versions.**

Now the six private mutations, from the live schema's own flag:

```bash
curl -sS -X POST -H 'Content-Type: application/json' \
  -d '{"query":"{ __type(name:\"Mutation\"){ fields(includeDeprecated:true){ name isPrivatelyDocumented } } }"}' \
  https://shopify.dev/storefront-graphql-direct-proxy/2026-07
# 24 cart mutations live, 6 private:
#   cartBillingAddressUpdate  cartPaymentUpdate  cartPrepareForCompletion  cartSubmitForCompletion
#   cartClone  cartRemovePersonalData
```

Four of those six are the checkout-completion mutations the map already lists **out of scope**, ruled out while resolving [#15](https://github.com/KookiKodes/solidifront/issues/15). **The other two are not.** #15 counted 24 cart mutations by introspection, ruled the four completion mutations out, and decided **twenty ship** — naming `cartClone` and `cartRemovePersonalData` explicitly among them. Both are privately documented, and both are absent from the tarball at **all six versions**:

```
2025-10 … unstable: tarball 18 cart mutations, proxy 24, proxy-only identical at every version:
  cartBillingAddressUpdate, cartClone, cartPaymentUpdate,
  cartPrepareForCompletion, cartRemovePersonalData, cartSubmitForCompletion
```

Corroborated off the docs corpus, independently of the flag: `cartClone` and `cartRemovePersonalData` appear **zero** times in `full-index` at `2026-07`, and `shopify.dev/docs/api/storefront/2026-07/mutations/{cartClone,cartRemovePersonalData}.md` both `301` where `cartLinesAdd.md` returns `200`.

So a tarball-minted L2 fixture does not merely risk a decode rejection on an enum value that may never arrive (§3.2) — it **fails codegen outright on two of the twenty operations ADR-0008 commits to shipping**, at every supported version, deterministically. That is the false-rejection failure mode [ADR-0014](../adr/0014-the-customer-account-schema-is-a-committed-standard-tier-fixture.md) weighed for Customer and judged acceptable *there* because the fields in question were undocumented and unused. Here the operations are undocumented and **used**.

**This also corrects #15 outward.** ADR-0008's twenty-operation set contains two privately-documented mutations, and #15 did not know it — it read the set off an introspection that does not distinguish, and Shopify publishes a machine-readable flag that does. Whether solidifront ships operations Shopify does not document is a scope question ADR-0008 never actually faced.

---

## 4. There are two live routes, and they are byte-identical

`https://mock.shop/api/{version}/graphql.json` — the tokenless endpoint `docs/research/otel-and-testing.md` and `prototypes/codegen-schema` already use — is **versioned**, not just a single-version demo:

| version | mock.shop types | proxy types |
| --- | ---: | ---: |
| 2025-10 | 422 | 422 |
| 2026-01 | 424 | 424 |
| 2026-04 | 424 | 424 |
| 2026-07 | 428 | 428 |
| 2026-10 | 429 | 429 |
| unstable | 453 | 453 |

Posting the *same* extended introspection to both:

```
key-order-preserving identical: True
sha256 proxy    b3ecef9937c31a4d2a6069cb9f672b5ccf5cc3f89377f36d447ea9b35f18d037
sha256 mockshop b3ecef9937c31a4d2a6069cb9f672b5ccf5cc3f89377f36d447ea9b35f18d037
```

Byte-identical, 983,502 B each. `{ shop { name } }` distinguishes them (`graphql-admin` vs `Mock.shop`), and both are `server: cloudflare` with the same `x-request-id` format — two storefronts on the same Shopify GraphQL edge. Neither echoes `x-shopify-api-version` on this path. `https://mock.shop/api` unversioned serves `2025-10` (422 types); `POST /api/2026-07` without `/graphql.json` is a Fastify `404`.

They are **not** independent observers of each other — same runtime, same schema. What mock.shop buys is *route* redundancy against the specific risk ADR-0005 names (shopify.dev retiring an undocumented path), at zero cost. It is not better-documented: neither `mock.shop` nor `direct-proxy` appears anywhere in shopify.dev's 8,692-URL `sitemap_standard.xml.gz`.

---

## 5. Independence: what actually minted the tarball

**It has been through graphql-js.** Take the *proxy's* extended introspection, run `buildClientSchema` then `introspectionFromSchema` under `graphql@16.13.2` — the version `@shopify/dev-mcp@1.14.7` pins as a runtime dependency — and compare the result to the tarball:

```
Boolean roundtrip==tarball desc: true      __Type        roundtrip==tarball fields: true
ID      roundtrip==tarball desc: true      __Directive   roundtrip==tarball fields: true
Int     roundtrip==tarball desc: true      __InputValue  roundtrip==tarball fields: true
Float   roundtrip==tarball desc: true      __EnumValue   roundtrip==tarball fields: true
String  roundtrip==tarball desc: true
roundtrip isOneOf on ApiVersion: null   tarball: null   (proxy: false)
```

Every one of §3.4's five description differences and every meta-type difference in §3.2 is **reproduced exactly** by a graphql-js round-trip of the proxy's own bytes. `buildClientSchema` substitutes graphql-js's `specifiedScalarTypes` and `introspectionTypes` for whatever the input carried — which is why the tarball says *"The `Boolean` scalar type represents `true` or `false`"* where Shopify's runtime says *"Represents `true` or `false` values"*, and why the tarball's `__Type` lacks the four Shopify extensions §3.3 shows the live schema exposing. Not one of these is a fact about the Storefront API; all are fingerprints of a serialiser.

What the round-trip does **not** reproduce — alphabetically sorted args and enum values, `defer, inContext, oneOf` ahead of graphql-js's `include, skip, deprecated, specifiedBy`, reference-collection type order — points at SDL rather than a captured response as the input to that graphql-js step (`buildASTSchema` appends missing specified directives in exactly that position). The exact mechanism is **unverified**: `@shopify/shopify-dev-tools@1.12.6`, dev-mcp's devDependency and the near-certain generator, is npm-404 (#44 established this); dev-mcp's `package.json` declares no `repository`, `homepage` or `bugs`, it publishes no README (§9b), and no public repo was found.

**And it shares an upstream with shopify.dev's rendered documentation.** Two independent signals:

**(a) Byte-identical hard wrapping.** Tarball descriptions are wrapped at ~80 columns (mean non-blank line 69.1 chars, 325 of 1,597 multi-line at `2026-07`); the proxy's are flowed paragraphs with a trailing newline (mean 97.7, 201 multi-line). shopify.dev's per-type Markdown front-matter carries **the tarball's line breaks, not the proxy's**:

```
tarball  Attribute.description:
  "A custom key-value pair for storing additional information on\n[carts](…/Cart), [cart\nlines](…/CartLine),\n[orders](…/Order), and [order line\nitems](…/OrderLineItem).\nCommon uses include gift wrapping requests, customer notes, and tracking whether\na customer is a first-time buyer.\n\n…"

shopify.dev/docs/api/storefront/2026-07/objects/Attribute.md (YAML `>-`, blank-line-separated to preserve breaks):
  A custom key-value pair for storing additional information on
  [carts](/docs/api/storefront/2026-07/objects/Cart), [cart
  lines](/docs/api/storefront/2026-07/objects/CartLine),
  [orders](/docs/api/storefront/2026-07/objects/Order), and [order line
  items](/docs/api/storefront/2026-07/objects/OrderLineItem).
  Common uses include gift wrapping requests, customer notes, and tracking whether
  a customer is a first-time buyer.
```

Same breaks, same positions. The page *body* renders it re-flowed; the front-matter preserves the source. The live API never produces those breaks.

**(b) The same content boundary.** The tarball's 392 vs the proxy's 428 is the `isPrivatelyDocumented` line, and `full-index.md` at `2026-07` contains **zero** hits for `cartSubmitForCompletion`, `cartCompletionAttempt`, `cartPrepareForCompletion`, `CartThrottled` or `ApplePayWalletContentInput`, and `enums/CartErrorCode.md` publishes 43 values, not 58 — **set-identical to the tarball's 43**, not merely the same count. The filter is not a *pure* per-member flag — `QueryRoot.cartCompletionAttempt` and `CartSubmitForCompletionPayload` are `isPrivatelyDocumented: false` on the proxy yet absent from both the tarball and the docs — which is itself the point: the tarball and the docs agree on a boundary the flag alone does not define.

**Conclusion.** The tarball and shopify.dev's rendered docs are two renderings of one documented-schema artifact. The live API is a different artifact from a different pipeline. **The tarball is a second observer of the *documentation*, not of the *API*.**

---

## 6. Route 3 for Storefront

### 6.1 It exists, and answers at every version

`https://shopify.dev/docs/api/storefront/{version}/full-index.md` returns 200 at all six (`2025-10` 47,800 B → `unstable` 50,745 B; `2026-07` 48,041 B is byte-identical to `latest`), `cache-control: public, max-age=3600, stale-while-revalidate=82800`.

### 6.2 But the `full-index` asymmetry is worse than ADR-0014 found for Customer

406 links, 275 of them type-ish, against 384 named introspection types at `2026-07` — a 109-type shortfall (ADR-0014 records 345 vs 364 for Customer). The structure is regular and the arithmetic is exact:

| docs section | sitemap URLs | tarball equivalent |
| --- | ---: | --- |
| `objects/` | 151 | 242 `OBJECT` − 28 `*Edge` − 28 `*Connection` − 35 `*Payload` = **151** ✓ |
| `connections/` | 28 | 28 `*Connection` ✓ |
| `payloads/` | 35 | 35 `*Payload` ✓ |
| `enums/` | 60 | 60 `ENUM` ✓ |
| `input-objects/` | 46 | 46 `INPUT_OBJECT` ✓ |
| `scalars/` | 13 | 13 `SCALAR` ✓ |
| `unions/` | 12 | 12 `UNION` ✓ |
| `interfaces/` | 10 | 11 `INTERFACE` — **`Node` missing** |
| `directives/` | **0** | 7 |

The 28 `*Edge` types and `Node` are **reachable but unlisted** (`objects/ArticleEdge.md` → 200, 931 B; `interfaces/Node.md` → 200, 1,336 B), so a crawler can recover 384 of 384 types by synthesising names — but not from the index, and not from the sitemap.

**Directives are not published at all.** `directives/inContext.md` `301`s to `latest/directives/inContext.md`, which `404`s, and the sitemap contains zero `directives` URLs. Route 3 therefore **cannot answer** the question ADR-0007, #14 and #16 depend on — what arguments `@inContext` takes. Only the tarball and the live endpoints can.

### 6.3 And on §5's evidence it is not independent of the tarball — for Customer either

The CAAPI file shows the identical fingerprints. `customer_2026-07.json`'s `Boolean` description is graphql-js's; its `__Type` field list is graphql-js's (`kind, name, description, specifiedByURL, fields, interfaces, possibleTypes, enumValues, inputFields, ofType, isOneOf`), lacking the Shopify extensions; and its `Customer` description is hard-wrapped byte-for-byte the same as `shopify.dev/docs/api/customer/2026-07/objects/Customer.md`'s front-matter:

```
tarball: "Represents the personal information of a customer. Apps using the Customer\nAccount API must meet the protected customer data\n[requirements](https://shopify.dev/docs/apps/launch/protected-customer-data)."
docs   :  Represents the personal information of a customer. Apps using the Customer
          Account API must meet the protected customer data
          [requirements](https://shopify.dev/docs/apps/launch/protected-customer-data).
```

ADR-0014's *"The nightly cross-check now has a genuinely independent second observer … Route 3 supplies the separation"* does not survive this. **Unverified:** this is one type, not a corpus diff — the full CAAPI docs-vs-tarball comparison was not run, and neither was the tarball-vs-live-borrowed-key introspection ADR-0014 already lists as sandbox-blocked (no key was borrowed in this session; it remains strictly secondary).

---

## 7. The consumer path is untouched, and why that is not a judgement call

ADR-0005 and [#12](https://github.com/KookiKodes/solidifront/issues/12) split the schema question in two, and **only one half is in this ticket**.

The consumer's half: *"Consumers introspect their own store tokenlessly"* — because *"the version determines the consumer's **generated types**"*, and deriving those from the consumer's own pinned version against their own store is precisely what makes [#12](https://github.com/KookiKodes/solidifront/issues/12)'s no-default rule work and what ADR-0005 cites Hydrogen's `docs/research/shopify-domain.md:254` desync trap against. Substituting *any* central artifact for that store — tarball, proxy, or mock.shop — would weld a consumer's types to a schema that is not their store's, reinstating the trap from the other side. ADR-0014 already states the same boundary from the CAAPI side: *"the Storefront side continues to work, since ADR-0005 has the consumer introspect their own store live."*

Solidifront's half is CI's: ADR-0005's *"L2 commits one introspection JSON per supported version and validates every shipped operation against all of them,"* whose only current source is the proxy because *"CI has no store."* That is the artifact #48 re-sources. Nothing measured here touches the consumer path, and **no reason was found that it should** — the tarball's one substantive shortfall (§3.2's 15 private `CartErrorCode` values) argues, if anything, for keeping the consumer on their live store rather than moving them onto a documented-schema fixture.

This ticket does not reopen #12 or ADR-0005's no-default rule.

---

## 8. Stability of the source

### 8.1 The name has been stable; the directory has not

`dist/data/` did not exist before **`1.4.0` (2025-10-01)** — `1.0.0` embedded a schema in `dist/shopify-admin-schema.js`, and `1.1.0`/`1.2.0` shipped no data files at all (`1.2.0`'s whole tarball is 127,459 B). There is no `1.3.0`.

| release | date | `storefront-graphql_*` versions | notable |
| --- | --- | --- | --- |
| 1.4.0 | 2025-10-01 | `2025-07` **only** | first appearance; `latest-releases-schemas.json` |
| 1.5.0 | 2025-11-17 | multi-version | `functions_*` added |
| 1.8.0 | 2026-03-23 | multi-version | **`functions_*` renamed** — `_schema_` infix added |
| 1.12.0 | 2026-04-09 | multi-version | **`functions_*` renamed back** |
| 1.14.0 | 2026-06-02 | 2025-07, 2025-10, 2026-01, 2026-04, 2026-07, unstable | `latest-releases-schemas.json` → **`supported-versions-schema.json`** |
| 1.14.2 | 2026-06-25 | same | |
| 1.14.4 | 2026-07-27 | same — still ships **retired** `2025-07`, 11 days after its 2026-07-16 retirement | |
| 1.14.5 | 2026-08-19 | 2025-10 … **2026-10**, unstable | RC arrives; `2025-07` dropped |
| 1.14.7 | 2026-08-28 | same | |

`storefront-graphql_<version>.json.gz` and `customer_<version>.json.gz` have kept their names and path across all eleven months. Nothing else in `dist/data/` has: `functions_*` moved twice, and the version-catalog file — the one ADR-0005 cites by name as `supported-versions-schema.json` — was renamed at `1.14.0`. ADR-0014's *"`dist/data/`'s layout is not a stability contract"* is confirmed by observation, not just by prudence.

### 8.2 The content moved too, on a stable version

Between `1.14.0` (2026-06-02) and `1.14.7` (2026-08-28), `storefront-graphql_2026-07.json.gz` went **394 → 392 types**, losing `InContextAnnotation` and `InContextAnnotationType`. `unstable` lost the same two (403 → 401). `2026-07` was already stable; nothing changed in the API. What changed was the publisher's filter — and both dropped types are `isPrivatelyDocumented: false` on the live schema, so this was not a private-surface tightening. **This is the exact hazard ADR-0014 refuses pre-release fixtures over** (*"a routine solidifront release silently changes a consumer's generated types"*), observed on a **stable** version of the Storefront half.

Shorter-range, the files are byte-stable: `2025-10`, `2026-07`, `2026-10` and `unstable` are all identical between `1.14.5` and `1.14.7` (9 days), as are `customer_2026-07`.

### 8.3 Concentration risk

Committing Storefront to the tarball makes one npm package load-bearing for two of solidifront's pillars. Three things bound it:

- **The proxy does not have to go.** It is the independent observer (§5) and the only source for `@accessRestricted`, the private `CartErrorCode` values, and Shopify's `isPrivatelyDocumented`/`requiredAccess`/`tokenRequired`/`inContextAnnotations` extensions. Keeping it as the nightly's second eye is not a fallback grudgingly retained; it is the check.
- **mock.shop is a second live route at zero cost** (§4), so "shopify.dev retires the proxy path" is not a single point of failure either.
- **The failure is loud.** `npm view` on a missing member, or `tar` on a moved path, fails immediately and locally — unlike ADR-0014's `404` rot, and unlike a silent tier change.

The asymmetry that does bite: **Customer has no equivalent of §4.** There is no keyless live CAAPI route (#42, #44), so the CAAPI fixture's only independent observer is the docs corpus — which §6.3 now says is not independent. Adding Storefront to the tarball does not worsen that; it makes it visible.

### 8.4 Immutability, for the record

`cache-control: public, must-revalidate, max-age=31557600` on the npm tarball against `max-age=60, s-maxage=300` on `api-versions.json` and `max-age=3600, stale-while-revalidate=82800` on the docs Markdown. The tarball's pinnability is real and is the strongest argument in #48. It is an argument about *reproducibility*, not about *correctness* — and §8.2 shows a pinned artifact reproduces yesterday's answer, including yesterday's filter bug.

---

## 9. The four decision questions

### a. Are L2's committed Storefront schemas minted from the tarball instead of the direct proxy — and does the proxy stay as a fallback or go?

**Mint from a live route; the tarball does not stay as a fallback, it takes a different job.** This reverses the recommendation this document originally carried, on the measurement in §3.5.

On the shared surface the two are semantically identical and nothing here disputes that: zero argument differences, zero deprecation differences, 3,106 of 3,111 descriptions identical at `2026-07`, identical `@inContext` argument sets at all six versions (§3.4). The tarball also wins on reproducibility — immutable, hash-pinned, one `curl | tar` with no POST body. But "the shared surface" is the whole question, and the unshared surface is not all out-of-scope: **`cartClone` and `cartRemovePersonalData` are privately documented, absent from the tarball at every supported version, and both are inside ADR-0008's twenty-operation set** (§3.5). L2's stated job is to validate every shipped operation against every committed schema; a tarball-minted fixture fails two of twenty, at all six versions, deterministically — not a risk to price but a build that does not go green. The `CartErrorCode` gap (§3.2) is the softer version of the same defect and would remain even if the two mutations were dropped.

So: **mint L2's fixtures from the direct proxy or `mock.shop`** — byte-identical at all six versions (§4), so the choice between them is an availability question, not a content one, and committing both hashes costs nothing. The proxy is not a "fallback" in this arrangement and never was one: after §5 it is the only view of the *API*, the tarball being a view of the *documentation*.

**The tarball's real job is the nightly, and it is a better one than "fallback".** Diffing the committed fixture against the tarball is precisely the documented-versus-served boundary — it is what would have caught `cartClone` being undocumented before ADR-0008 committed to shipping it, and it is machine-readable without the tarball at all, since the proxy publishes `isPrivatelyDocumented` directly (§3.3). That suggests the cheaper mechanism: **assert in L2 that no shipped operation touches a privately-documented field**, read off the live introspection solidifront already fetches. The tarball then becomes corroboration rather than infrastructure.

Two things must be decided before this lands, neither resolvable here. Whether solidifront ships privately-documented operations at all — a scope question ADR-0008 never faced, and the map's own "checkout is off-domain" reasoning does not settle it, because `cartRemovePersonalData` is a data-deletion affordance rather than a checkout step. And whether `CartUserError.code` decodes as an open branded string rather than a closed literal union under ADR-0006 (§3.2), which is required regardless of source, since the *consumer's* live store serves all 58 values.

### b. Does this retire ADR-0005's "one undocumented endpoint is load-bearing for CI" exposure, or merely add a second undocumented one?

**It retires the *load-bearing* half and adds a second undocumented source, and the second is undocumented in a materially weaker way.** After minting from the tarball, CI does not need the proxy to build — that is a real retirement of "load-bearing." What replaces it is `package/dist/data/storefront-graphql_<version>.json.gz`, which is undocumented in a stronger sense than the proxy: **`@shopify/dev-mcp` ships no README at all** — `README.md` is declared in `package.json`'s `files` yet absent from the published tarball, and the registry's `readme` field is the 28-byte string `ERROR: No README data found!` — `package.json` declares no `repository`, `homepage` or `bugs`, and the directory has demonstrably moved (`functions_*` twice, `latest-releases-schemas.json` → `supported-versions-schema.json` at `1.14.0`) (§8.1). But an npm member that vanishes fails loudly at a pinned version, whereas the proxy's risk is a live path disappearing. ADR-0005's phrasing should also be corrected on two counts. First, **the proxy's diagnostics are not ambiguous** — a retired or bogus version returns a typed `400 {"error":"Invalid API version"}` from a live endpoint, so #44's `404`-rot argument, which #48 imports, does not transfer (§3.1). Second, **"one endpoint" was already inaccurate**: `mock.shop/api/{version}/graphql.json` returns byte-identical introspection at all six versions (§4), and ADR-0005 already cites mock.shop for `publicApiVersions` without noticing it serves the schema too. The honest count after this ticket is **three** Storefront sources, one immutable and two live-identical.

### c. Does the nightly gain a Storefront observer that clears ADR-0014's common-cause-independence bar — or is shopify.dev's rendered documentation again the independent one?

**Neither — and the question's framing is what this research corrects.** The tarball is not an independent observer of the proxy: it is a graphql-js re-serialisation of Shopify's documented-schema artifact, proven by a round-trip that reproduces its built-in-scalar descriptions and all four introspection meta-type field sets *exactly* from the proxy's own bytes (§5). And shopify.dev's rendered docs are **not** independent of the tarball: their per-type front-matter carries byte-identical hard line breaks that the live API never emits, and they share the same content boundary down to `CartErrorCode`'s 43-of-58 (§5, §6.2). **The independent pair is `tarball ⟷ live API`, not `tarball ⟷ docs`.** So the nightly does gain a genuine drift detector on the Storefront side, but the second observer is the proxy (or mock.shop), and the docs corpus is the *dependent* one — additionally unusable for directives, which it does not publish at all (§6.2). This inverts ADR-0014's Consequence for Customer as well, where the same fingerprints hold (§6.3) and where the loss is worse, because CAAPI has no live keyless route to substitute.

### d. Does the consumer-facing path change at all?

**No.** ADR-0005 has the consumer introspect their own store live, because their pinned version determines their generated types, and #12's no-default rule exists so a solidifront release can never move those types without a diff in their repo. #48 is about the schema **CI** validates against; substituting a central artifact for the consumer's store would weld their types to a schema that is not their store's — the Hydrogen desync trap ADR-0005 cites from `shopify-domain.md:254`, entered from the other side. No reason was found to touch it, and §3.2 argues mildly the other way: a consumer's live store serves the 15 private `CartErrorCode` values the documented schema omits. A later session reading this should not treat it as reopening #12.

---

## 10. Corrections to standing documents

- **ADR-0014 — "The nightly cross-check now has a genuinely independent second observer."** Wrong, and this is the load-bearing correction. Route 3 (`shopify.dev/docs/api/customer/<version>/full-index.md`) is not "a different artifact from a different pipeline than the schema file": the tarball's descriptions and the docs' front-matter carry byte-identical hard wrapping the live API does not produce, and the tarball is a graphql-js re-serialisation of a documented-schema artifact (§5, §6.3). The Customer fixture's real independent observer would be a live CAAPI introspection — which #42/#44 established has no keyless route — so the CAAPI cross-check is *weaker* than recorded, not stronger. (§6.3's CAAPI evidence is one type; the corpus diff is unverified.)
- **ADR-0014 — "shopify.dev's rendered reference documentation is itself standard tier … a different artifact from a different pipeline than the schema file."** The *conclusion* (the documented API is standard tier) is unaffected and still stands on the marker measurement. The *grounds* — pipeline independence — are what §5 refutes. #44 retired #43's circularity by swapping the validator for the docs corpus; on this evidence the swap moved from one reading of the schema file to a second reading of the same upstream. The non-circular witness available today is the live proxy for Storefront, and for Customer, a borrowed-key introspection — still unrun.
- **ADR-0005 — "One undocumented endpoint is load-bearing for CI."** Two amendments. There is more than one route: `mock.shop/api/{version}/graphql.json` serves byte-identical introspection at all six versions (§4). And the proxy's failure mode is a typed `400`, not a rot-prone `404` (§3.1), so #48's imported argument from #44 does not apply to it.
- **#48's framing — "An immutable npm tarball has properties the proxy does not: … incapable of rotting into an ambiguous `404`."** True of npm, but the premise about the proxy is false (§3.1). The tarball's genuine advantages are pinnability and reproducibility; its genuine costs are the documented-schema filter (§3.2) and a filter that moved on a stable version within three months (§8.2).
- **ADR-0014 — "dev-mcp carries `unstable` and the RC ahead of stable, so a version's schema is in the package months before that version becomes supported."** Directionally right, quantitatively unsupported by measurement: `2026-10` was absent at `1.14.4` (2026-07-27) and present at `1.14.5` (2026-08-19) (§8.1). The date `2026-10` was declared RC is **unverified**, so "months" is not measured here. The same table shows the lag runs both ways — `2025-07` was still shipping 11 days after retirement.
- **#15 / [ADR-0008](../adr/0008-cart-operations-are-one-service-overridden-by-layer.md) — the twenty-operation set contains two privately-documented mutations.** `cartClone` and `cartRemovePersonalData` carry `isPrivatelyDocumented: true` on the live schema, are absent from shopify.dev's docs corpus (`301`, zero `full-index` hits), and are absent from the tarball at all six versions (§3.5). #15 read its set off an introspection that does not surface the flag. This is a scope question ADR-0008 never faced — it is not resolved here, only surfaced.
- **This document's own §9a, as first written.** It recommended minting from the tarball, having characterised the 36 proxy-only types as one out-of-scope cluster. Two of the six omitted mutations are in scope (§3.5), so the recommendation is reversed above. The semantic-identity measurements it rested on (§3.4) are unaffected and still hold.
- **`docs/research/otel-and-testing.md:1019`** instructs committing the introspection JSON "fetched from `shopify.dev/storefront-graphql-direct-proxy/{version}`". If #48 lands, that line is superseded.

---

## 11. Unverified

- **Whether `cartClone` and `cartRemovePersonalData` behave as documented mutations at runtime.** They are served by the live API and typed by it; that they are undocumented says nothing about whether they answer. Untested — no store (§3.5).
- **Whether the documented Storefront mutations can return the 15 private `CartErrorCode` values.** The delta is measured and named (§3.2); whether `cartLinesAdd` et al. can emit `PAYMENT_METHOD_NOT_APPLICABLE` is not. It decides whether a tarball-minted fixture is decode-safe under ADR-0006, and it needs a live cart against a real store — L5 territory.
- **The exact build mechanism of `dist/data/*.json.gz`.** `@shopify/shopify-dev-tools@1.12.6` is npm-404 (#44), dev-mcp declares no `repository`/`homepage`/`bugs`, and no public repo was found. §5's conclusion rests on output fingerprints, which are strong but indirect. The SDL-vs-captured-response question inside that step is likewise inferred from ordering, not observed.
- **The full CAAPI docs-vs-tarball corpus diff.** §6.3 compares one type (`Customer`) plus the graphql-js fingerprints. A corpus-wide comparison would settle ADR-0014's correction rather than merely forcing it.
- **Tarball vs live borrowed-key CAAPI introspection.** ADR-0014 lists this as sandbox-blocked; it was not attempted here (no key borrowed, explicitly secondary in the ticket). It remains the only measurement that would confirm byte-level tier identity for Customer.
- **When `2026-10` was declared the release candidate**, and therefore the true lead time of the tarball's RC coverage (§8.1). No historical source for `api-versions.json` or `publicApiVersions` was found.
- **Whether `mock.shop` carries any first-party stability commitment.** It appears in no shopify.dev sitemap URL and no docs page reachable from `docs.md`; it is served from Shopify infrastructure (`demostore.mock.shop` assets on Shopify's CDN, `server: cloudflare`) and is used by Hydrogen's own suite, but "official" is not established in writing here.
- **Whether a development store's password page blocks tokenless introspection** — ADR-0005's own standing unknown, untouched by this ticket and unaffected by it (§7).
- **`@inContext`'s `channelId` semantics at `unstable`.** Read from the schema description only; no live call was made.

---

## Appendix — reproducing every measurement

```bash
S=/tmp/sf48 && mkdir -p $S && cd $S

# 1. pin and extract
npm view @shopify/dev-mcp version dist.tarball dist.shasum
curl -sS -o dev-mcp-1.14.7.tgz "$(npm view @shopify/dev-mcp dist.tarball)"
sha1sum dev-mcp-1.14.7.tgz
tar tzvf dev-mcp-1.14.7.tgz | grep 'dist/data/'
tar xzf dev-mcp-1.14.7.tgz --wildcards 'package/dist/data/storefront-graphql_*.json.gz'
for f in package/dist/data/storefront-graphql_*.json.gz; do
  gunzip -c "$f" > "$(basename "$f" .json.gz).json"; done
sha256sum storefront-graphql_*.json

# 2. version set
curl -sS https://shopify.dev/api-versions.json | python3 -m json.tool

# 3. the introspection query actually sent (graphql 16.13.2)
npm i graphql@16.13.2
node -e 'const {getIntrospectionQuery}=require("graphql");
  require("fs").writeFileSync("iq-full.graphql", getIntrospectionQuery(
    {descriptions:true,specifiedByUrl:true,directiveIsRepeatable:true,
     schemaDescription:true,inputValueDeprecation:true}))'
# then extended with Shopify meta-fields: isOneOf, isPrivatelyDocumented,
# requiredAccess, tokenRequired on __Type; the same plus
# inContextAnnotations { description type { name kind } } on __Field
python3 -c 'import json;json.dump({"query":open("iq-ext.graphql").read()},open("body-ext.json","w"))'
for v in 2025-10 2026-01 2026-04 2026-07 2026-10 unstable; do
  curl -sS -X POST -H 'Content-Type: application/json' --data @body-ext.json \
    -o "proxy_${v}_ext.json" "https://shopify.dev/storefront-graphql-direct-proxy/$v"; done

# 4. mock.shop, same body
curl -sS -X POST -H 'Content-Type: application/json' --data @body-ext.json \
  -o mockshop_2026-07_ext.json "https://mock.shop/api/2026-07/graphql.json"

# 5. graphql-js round-trip of the proxy's own bytes  (roundtrip.mjs)
node roundtrip.mjs

# 6. docs corpus
for v in 2025-10 2026-01 2026-04 2026-07 2026-10 unstable; do
  curl -sSL -o "fi_$v.md" "https://shopify.dev/docs/api/storefront/$v/full-index.md"; done
curl -sSL -o sm.gz https://shopify.dev/sitemap_standard.xml.gz && gunzip -c sm.gz > sm_full.xml

# 7. release history
for v in 1.0.0 1.1.0 1.2.0 1.4.0 1.5.0 1.8.0 1.12.0 1.14.0 1.14.2 1.14.4 1.14.5; do
  curl -sS -o "old/$v.tgz" "https://registry.npmjs.org/@shopify/dev-mcp/-/dev-mcp-$v.tgz"
  tar tzf "old/$v.tgz" | grep -E 'dist/data/[^/]*$'; done
```

Analysis scripts (`chars.py`, `deep.py`, `bcs.mjs`, `roundtrip.mjs`) are session scratchpad files, reproducible from the descriptions in §2, §3.4 and §5.
