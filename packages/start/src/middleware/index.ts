import { createSolidifrontMiddleware } from "@solidifront/start/middleware:internal";
import {
	createMiddleware as createSolidMiddleware,
	type RequestMiddleware,
	type ResponseMiddleware,
} from "@solidjs/start/middleware";
import {
	createLocaleMiddleware,
	type I18nLocale,
} from "./createLocaleMiddleware.js";
import { createStorefrontMiddleware } from "./createStorefrontMiddleware.js";

export { type I18nLocale, createLocaleMiddleware, createStorefrontMiddleware };

export function createMiddleware({
	onRequest,
	onBeforeResponse,
}: {
	onRequest?: RequestMiddleware[] | RequestMiddleware | undefined;
	onBeforeResponse?: ResponseMiddleware[] | ResponseMiddleware | undefined;
} = {}): ReturnType<typeof createSolidMiddleware> {
	const requestHandlers = onRequest
			? Array.isArray(onRequest)
				? [...onRequest]
				: [onRequest]
			: [],
		responseHandlers = onBeforeResponse
			? Array.isArray(onBeforeResponse)
				? [...onBeforeResponse]
				: [onBeforeResponse]
			: [];

	return createSolidMiddleware({
		onRequest: [...createSolidifrontMiddleware(), ...requestHandlers],
		onBeforeResponse: [...responseHandlers],
	});
}
