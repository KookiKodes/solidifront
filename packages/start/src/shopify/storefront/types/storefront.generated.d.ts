/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as StorefrontTypes from './storefront.types';

export type GetShopQueryVariables = StorefrontTypes.Exact<{
  language: StorefrontTypes.LanguageCode;
  country: StorefrontTypes.CountryCode;
}>;


export type GetShopQuery = { shop: Pick<StorefrontTypes.Shop, 'id' | 'name'> };

interface GeneratedQueryTypes {
  "#graphql\n  query GetShop($language: LanguageCode!, $country: CountryCode!) @inContext(language: $language, country: $country){\n    shop {\n      id\n      name\n    }\n  }\n": {return: GetShopQuery, variables: GetShopQueryVariables},
}

interface GeneratedMutationTypes {
}
declare module '@shopify/storefront-api-client' {
  type InputMaybe<T> = StorefrontTypes.InputMaybe<T>;
  interface StorefrontQueries extends GeneratedQueryTypes {}
  interface StorefrontMutations extends GeneratedMutationTypes {}
}
