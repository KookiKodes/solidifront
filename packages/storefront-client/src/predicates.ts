import type { Redacted } from "effect";
import { IS_MUTATION_RE, IS_QUERY_RE } from "./constants.js";

export const isServer = () => typeof window === "undefined";
export const hasPrivateAccessToken = (fields: {
	privateAccessToken?: Redacted.Redacted<string>;
}) => "privateAccessToken" in fields;
export const hasPublicAccessToken = (fields: { publicAccessToken?: string }) =>
	"publicAccessToken" in fields;
export const isQuery = <const Query extends string>(query: Query) =>
	IS_QUERY_RE.test(query);

export const isMutation = <const Mutation extends string>(mutation: Mutation) =>
	IS_MUTATION_RE.test(mutation);
