export const shopQuery = `#graphql
    query ShopQuery {
      shop {
        id
        name
        description
      }
    }
` as const;
