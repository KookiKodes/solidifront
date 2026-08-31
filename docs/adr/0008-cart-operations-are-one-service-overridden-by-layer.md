# Cart operations are one service, overridden by layer

`CartOperations` is a single Effect service whose members are the Storefront API's cart mutations, named verbatim. Consumers override a member with a replacement `Layer`, and an override receives the default it replaces as a value. Cross-cutting behaviour is applied as decorator layers **above** consumer overrides, so it cannot be dropped by overriding. Decided in [#15](https://github.com/KookiKodes/solidifront/issues/15).

```ts
// override one member, delegating to the default
const WithLogging = CartOperations.override((base) => ({
  ...base,
  cartLinesAdd: (args, options) =>
    base.cartLinesAdd(args, options).pipe(Effect.tap(logIt)),
}));
```

## Why one service rather than one tag per operation

A single service whose members are the 18 operations is the direct generalization of Hydrogen classic's `*Default(options)(args)` currying — an operation as a value parameterized by a context record. Overriding a member is then a record spread, which is Effect's idiomatic decorator shape and makes "call through to the default" a one-liner.

One tag per operation would allow surgical override without the spread, at the cost of 18 tags in `Context` and 18 layer merges. Nothing in the library depends on a single cart operation in isolation, so the granularity buys nothing and the cost is paid on every consumer's layer graph.

## Why this beats both reference implementations

Hydrogen classic's `customMethods` is a shallow spread evaluated once at construction, typed `Omit<HydrogenCart, keyof TCustomMethods> & TCustomMethods`. **A custom method gets no reference to the default it replaced**, so Shopify's own example re-derives the default by reaching back for the exported factory. Two overrides of the same member can never compose.

Hydrogen preview's only documented seam is a fragment that must be literally named `CartFragment`, matched by a runtime regex. Its `CartAction` union and its `executeMutation` switch are closed: you cannot add `cartBuyerIdentityUpdate`, change what `add` does, or register a new intent.

`Layer.updateService(layer, Tag, f)` — where `f: (default) => replacement` — is the primitive neither has. The default arrives as a value because it _is_ a value, rather than a `switch` arm or a spread-away key.

## Why override signatures are pinned

`Layer.updateService`'s `f: (a: NoInfer<A>) => A` forces the returned record to be assignable to the service type, so an override cannot reshape a member. That is stricter than classic, which lets a custom method change signature with no compatibility check and break every call site.

Type-identical override is what makes delegation composable: two independent overrides of the same member stack, which a spread can never do. Adding capability is a _new member_ on an extended service, not a reshaped old one.

A custom fragment still has to widen the cart payload type. `Context` keys cannot be generic, so the widening goes through an augmentable registry interface written by codegen — the idiom already used for `ApiVersionRegistry` ([ADR-0005](./0005-the-api-version-type-is-open-and-narrowed-by-codegen.md)) and `StorefrontQueries`. Signatures stay pinned _relative to the registry_.

## Why cross-cutting behaviour is a decorator above overrides

Classic encodes auto-create-on-write inside each write method, and that is precisely the source of its known leak: the handler keeps `let cartId` in a closure updated only by its own `cartCreate`, so an overriding `addLines` silently loses the auto-create fallback.

Composing the final stack as `autoCreate(consumerOverrides(defaultOperations))` means an override inherits the behaviour **whether or not it delegates**. Solidifront controls that ordering through the generated layer merge of [ADR-0004](./0004-generated-modules-export-a-layer-not-a-runtime.md). The escape hatch is that the decorator is itself a replaceable layer, so opting out is explicit rather than accidental.

This answers the ticket's framing question — "how does an override call through to the default?" — twice: for member-specific behaviour it delegates explicitly, and for cross-cutting behaviour it does not have to.

## Why members are named for the mutations they send

`CONTEXT.md` defines an **operation** as "a single GraphQL query or mutation." A member _is_ an operation, so it carries the operation's name: `cartLinesAdd`, not classic's `addLines`.

