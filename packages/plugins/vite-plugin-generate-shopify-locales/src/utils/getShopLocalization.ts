import type {
  CountryCode,
  CurrencyCode,
  LanguageCode,
  UnitSystem,
} from '@solidifront/codegen/storefront-api-types';

type Options = {
  shopDomain: string;
  apiVersion: string;
  accessToken: string;
};

const GetShopLocalization = `#graphql
    query GetShopLocalization {
      localization {
        availableCountries {
          isoCode
          name
          unitSystem
          availableLanguages {
            isoCode
            endonymName
            name
          }
          currency {
            isoCode
            name
            symbol
          }
          market {
            id
            handle
          }
        }
      }
    }
`;

export type ShopLocalizationResult = {
  availableCountries: Array<{
    isoCode: CountryCode;
    name: string;
    unitSystem: UnitSystem;
    availableLanguages: Array<{
      isoCode: LanguageCode;
      endonymName: string;
      name: string;
    }>;
    currency: {
      isoCode: CurrencyCode;
      name: string;
      symbol: string;
    };
    market: {
      id: string;
      handle: string;
    };
  }>;
};

export async function getShopLocalization({
  shopDomain,
  apiVersion,
  accessToken,
}: Options) {
  const res = await fetch(
    `https://${shopDomain}/api/${apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': accessToken,
        Accept: 'application/json',
      },
      body: JSON.stringify({ query: GetShopLocalization }),
    },
  );
  const jsonRes = (await res.json()) as any;
  if (jsonRes?.errors) throw jsonRes.errors;
  return jsonRes?.data?.localization as ShopLocalizationResult;
}
