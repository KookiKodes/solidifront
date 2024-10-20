import { createMutationAction } from "@solidifront/start/storefront";

export const createCartMutation = `#graphql
  mutation createCart {
    cartCreate {
      cart {
        id 
      } 
    } 
  }
` as const;

export const createCartAction = createMutationAction(createCartMutation);
