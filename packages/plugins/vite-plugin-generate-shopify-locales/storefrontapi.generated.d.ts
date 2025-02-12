/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as StorefrontAPI from '@solidifront/codegen/storefront-api-types';

export type GetShopLocalizationQueryVariables = StorefrontAPI.Exact<{ [key: string]: never; }>;


export type GetShopLocalizationQuery = { localization: { availableCountries: Array<(
      Pick<StorefrontAPI.Country, 'isoCode' | 'name' | 'unitSystem'>
      & { availableLanguages: Array<Pick<StorefrontAPI.Language, 'isoCode' | 'endonymName' | 'name'>>, currency: Pick<StorefrontAPI.Currency, 'isoCode' | 'name' | 'symbol'>, market?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Market, 'id' | 'handle'>> }
    )> } };

interface GeneratedQueryTypes {
  "#graphql\n    query GetShopLocalization {\n      localization {\n        availableCountries {\n          isoCode\n          name\n          unitSystem\n          availableLanguages {\n            isoCode\n            endonymName\n            name\n          }\n          currency {\n            isoCode\n            name\n            symbol\n          }\n          market {\n            id\n            handle\n          }\n        }\n      }\n    }\n": {return: GetShopLocalizationQuery, variables: GetShopLocalizationQueryVariables},
}

interface GeneratedMutationTypes {
}

declare module '@solidifront/storefront-client' {
  interface StorefrontQueries extends GeneratedQueryTypes {}
  interface StorefrontMutations extends GeneratedMutationTypes {}
}
