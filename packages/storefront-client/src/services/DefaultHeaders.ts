import type { HttpClientRequest } from "@effect/platform";
import type { ContentType, ValidVersion } from "../schemas.js";

export type Options = {
  contentType?: ContentType;
  apiVersion?: ValidVersion;
};

export const make = ({ contentType, apiVersion }: Options) => ({
  "Content-Type":
    contentType === "graphql" ? "application/graphql" : "application/json",
  "X-SDK-Variant": "solidifront",
  "X-SDK-Variant-Source": "solid",
  "X-SDK-Version": apiVersion,
});

export const makeFallback = (
  request: HttpClientRequest.HttpClientRequest,
  options: Options,
) =>
  make({
    contentType:
      (request.headers["content-type"] as ContentType) ?? options.contentType,
    apiVersion:
      (request.headers["x-sdk-version"] as ValidVersion) ?? options.apiVersion,
  });
