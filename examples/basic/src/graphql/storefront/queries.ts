export const shopQuery = `#graphql
    query ShopQuery($country: CountryCode, $language: LanguageCode) @inContext(country: $country, language: $language) {
      shop {
        name
        id
      }
    }
` as const;

export const cartQuery = `#graphql
  query cart($id: ID!) {
    cart(id: $id) {
      id 
    }
  }
` as const;
