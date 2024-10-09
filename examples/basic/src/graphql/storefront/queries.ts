export const shopQuery = `#graphql
    query ShopQuery {
      shop {
        name
        id
      }
    }
` as const;
