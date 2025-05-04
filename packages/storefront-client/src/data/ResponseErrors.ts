import type { GraphQLJsonBody } from "../schemas";

import * as Data from "effect/Data";

export interface IResponseErrors {
  networkStatusCode?: number;
  message?: string;
  graphQLErrors?: GraphQLJsonBody["errors"];
}

export class ResponseErrors extends Data.Class<IResponseErrors> {}

export const make = Data.case<ResponseErrors>();
