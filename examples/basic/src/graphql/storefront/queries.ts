export const shopQuery = `#graphql
  query ShopQuery {
    shop {
      name
      description
      shipsToCountries
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
