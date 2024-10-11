import { redirect } from "@solidjs/router";
import { getRequestLocale } from "./getRequestLocale.js";

export function notFound(notFoundRoute = "/notFound", statusText?: string) {
  const locale = getRequestLocale();
  if (!locale) throw new Error("App locale not enabled in app config!");
  return redirect(`${locale.pathPrefix}${notFoundRoute}`, {
    status: 404,
    statusText,
  });
}