Classic's rename invents a second vocabulary for the same thing, which at 18 operations is 18 arbitrary mappings to memorize, and it makes the override story opaque — the thing you override should be named after the thing it sends.

The rule has a consequence worth stating: an operation that does not exist in the Storefront API cannot be a member. Preview synthesizes `discount-apply` / `discount-remove` on top of `cartDiscountCodesUpdate` (which replaces all codes) by reading first, and documents the race that follows — "SFAPI has no atomic discount modify endpoint, so concurrent requests can overwrite each other's discount codes." Those ship instead as conveniences on `createCart()`, where the client already holds the current code list and the read-then-write disappears entirely.

## Why user errors are a success value

Every cart mutation returns `{cart, userErrors, warnings}` — the cart **and** the errors together, a partial success. Routing `userErrors` to the Effect error channel would discard the cart that came back with them, and per-line error rendering needs both.

So a member returns the decoded payload, and the error channel carries transport failures, GraphQL errors, decode failures, and a missing cart id. A rejected line is a domain outcome, not an operation failure — and it never reaches an `ErrorBoundary`, which is right: a bad discount code should not blow away the cart UI.

## Why write failures are recorded rather than raised

At the Solid boundary, a failed write is not raised at all. `action()` rejects the promise it returns and does not propagate into the reactive graph, so no boundary ever sees it and the optimistic overlay reverts on its own.

`createCart()` therefore **swallows the rejection and records it** in the store's error bucket, alongside `userErrors`. The alternative — letting the promise reject — would give two different mechanisms for "the write didn't work", which is exactly the split Solid 2 removed when it deleted `resource.error` ("error handling was split between two mechanisms that didn't compose").

The cost is that a consumer who renders nothing from the error bucket sees failures silently, so recording a write error that is never read is a dev-mode warning.

## Why writes serialize per target instead of cancelling

Preview gives each key an `AbortController` so a later write cancels an earlier one. But aborting a fetch does not un-land a mutation the Storefront API already processed, and `cartLinesUpdate` sets quantity **absolutely**: fire "set 3" then "set 5", have them arrive out of order, and the cart ends at 3.

Writes to the same target queue behind a keyed mutex instead. The optimistic overlay already shows the final value instantly, so serialization costs nothing visible while removing a class of wrong-final-quantity bugs the reference implementation has. Cancellation is kept for the stale-_read_ case, matching the wrapper in [#20](https://github.com/KookiKodes/solidifront/issues/20).

## Scope: eighteen of twenty-four

The pinned schema exposes 24 cart mutations. **Eighteen ship**, and the six that do not are ruled out by two different rules.

**Checkout is not in it.** `cartPrepareForCompletion`, `cartSubmitForCompletion`, `cartPaymentUpdate` and `cartBillingAddressUpdate` are the Cart Checkout Completion API, a separately gated Shopify product. `CONTEXT.md` defines a **cart** as ending where checkout begins, so shipping them would silently redefine the library's boundary.

**Undocumented is not in it either.** `cartClone` and `cartRemovePersonalData` are `isPrivatelyDocumented: true` — served by the API, but with no reference page, no `full-index` entry, and no presence in Shopify's published schema tarball at any supported version. This ADR originally counted twenty, having read the set off an introspection that does not surface the flag; [#48](https://github.com/KookiKodes/solidifront/issues/48) surfaced it and [ADR-0016](./0016-solidifront-ships-only-what-shopify-documents.md) settles the rule, which is Storefront-wide rather than cart-specific. The capability is not lost: `cartBuyerIdentityUpdate`, `cartDeliveryAddressesRemove`, `cartAttributesUpdate` and `cartNoteUpdate` cover the cart's personal data between them, and `cartCreate` covers a clone. Amended in [#49](https://github.com/KookiKodes/solidifront/issues/49).
