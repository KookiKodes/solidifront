import * as Cause from "effect/Cause";
import * as Runtime from "effect/Runtime";
import { describe, expect, it } from "vitest";
import { createStorefrontClient } from "../src";
import { cartCreateMutation, noNameMutation, shopQuery } from "./operations";

describe("mutations", () => {
	const client = createStorefrontClient({
		storeName: process.env.SHOPIFY_PUBLIC_STORE_NAME as string,
		privateAccessToken: process.env.SHOPIFY_PRIVATE_STOREFRONT_TOKEN as string,
	});

	it("should create a new cart instance", async () => {
		const result = await client.mutate(cartCreateMutation);
		// @ts-expect-error
		expect(result.data?.cartCreate?.cart?.id).toBeTypeOf("string");
	});

	it("should throw error if no mutation name is provided", async () =>
		client.mutate(noNameMutation).catch((failure) => {
			expect(Runtime.isFiberFailure(failure)).toBeTruthy();
			failure = JSON.parse(JSON.stringify(failure));
			expect(failure.cause._tag === "Fail").toBeTruthy();
			expect(
				failure.cause.failure._tag === "ExtractOperationNameError",
			).toBeTruthy();
		}));

	it("should throw error if query is provided", async () =>
		client.query(shopQuery).catch((failure) => {
			expect(Runtime.isFiberFailure(failure)).toBeTruthy();
			failure = JSON.parse(JSON.stringify(failure));
			expect(Cause.isDie(failure?.cause)).toBeTruthy();
			expect(
				failure?.cause?.defect?._tag === "AssertMutationError",
			).toBeTruthy();
		}));
});
