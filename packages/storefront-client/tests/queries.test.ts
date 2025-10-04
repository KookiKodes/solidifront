import * as Cause from "effect/Cause";
import * as Runtime from "effect/Runtime";
import { describe, expect, it } from "vitest";

import { createStorefrontClient } from "../src";
import {
	cartCreateMutation,
	noNameShopQuery,
	shopQuery,
	shopQueryWithUnusedVariables,
} from "./operations";

describe("queries", () => {
	const client = createStorefrontClient({
		storeName: process.env.SHOPIFY_PUBLIC_STORE_NAME as string,
		privateAccessToken: process.env.SHOPIFY_PRIVATE_STOREFRONT_TOKEN as string,
	});

	it("should fetch shop name", async () => {
		const result = await client.query(shopQuery);
		// @ts-expect-error
		expect(result.data?.shop?.name).toBeTypeOf("string");
	});

	it("should throw error if no query name is provided", async () =>
		client.query(noNameShopQuery).catch((failure) => {
			expect(Runtime.isFiberFailure(failure)).toBeTruthy();
			failure = JSON.parse(JSON.stringify(failure));
			expect(failure.cause._tag === "Fail").toBeTruthy();
			expect(
				failure.cause.failure._tag === "ExtractOperationNameError",
			).toBeTruthy();
		}));

	it("should throw error if mutation is provided", async () =>
		client.query(cartCreateMutation).catch((failure) => {
			expect(Runtime.isFiberFailure(failure)).toBeTruthy();
			failure = JSON.parse(JSON.stringify(failure));
			expect(Cause.isDie(failure?.cause)).toBeTruthy();
			expect(failure?.cause?.defect?._tag === "AssertQueryError").toBeTruthy();
		}));

	it("should return Response with errors object", async () =>
		client.query(shopQueryWithUnusedVariables).then((res) => {
			expect(res.errors?.graphQLErrors).toHaveLength(1);
		}));
});
