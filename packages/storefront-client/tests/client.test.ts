import { createStorefrontClient } from "../src";

import { describe, vi, it, expect, beforeAll } from "vitest";

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

  const shopQuery = `#graphql
    query ShopQuery {
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

  it("should fetch shop name", async () => {
    const result = await client.query(shopQuery);
    // @ts-ignore
    expect(result.data?.shop?.name).toBeTypeOf("string");
  });

  // it("should throw error if no query name is provided", async () => {
  //   expect().throw()
  // });
});
