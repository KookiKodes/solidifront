import { createStorefrontClient } from "@solidifront/storefront-client";

type Options = {
	storeName: string;
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
        }
      }
    }
` as const;

export async function getShopLocalization({
	storeName,
	apiVersion,
	accessToken,
}: Options) {
	const client = createStorefrontClient({
		storeName,
		apiVersion: apiVersion as any,
		publicAccessToken: accessToken,
	});
	const response = await client.query(GetShopLocalization);
	console.log(response.errors?.graphQLErrors);
	return response.data!.localization!;
}
