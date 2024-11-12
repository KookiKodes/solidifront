import { type Redacted } from "effect";

export const isServer = () => typeof window === "undefined";
export const hasPrivateAccessToken = (fields: {
  privateAccessToken?: Redacted.Redacted<string>;
}) => "privateAccessToken" in fields;
export const hasPublicAccessToken = (fields: { publicAccessToken?: string }) =>
  "publicAccessToken" in fields;
