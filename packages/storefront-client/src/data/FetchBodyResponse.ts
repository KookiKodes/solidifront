import * as Data from "effect/Data";

export interface IFetchBodyResponse<TData = any> {
	data?: TData;
	extensions?: Record<string, any>;
}

export class FetchBodyResponse<TData = any> extends Data.TaggedClass(
	"@solidifront/storefront-client/FetchBodyResponse",
)<IFetchBodyResponse<TData>> {}
