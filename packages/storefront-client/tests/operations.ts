export const shopQuery = `#graphql
  query ShopQuery {
    shop {
      name
    }
  }
` as const;

export const shopQueryWithUnusedVariables = `#graphql
  query ShopQueryWithUnusedVariables($id: ID!) {
    shop {
      name
    }
  }
` as const;

export const noNameShopQuery = `#graphql
  query {
    shop {
      name
    }
  }
` as const;

export const cartCreateMutation = `#graphql
  mutation CartCreateMutation {
    cartCreate {
      cart {
        id
      } 
    }
  }
` as const;

export const noNameMutation = `#graphql
  mutation {
    cartCreate {
      cart {
        id
      } 
    }
  }
` as const;
