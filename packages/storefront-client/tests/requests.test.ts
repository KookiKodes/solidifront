import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";

import { describe, it, expect } from "vitest";

import * as TypedStorefrontClient from "../src/services/TypedStorefrontClient";
import { shopQuery } from "./operations";

const baseLayer = Layer.mergeAll(TypedStorefrontClient.Default);
const createMockStatusLayer = (statusCode: number) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((req) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          req,
          new Response(JSON.stringify({}), {
            status: statusCode,
          }),
        ),
      ),
    ),
  );

const testableStatusCodes = [400, 402, 403, 404, 423, 429, 500, 503];

describe("status code errors", () => {
  testableStatusCodes.forEach((statusCode) => {
    it(`should return response with ${statusCode} status code`, async () => {
      const layer = Layer.mergeAll(
        baseLayer,
        createMockStatusLayer(statusCode),
      );

      const runtime = ManagedRuntime.make(layer);

      const makeRequest = Effect.gen(function* () {
        const client = yield* TypedStorefrontClient.make({
          storeName: process.env.SHOPIFY_PUBLIC_STORE_NAME as string,
          privateAccessToken: process.env
            .SHOPIFY_PRIVATE_STOREFRONT_TOKEN as string,
        });

        return yield* client.query(shopQuery);
      });

      const response = await runtime.runPromise(makeRequest);

      expect(response.errors?.networkStatusCode).toBe(statusCode);
    });
  });
});
