import type { StorefrontClientConfig } from "./types";
import type { I18nLocale } from "../../middleware";
import { isServer } from "solid-js/web";

function getPrivateTokenHeaders({
  apiVersion,
  privateAccessToken,
}: Omit<StorefrontClientConfig, "publicAccessToken" | "storeDomain">) {
  return {
    "X-SDK-Variant": "solidifront-start",
    "X-SDK-Variant-Source": "start",
    "X-SDK-Version": apiVersion!,
    "Shopify-Storefront-Private-Token": privateAccessToken!,
  };
}

function getPublicTokenHeaders({
  apiVersion,
  publicAccessToken,
}: NonNullable<
  Omit<StorefrontClientConfig, "privateAccessToken" | "storeDomain">
>) {
  return {
    "X-SDK-Variant": "solidifront-start",
    "X-SDK-Variant-Source": "start",
    "X-SDK-Version": apiVersion!,
    "X-Shopify-Storefront-Access-Token": publicAccessToken!,
  };
}

export function getHeaders({
  privateAccessToken,
  apiVersion,
  publicAccessToken,
}: Omit<StorefrontClientConfig, "storeDomain">) {
  if (!apiVersion) apiVersion = "10-2024";
  if (isServer) {
    if (!privateAccessToken) throw new Error("Missing privateAccessToken");
    return getPrivateTokenHeaders({ apiVersion, privateAccessToken });
  }
  if (!publicAccessToken) throw new Error("Missing publicAccessToken");
  return getPublicTokenHeaders({ apiVersion, publicAccessToken });
}

export function createStorefrontUrl({
  storeDomain,
  apiVersion,
}: Omit<StorefrontClientConfig, "publicAccessToken" | "privateAccessToken">) {
  return `https://${storeDomain}/api/${apiVersion}/graphql.json`;
}

const IS_QUERY_RE = /(^|}\s)query[\s({]/im;
const IS_MUTATION_RE = /(^|}\s)mutation[\s({]/im;

export function assertQuery(query: string, callerName: string) {
  if (!IS_QUERY_RE.test(query)) {
    throw new Error(`[h2:error:${callerName}] Can only execute queries`);
  }
}

export function assertMutation(query: string, callerName: string) {
  if (!IS_MUTATION_RE.test(query)) {
    throw new Error(`[h2:error:${callerName}] Can only execute mutations`);
  }
}

export function withCountryCode<Variables extends Record<string, any>>(
  operation: string,
  variables: Variables,
  locale: I18nLocale
) {
  if (!variables.country && /\$country/.test(operation)) {
    return {
      ...variables,
      country: locale.country,
    };
  }

  return variables;
}

export function withLanguageCode<Variables extends Record<string, any>>(
  operation: string,
  variables: Variables,
  locale: I18nLocale
) {
  if (!variables.language && /\$language/.test(operation)) {
    return {
      ...variables,
      language: locale.language,
    };
  }

  return variables;
}

export function minifyQuery<T extends string>(string: T) {
  return string
    .replace(/\s*#.*$/gm, "") // Remove GQL comments
    .replace(/\s+/gm, " ") // Minify spaces
    .trim() as T;
}

export function withLocaleVariables<V extends Record<string, any>>(
  operation: string,
  variables: V,
  locale: I18nLocale
) {
  return {
    ...variables,
    ...withCountryCode(operation, variables, locale),
    ...withLanguageCode(operation, variables, locale),
  };
}
