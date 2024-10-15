export const shopQuery = `#graphql
    query ShopQuery {
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
