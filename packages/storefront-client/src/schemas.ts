import * as Redacted from "effect/Redacted";
import * as S from "effect/Schema";
import {
  hasPrivateAccessToken,
  hasPublicAccessToken,
  isServer,
} from "./predicates.js";

export interface CodegenOperations {
  [key: string]: any;
}

export interface StorefrontQueries {}

export interface StorefrontMutations {}

export type TokenFields = S.Schema.Encoded<typeof TokenFields>;

export type ClientOptions = typeof ClientOptions;

export type ValidVersion = S.Schema.Type<typeof ValidVersion>;

export type LatestVersion = S.Schema.Type<typeof LatestVersion>;

export type ContentType = S.Schema.Type<typeof ContentType>;

export type GraphQLJsonBody = S.Schema.Type<typeof GraphQLJsonBody>;

type RequestOptionsWithoutVariables = Omit<
  S.Schema.Encoded<typeof RequestOptions>,
  "variables"
>;

export type RequestOptions<TVariables = any> = TVariables extends
  | {
      [x: string]: never;
    }
  | undefined
  | unknown
  ? RequestOptionsWithoutVariables
  : Omit<S.Schema.Encoded<typeof RequestOptions>, "variables"> & {
      variables: TVariables;
    };

export const ValidVersion = S.Literal(
  "2024-01",
  "2024-04",
  "2024-07",
  "2024-10",
  "2025-01",
  "unstable",
).annotations({
  identifier: "ValidVersion",
  title: "Valid Version",
  description: "Valid version for the Storefront client",
  examples: ["2024-01", "2024-04", "2024-07", "2024-10", "unstable"],
});

export const LatestVersion = ValidVersion.pipe(
  S.pickLiteral("2024-10"),
).annotations({
  identifier: "LatestVersion",
  title: "Latest Version",
  description: "Latest version for the Storefront client",
  examples: ["2024-10"],
});

export const ContentType = S.Literal("json", "graphql").annotations({
  identifier: "ContentType",
  title: "Content Type",
  description: "Content type for the Storefront client",
  examples: ["json", "graphql"],
});

const BaseClientOptions = S.Struct({
  apiVersion: S.optionalWith(ValidVersion, {
    default: () => LatestVersion.literals[0],
  }),
  storeName: S.NonEmptyString,
  retries: S.optionalWith(S.Int, { default: () => 2 }),
  contentType: S.optionalWith(ContentType, { default: () => "json" }),
}).annotations({
  identifier: "BaseClientOptions",
  title: "Base Client Options",
  description: "Base client options for the Storefront client",
  examples: [
    {
      apiVersion: "2024-10",
      retries: 1,
      storeName: "solidifront",
      contentType: "json",
    },
  ],
});

const PrivateToken = S.Redacted(
  S.NonEmptyString.pipe(
    S.startsWith("shpat_", {
      message: () =>
        "Invalid private access token format, expected format: shpat_************",
    }),
    S.filter(
      () =>
        isServer() ||
        "private access tokens and headers should only be used in a server-to-server implementation. Use the public API access token in nonserver environments.",
    ),
  ),
).annotations({
  identifier: "PrivateToken",
  title: "Private Token",
  description: "Private API access token for the Storefront client",
  examples: [Redacted.make("shpat_****************************")],
  redacted: Redacted.make("shpat_****************************"),
  sensitive: true,
});

const PublicToken = S.NonEmptyString.annotations({
  identifier: "PublicToken",
  title: "Public Token",
  description: "Public API access token for the Storefront client",
  examples: ["****************************"],
});

const TokenFields = S.Struct({
  privateAccessToken: S.optional(PrivateToken),
  publicAccessToken: S.optional(PublicToken),
}).pipe(
  S.filter((fields) => {
    if (hasPublicAccessToken(fields) && hasPrivateAccessToken(fields))
      return "only provide either a public or private access token";
    if (!hasPublicAccessToken(fields) && !hasPrivateAccessToken(fields))
      return "a public or private access token must be provided";
    return true;
  }),
  S.annotations({
    identifier: "TokenFields",
    title: "Token Fields",
    description: "Token fields for the Storefront API",
    examples: [
      {
        privateAccessToken: Redacted.make(
          "shpat_********************************",
        ),
      },
      {
        publicAccessToken: "********************************",
      },
    ],
  }),
);

export const ClientOptions = S.asSchema(
  S.extend(BaseClientOptions, TokenFields),
).annotations({
  identifier: "ClientOptions",
  title: "Client Options",
  description: "Options for initializing the a Storefront client",
  examples: [
    {
      apiVersion: "2024-10",
      storeName: "solidifront",
      retries: 2,
      publicAccessToken: "********************************",
      contentType: "json",
    },
    {
      apiVersion: "2024-10",
      storeName: "solidifront",
      retries: 2,
      privateAccessToken: Redacted.make(
        "shpat_********************************",
      ),
      contentType: "graphql",
    },
  ],
  parseOptions: {
    onExcessProperty: "error",
  },
});

export const GraphQLJsonBody = S.Struct({
  data: S.optional(S.Unknown),
  extensions: S.optional(
    S.Record({
      key: S.String,
      value: S.Any,
    }),
  ),
  errors: S.optional(
    S.Array(
      S.Struct({
        message: S.NonEmptyString,
        locations: S.optional(
          S.Array(S.Struct({ line: S.Int, column: S.Int })),
        ),
        extensions: S.optional(
          S.Struct({
            code: S.NonEmptyString,
          }),
        ),
      }),
    ),
  ),
}).annotations({
  identifier: "GraphQLJsonBody",
  title: "GraphQL JSON Body",
  description: "The GraphQL JSON body for the Storefront API",
  examples: [
    {
      errors: [
        {
          message: "Throttled",
          extensions: {
            code: "THROTTLED",
          },
        },
      ],
      extensions: {},
    },
    {
      data: {
        shop: {
          name: "Solidifront",
        },
      },
      extensions: {},
    },
  ],
});

export const RequestOptions = S.partial(
  S.Struct({
    apiVersion: ValidVersion,
    storeName: S.NonEmptyString,
    contentType: ContentType,
    buyerIp: S.NonEmptyString,
    variables: S.Record({
      key: S.String,
      value: S.Any,
    }),
    privateAccessToken: PrivateToken,
    publicAccessToken: S.NonEmptyString,
  }),
).annotations({
  identifier: "RequestOptions",
  title: "Request Options",
  description: "Options for making requests to the Storefront API",
  examples: [
    {
      apiVersion: "2024-01",
    },
    {
      storeName: "my-store",
    },
    {
      variables: {
        productID: "12345",
      },
      publicAccessToken: "********************************",
    },
    {
      storeName: "my-store",
      variables: {
        productID: "12345",
      },
      buyerIp: "127.0.0.1",
      privateAccessToken: Redacted.make(
        "shpat_********************************",
      ),
    },
  ],
  parseOptions: {
    onExcessProperty: "error",
  },
});
