import { assert, describe, it, layer } from "@effect/vitest";
import { Context, Effect, Layer } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";

/**
 * Proves the test harness itself, not any library code.
 *
 * The v1 testing strategy rests on a couple of claims that are cheap to state
 * and easy to silently lose in a dependency bump. If this file goes red, the
 * foundation moved and the strategy needs re-deciding — see wayfinder #11.
 */

describe("harness: @effect/vitest is wired", () => {
	it.effect("runs an Effect and asserts on its success value", () =>
		Effect.gen(function* () {
			const n = yield* Effect.map(Effect.succeed(41), (x: number) => x + 1);
			assert.strictEqual(n, 42);
		}),
	);

	it.effect("surfaces a typed failure as a Failure result, not a throw", () =>
		Effect.gen(function* () {
			const result = yield* Effect.result(Effect.fail("boom" as const));
			assert.strictEqual(result._tag, "Failure");
		}),
	);
});

/**
 * `layer()` shares one built Layer across a whole `describe` — the shape a
 * stubbed-transport suite wants: build the storefront stack once, then run many
 * operations against it.
 */
class Greeter extends Context.Service<Greeter, { readonly greet: () => string }>()(
	"test/Greeter",
) {
	static readonly layer = Layer.succeed(Greeter)({ greet: () => "hello" });
}

layer(Greeter.layer)("harness: layer() shares a Layer across a describe", (it) => {
	it.effect("resolves the service", () =>
		Effect.gen(function* () {
			const greeter = yield* Greeter;
			assert.strictEqual(greeter.greet(), "hello");
		}),
	);

	it.effect("resolves the same shared instance again", () =>
		Effect.gen(function* () {
			const greeter = yield* Greeter;
			assert.strictEqual(greeter.greet(), "hello");
		}),
	);
});

/**
 * The transport seam — wayfinder #11's fourth bullet, verified against
 * effect@4.0.0-rc.109 source: `FetchHttpClient.Fetch` is a `Context.Reference`
 * defaulting to `globalThis.fetch`, and `HttpClient.make` reads it *per request*
 * via `fiber.getRef(Fetch)`. That per-request read is what makes a call-site
 * `Effect.provideService` a complete test double with no mocking library.
 *
 * If this breaks, every unit-layer (L1) test in the strategy loses its seam.
 */
describe("harness: the transport seam", () => {
	const body = { data: { shop: { name: "Stub Shop" } } };

	it.effect("a call-site provideService overrides the fetch implementation", () => {
		const seen: Array<string> = [];
		const stub = (async (input: RequestInfo | URL) => {
			seen.push(String(input instanceof Request ? input.url : input));
			return new Response(JSON.stringify(body), {
				headers: {
					"content-type": "application/json",
					"x-request-id": "harness-req-id",
				},
			});
		}) as typeof globalThis.fetch;

		return Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient;
			const response = yield* client.get("https://example.invalid/api/graphql.json");
			const json = yield* response.json;

			assert.deepStrictEqual(json, body);
			assert.strictEqual(seen.length, 1);
			assert.strictEqual(seen[0], "https://example.invalid/api/graphql.json");
			assert.strictEqual(response.headers["x-request-id"], "harness-req-id");
		}).pipe(
			Effect.provide(FetchHttpClient.layer),
			Effect.provideService(FetchHttpClient.Fetch, stub),
		);
	});
});
