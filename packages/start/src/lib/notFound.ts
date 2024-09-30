import { redirect } from "@solidjs/router";
import { getRequestLocale } from "./getRequestLocale";

export function notFound(notFoundRoute = "/notFound", statusText?: string) {
  const locale = getRequestLocale();
  return redirect(`${locale.pathPrefix}${notFoundRoute}`, {
    status: 404,
    statusText,
  });
}
