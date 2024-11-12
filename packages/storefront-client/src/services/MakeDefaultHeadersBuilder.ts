import type { HttpClientRequest } from "@effect/platform";
import type { ContentType, ValidVersion } from "../schemas.js";

import * as Effect from "effect/Effect";

export type MakeDefaultHeadersBuilderOptions = {
  contentType?: ContentType;
  apiVersion?: ValidVersion;
};

export class MakeDefaultHeadersBuilder extends Effect.Service<MakeDefaultHeadersBuilder>()(
  "@solidifront/storefront-client/MakeDefaultHeadersBuilder",
  {
    effect: Effect.gen(function* () {
      const make = ({
        contentType,
        apiVersion,
      }: MakeDefaultHeadersBuilderOptions) => ({
        "Content-Type":
          contentType === "graphql"
            ? "application/graphql"
            : "application/json",
        "X-SDK-Variant": "solidifront",
        "X-SDK-Variant-Source": "solid",
        "X-SDK-Version": apiVersion,
      });
      return {
        make,
        makeFallback: (
          request: HttpClientRequest.HttpClientRequest,
          options: MakeDefaultHeadersBuilderOptions
        ) =>
          make({
            contentType:
              (request.headers["content-type"] as ContentType) ??
              options.contentType,
            apiVersion:
              (request.headers["x-sdk-version"] as ValidVersion) ??
              options.apiVersion,
          }),
      };
    }),
  }
) {}
