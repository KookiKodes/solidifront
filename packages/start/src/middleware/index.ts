import {
  type RequestMiddleware,
  type ResponseMiddleware,
  createMiddleware as createSolidMiddleware,
} from "@solidjs/start/middleware";

import {
  createLocaleMiddleware,
  type I18nLocale,
} from "./createLocaleMiddleware";

import { createSolidifrontMiddleware } from "@solidifront/start/middleware:internal";

export { type I18nLocale, createLocaleMiddleware };

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
