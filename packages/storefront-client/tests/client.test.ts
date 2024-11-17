import * as Runtime from "effect/Runtime";
import * as Cause from "effect/Cause";
import { describe, vi, it, expect } from "vitest";
import { createStorefrontClient } from "../src";
import { shopQuery } from "./operations";

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

describe("client operation options", () => {
  const client = createStorefrontClient({
    storeName: process.env.SHOPIFY_PUBLIC_STORE_NAME as string,
    privateAccessToken: process.env.SHOPIFY_PRIVATE_STOREFRONT_TOKEN as string,
  });

  it("should throw error if invalid version is provided", () =>
    client
      .query(shopQuery, {
        //@ts-ignore
        apiVersion: "",
      })
      .catch((failure) => {
        expect(Runtime.isFiberFailure(failure)).toBeTruthy();
        failure = JSON.parse(JSON.stringify(failure));
        expect(failure.cause._tag === "Fail").toBeTruthy();
        expect(failure.cause.failure._id === "ParseError").toBeTruthy();
      }));
  it("should throw error if wrong contentType is provided", () =>
    client
      .query(shopQuery, {
        //@ts-ignore
        contentType: "",
      })
      .catch((failure) => {
        expect(Runtime.isFiberFailure(failure)).toBeTruthy();
        failure = JSON.parse(JSON.stringify(failure));
        expect(failure.cause._tag === "Fail").toBeTruthy();
        expect(failure.cause.failure._id === "ParseError").toBeTruthy();
      }));

  it("should throw error if invalid privateAccessToken is provided", () =>
    client
      .query(shopQuery, {
        //@ts-ignore
        privateAccessToken: (
          process.env.SHOPIFY_PRIVATE_STOREFRONT_TOKEN as string
        ).replace("shpat_", ""),
      })
      .catch((failure) => {
        expect(Runtime.isFiberFailure(failure)).toBeTruthy();
        failure = JSON.parse(JSON.stringify(failure));
        expect(failure.cause._tag === "Fail").toBeTruthy();
        expect(failure.cause.failure._id === "ParseError").toBeTruthy();
      }));

  it("should throw error if privateAccessToken is provided on client side", async () => {
    vi.stubGlobal("window", {});
    return client
      .query(shopQuery, {
        //@ts-ignore
        privateAccessToken: process.env
          .SHOPIFY_PRIVATE_STOREFRONT_TOKEN as string,
      })
      .catch((failure) => {
        expect(Runtime.isFiberFailure(failure)).toBeTruthy();
        failure = JSON.parse(JSON.stringify(failure));
        expect(failure.cause._tag === "Fail").toBeTruthy();
        expect(failure.cause.failure._id === "ParseError").toBeTruthy();
      })
      .finally(() => vi.unstubAllGlobals());
  });
});
