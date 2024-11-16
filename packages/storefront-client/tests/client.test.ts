import { describe, vi, it, expect } from "vitest";
import * as Cause from "effect/Cause";
import * as Runtime from "effect/Runtime";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";

import * as TypedStorefrontClient from "../src/services/TypedStorefrontClient";
import { createStorefrontClient } from "../src";
import { HttpClient, HttpClientResponse } from "@effect/platform";

const shopQuery = `#graphql
  query ShopQuery {
    shop {
      name
    }
  }
`;

const shopQueryWithUnusedVariables = `#graphql
  query ShopQueryWithUnusedVariables($id: ID!) {
    shop {
      name
    }
  }
`;

const noNameShopQuery = `#graphql
  query {
    shop {
      name
    }
  }
`;

const cartCreateMutation = `#graphql
  mutation CartCreateMutation {
    cartCreate {
      cart {
        id
      } 
    }
  }
`;

const noNameMutation = `#graphql
  mutation {
    cartCreate {
      cart {
        id
      } 
    }
  }
`;

describe("client creation", () => {
  it("should create client successfully with private access token", () => {
    const client = createStorefrontClient({
      storeName: process.env.SHOPIFY_PUBLIC_STORE_NAME as string,
      privateAccessToken: process.env
        .SHOPIFY_PRIVATE_STOREFRONT_TOKEN as string,
    });
    expect(client).keys(["query", "mutate"]);
  });

  it("should throw error if private access token does not start with 'shpat_'", () => {
    expect(() =>
      createStorefrontClient({
        storeName: process.env.SHOPIFY_PUBLIC_STORE_NAME as string,
        privateAccessToken: (
          process.env.SHOPIFY_PRIVATE_STOREFRONT_TOKEN as string
        ).replace("shpat_", ""),
      }),
    ).toThrowError();
  });

  it("should create client successfully with public access token", () => {
    const client = createStorefrontClient({
      storeName: process.env.SHOPIFY_PUBLIC_STORE_NAME as string,
      publicAccessToken: process.env.SHOPIFY_PUBLIC_STOREFRONT_TOKEN as string,
    });
    expect(client).keys(["query", "mutate"]);
  });

  it("should throw schema when both tokens are provided", () => {
    expect(() =>
      createStorefrontClient({
        storeName: process.env.SHOPIFY_PUBLIC_STORE_NAME as string,
        publicAccessToken: process.env.SHOPIFY_PUBLIC_ACCESS_TOKEN as string,
        privateAccessToken: process.env
          .SHOPIFY_PRIVATE_STOREFRONT_TOKEN as string,
      }),
    ).toThrowError();
  });

  it("should throw error if private and public access tokens are not provided", () => {
    expect(() =>
      createStorefrontClient({
        storeName: process.env.SHOPIFY_PUBLIC_STORE_NAME as string,
      }),
    ).toThrowError();
  });

  it("should throw error if private access token is provided on client", () => {
    vi.stubGlobal("window", {});
    expect(() =>
      createStorefrontClient({
        storeName: process.env.SHOPIFY_PUBLIC_STORE_NAME as string,
        privateAccessToken: process.env
          .SHOPIFY_PRIVATE_STOREFRONT_TOKEN as string,
      }),
    ).toThrowError();
    vi.unstubAllGlobals();
  });
});

describe("queries", () => {
  const client = createStorefrontClient({
    storeName: process.env.SHOPIFY_PUBLIC_STORE_NAME as string,
    privateAccessToken: process.env.SHOPIFY_PRIVATE_STOREFRONT_TOKEN as string,
  });

  it("should fetch shop name", async () => {
    const result = await client.query(shopQuery);
    // @ts-ignore
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

describe("mutations", () => {
  const client = createStorefrontClient({
    storeName: process.env.SHOPIFY_PUBLIC_STORE_NAME as string,
    privateAccessToken: process.env.SHOPIFY_PRIVATE_STOREFRONT_TOKEN as string,
  });

  it("should create a new cart instance", async () => {
    const result = await client.mutate(cartCreateMutation);
    // @ts-ignore
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

describe("status code errors", () => {
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

  const testableStatusCodes = [400, 402, 403, 404, 423, 500];

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
