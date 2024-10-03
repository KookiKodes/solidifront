export const shopQuery = `#graphql
    query ShopQuery {
      shop {
        id
        name
      }
    }
` as const;
