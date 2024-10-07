import { StorefrontClientConfig } from "./types";
import { createStorefrontApiClient } from "@shopify/storefront-api-client";
import isomorphicFetch from "isomorphic-fetch";
import { isServer } from "solid-js/web";

// import { getHeaders, createStorefrontUrl } from "./utils.js";

interface CodegenOperations {
  [key: string]: any;
}

export interface StorefrontQueries {
  // [key: string]: { return: any; variables: any };
}

export interface StorefrontMutations {
  // [key: string]: { return: any; variables: any };
}

export namespace createStorefrontClient {
  export type Config = StorefrontClientConfig;
}

type OperationReturn<
  GeneratedOperations extends CodegenOperations,
  RawGqlString extends string,
> = RawGqlString extends keyof GeneratedOperations
  ? // Known query, use generated return type
    GeneratedOperations[RawGqlString]["return"]
  : // Unknown query, return 'any' to avoid red squiggly underlines in editor
    any;
type OperationVariables<
  GeneratedOperations extends CodegenOperations,
  RawGqlString extends string,
> = RawGqlString extends keyof GeneratedOperations
  ? Omit<GeneratedOperations[RawGqlString]["variables"], "country" | "language">
  : any;

export function createStorefrontClient(options: createStorefrontClient.Config) {
  // if (!options.apiVersion) options.apiVersion = "10-2024";
  const client = createStorefrontApiClient({
    storeDomain: `https://${options.storeDomain}`,
    apiVersion: options.apiVersion || "10-2024",
    privateAccessToken: isServer ? options.privateAccessToken : undefined,
    publicAccessToken: !isServer ? options.publicAccessToken : undefined,
    customFetchApi: isomorphicFetch,
    clientName: "Solidifront Storefront Client",
    retries: 1,
  });

  return {
    async query<RawGqlString extends string>(
      query: RawGqlString,
      options?: {
        variables: OperationVariables<StorefrontQueries, RawGqlString>;
      }
    ) {
      return client.request<OperationReturn<StorefrontQueries, RawGqlString>>(
        query,
        {
          variables: options?.variables,
        }
      );
    },
    async mutation<RawGqlString extends string>(
      mutation: RawGqlString,
      options?: {
        variables: OperationVariables<StorefrontMutations, RawGqlString>;
      }
    ) {
      return client.request<OperationReturn<StorefrontMutations, RawGqlString>>(
        mutation,
        {
          variables: options?.variables,
        }
      );
    },
  };
}
