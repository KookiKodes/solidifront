# Solidifront ships only what Shopify documents

Shopify's Storefront introspection carries a first-party `isPrivatelyDocumented` flag marking fields it serves but publishes no reference page for. Solidifront ships **no** privately-documented operation, CI gates on it, and a consumer who reaches for one is warned rather than blocked. Decided in [#49](https://github.com/KookiKodes/solidifront/issues/49).

```graphql
{
  __type(name: "Mutation") {
    fields {
      name
      isPrivatelyDocumented
    }
  }
}
# against shopify.dev/storefront-graphql-direct-proxy/{version}
```

## What the flag actually covers

Measured against the direct proxy at all six supported versions. The **entire** privately-documented member surface of the Storefront API is:

- **6 `Mutation` fields** — `cartBillingAddressUpdate`, `cartPaymentUpdate`, `cartPrepareForCompletion`, `cartSubmitForCompletion`, `cartClone`, `cartRemovePersonalData`
- **15 `CartErrorCode` enum values** — five payment codes plus ten `PAYMENTS_CREDIT_CARD_*`

Nothing else. **Zero** private fields on `QueryRoot`, `Cart`, `Product`, `ProductVariant` — or on any other type. The 28 privately-documented _types_ are the payload and input types reachable only from those six mutations. The shape is identical at `2025-10`, `2026-01`, `2026-04`, `2026-07` and `2026-10`; `unstable` adds a sixteenth enum value, `REDIRECT_TO_CHECKOUT_REQUIRED`, which is notably **not** a payment code — so "the private codes are payments" is a description of today, not a rule.

That smallness is what makes the rest of this ADR cheap. The gate below is a set-membership test against 6 fields and 28 types, not a schema traversal, and the rule can never fire on the product or collection surface a storefront actually reads.

## Why the two cart mutations come out

[ADR-0008](./0008-cart-operations-are-one-service-overridden-by-layer.md) committed to twenty cart operations, having read the set off an introspection that does not surface the flag. [#48](https://github.com/KookiKodes/solidifront/issues/48) found that two of the twenty — `cartClone` and `cartRemovePersonalData` — are privately documented: `301` on their `shopify.dev` reference pages where `cartLinesAdd.md` returns `200`, zero hits in `full-index`, and absent from Shopify's own published schema tarball at every version.

**The deciding fact is that the capability survives.** Every PII slot the two touch has a public, documented substitute: `cartBuyerIdentityUpdate`, `cartDeliveryAddressesRemove`, `cartAttributesUpdate` and `cartNoteUpdate` together cover the cart's personal data, and `cartCreate` covers a clone. Dropping them costs a convenience and one atomicity guarantee, not a feature.

**`cartClone` is not the operation #15 thought it was.** It was justified there as save-for-later, share-link and B2B re-order. Shopify's own schema description reads _"Creates a clone of the specified cart with all personally identifiable information removed."_ A clone that drops buyer identity, delivery addresses and attributes is a poor save-for-later. The two are one PII-scrubbing pair, not a lifecycle operation plus a compliance one — which is why they are ruled on together.

**A privately-documented field is outside the deprecation contract [ADR-0005](./0005-the-api-version-type-is-open-and-narrowed-by-codegen.md) leans on.** GraphQL's deprecation machinery surfaces through a reference page and a changelog; a field with no reference page has nowhere for a notice to render, and the version canary reads documented surface. Shipping one means shipping something that can vanish between two supported versions with no signal before the build breaks.

**It makes the nightly diff actionable.** #48 assigns the tarball the job of diffing documented-versus-served. That diff is only usable if "in the tarball" means "shippable" — otherwise it ships on day one with a two-item, hand-maintained exception list, which is how a drift detector becomes something people mute.

Weighed and rejected: `cartRemovePersonalData` is a single atomic call where the substitute is three or four writes, and "we needed four mutations" is a worse answer to a data-erasure request. Against it — the mutation takes only a `cartId` and reports `tokenRequired: false`, so anyone holding the cart id can call it, which is a strange shape for a compliance control; and Shopify, not solidifront, is the controller for cart PII, so a merchant's erasure path does not run through a storefront mutation.

## Why CI gates, with no allowlist

L2 asserts that **no shipped operation references a privately-documented field or type**, at every committed version, read off the extended introspection L2 already fetches. A new one appearing fails the build.

**The gate is about what a document references, never about what a response may carry.** A shipped operation selecting `userErrors { code }` does _not_ touch private surface: `CartUserError.code` is a public field and only 15 of its _values_ are private. Collapsing the two halves into one check is the obvious way to get this wrong — the value side belongs to [ADR-0006](./0006-an-operation-is-a-generated-module-not-a-string.md)'s decode model and is settled there.

No allowlist. An allowlist with zero entries is a mechanism built for the case this ADR decides against, and its only effect is to make the rule negotiable at exactly the moment someone is tempted to negotiate it. Re-admitting a privately-documented operation should cost an ADR, not a line in a JSON file.

The gate rather than the nightly, because the thing being guarded is solidifront's _own_ operation set, which changes in pull requests. A nightly reports drift in Shopify; this reports drift in us.

## Why the consumer is warned and not blocked

A consumer's own document can select a privately-documented field, and their store will serve it. Codegen **warns**, naming the field and why: Shopify publishes no reference page for it, and it can be removed without a deprecation cycle.

Not an error, because ADR-0005 makes the consumer's own live store the schema authority precisely so solidifront never welds their types to a schema that is not theirs. Hard-failing on a field their store serves and their pinned schema types re-enters `shopify-domain.md:254`'s desync trap from the library side.

Not silence either. Solidifront has just dropped two of its own operations over this boundary; staying quiet would mean holding a standard for ourselves that we never mention to the person it also affects.

The check is self-describing and degrades on its own: `__Field` advertises `isPrivatelyDocumented` in the meta-schema, so codegen probes for it and skips silently on a store that does not serve it, rather than failing.

## Consequences

**ADR-0008's set is eighteen.** Its scope section now carries two rules rather than one: an API that advances checkout is outside the cart, and an operation Shopify does not document is outside the library.

**The rule is Storefront-wide, not cart-specific.** It happens to bite only on cart mutations today because that is the whole of the private surface, but it governs any operation solidifront ships against any Shopify API.

**It is a different boundary from [ADR-0014](./0014-the-customer-account-schema-is-a-committed-standard-tier-fixture.md)'s, and the language keeps them apart.** For Customer Account the boundary is structural — the committed fixture physically lacks the field, so no consumer can name it. Here it is elective: their store serves it, their codegen types it, and we warn. `CONTEXT.md` gains **Privately documented** for this one and amends **Schema tier** to stop the two reading as the same rule.

**Unverified: whether a real merchant store serves the flag.** Confirmed on `shopify.dev/storefront-graphql-direct-proxy/{version}` and on `mock.shop/api/{version}/graphql.json` — the same route shape a consumer's store uses — but never against a live `{shop}.myshopify.com`. This is why the consumer-side check degrades rather than gates; L2's gate is unaffected, since CI reads the proxy.

**Two live-store questions [#48](https://github.com/KookiKodes/solidifront/issues/48) parked are retired rather than inherited.** Whether `cartClone` and `cartRemovePersonalData` answer at runtime is moot — solidifront does not call them. Whether the documented mutations can emit the 15 private `CartErrorCode` values no longer decides anything, because ADR-0006's decode is open either way.
