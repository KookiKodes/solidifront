/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as StorefrontAPI from '@solidifront/start/storefront-api-types';

export type CreateCartMutationVariables = StorefrontAPI.Exact<{ [key: string]: never; }>;


export type CreateCartMutation = { cartCreate?: StorefrontAPI.Maybe<{ cart?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Cart, 'id'>> }> };

export type ShopQueryQueryVariables = StorefrontAPI.Exact<{ [key: string]: never; }>;


export type ShopQueryQuery = { shop: Pick<StorefrontAPI.Shop, 'name' | 'id'> };

export type CartQueryVariables = StorefrontAPI.Exact<{
  id: StorefrontAPI.Scalars['ID']['input'];
}>;


export type CartQuery = { cart?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Cart, 'id'>> };

interface GeneratedQueryTypes {
  "#graphql\n    query ShopQuery {\n      shop {\n        name\n        id\n      }\n    }\n": {return: ShopQueryQuery, variables: ShopQueryQueryVariables},
  "#graphql\n  query cart($id: ID!) {\n    cart(id: $id) {\n      id \n    }\n  }\n": {return: CartQuery, variables: CartQueryVariables},
}

interface GeneratedMutationTypes {
  "#graphql\n  mutation createCart {\n    cartCreate {\n      cart {\n        id \n      } \n    } \n  }\n": {return: CreateCartMutation, variables: CreateCartMutationVariables},
}

declare module '@solidifront/start/storefront' {
  interface StorefrontQueries extends GeneratedQueryTypes {}
  interface StorefrontMutations extends GeneratedMutationTypes {}
}
