declare module "@solidifront/start/middleware:internal" {
  import type { RequestMiddleware } from "@solidjs/start/middleware";

  export function createSolidifrontMiddleware(): RequestMiddleware[];
}
