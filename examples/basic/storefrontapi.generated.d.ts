/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as StorefrontAPI from '@solidifront/codegen/storefront-api-types';

export type ShopQueryQueryVariables = StorefrontAPI.Exact<{ [key: string]: never; }>;


export type ShopQueryQuery = { shop: Pick<StorefrontAPI.Shop, 'name'> };

interface GeneratedQueryTypes {
  "#graphql\n    query ShopQuery {\n      shop {\n        name\n      }\n    }\n": {return: ShopQueryQuery, variables: ShopQueryQueryVariables},
}

interface GeneratedMutationTypes {
}

declare module '@solidifront/start' {
  interface StorefrontQueries extends GeneratedQueryTypes {}
  interface StorefrontMutations extends GeneratedMutationTypes {}
}
