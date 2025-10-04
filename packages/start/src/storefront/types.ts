import type {
	StorefrontMutations as _StorefrontMutations,
	StorefrontQueries as _StorefrontQueries,
	createStorefrontClient,
} from "@solidifront/storefront-client";

export interface StorefrontQueries extends _StorefrontQueries {}
export interface StorefrontMutations extends _StorefrontMutations {}

export type QueryVariables<Operation extends string> =
	createStorefrontClient.Variables<Operation, StorefrontQueries>;
export type MutationVariables<Operation extends string> =
	createStorefrontClient.Variables<Operation, StorefrontMutations>;
export type QueryReturnData<Operation extends string> =
	createStorefrontClient.ReturnData<Operation, StorefrontQueries>;
export type MutationReturnData<Operation extends string> =
	createStorefrontClient.ReturnData<Operation, StorefrontMutations>;
