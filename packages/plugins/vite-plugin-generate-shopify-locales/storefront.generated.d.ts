/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as StorefrontTypes from './storefront.types';

export type GetShopLocalizationQueryVariables = StorefrontTypes.Exact<{ [key: string]: never; }>;


export type GetShopLocalizationQuery = { localization: { availableCountries: Array<(
      Pick<StorefrontTypes.Country, 'isoCode' | 'name' | 'unitSystem'>
      & { availableLanguages: Array<Pick<StorefrontTypes.Language, 'isoCode' | 'endonymName' | 'name'>>, currency: Pick<StorefrontTypes.Currency, 'isoCode' | 'name' | 'symbol'> }
    )> } };

interface GeneratedQueryTypes {
  "#graphql\n  query GetShopLocalization {\n    localization {\n      availableCountries {\n        isoCode\n        name\n        unitSystem\n        availableLanguages {\n          isoCode\n          endonymName\n          name\n        }\n        currency {\n          isoCode\n          name\n          symbol\n        }\n      }\n    }\n  }\n": {return: GetShopLocalizationQuery, variables: GetShopLocalizationQueryVariables},
}

interface GeneratedMutationTypes {
}
declare module '@solidifront/storefront-client' {
  type InputMaybe<T> = StorefrontTypes.InputMaybe<T>;
  interface StorefrontQueries extends GeneratedQueryTypes {}
  interface StorefrontMutations extends GeneratedMutationTypes {}
}
