import * as Data from "effect/Data";
import type { IFetchBodyResponse } from "./FetchBodyResponse";
import type { IResponseErrors } from "./ResponseErrors";

export interface IClientResponse<TData = any>
	extends IFetchBodyResponse<TData> {
	errors?: IResponseErrors;
}

export class ClientResponse<TData = any> extends Data.Class<
	IClientResponse<TData>
> {}

export const make = <TData = any>(
	data: Parameters<ReturnType<typeof Data.case<ClientResponse<TData>>>>[0],
) => Data.case<ClientResponse<TData>>()(data);
