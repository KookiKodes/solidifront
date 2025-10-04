import * as Data from "effect/Data";
import type { GraphQLJsonBody } from "../schemas";

export interface IResponseErrors {
	networkStatusCode?: number;
	message?: string;
	graphQLErrors?: GraphQLJsonBody["errors"];
}

export class ResponseErrors extends Data.Class<IResponseErrors> {}

export const make = Data.case<ResponseErrors>();
