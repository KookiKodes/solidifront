export const createCartMutation = `#graphql
  mutation createCart {
    cartCreate {
      cart {
        id 
      } 
    } 
  }
` as const;
