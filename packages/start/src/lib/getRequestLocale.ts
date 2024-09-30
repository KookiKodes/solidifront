import type { I18nLocale } from "../middleware";

import { getRequestEvent } from "solid-js/web";
export function getRequestLocale() {
  return getRequestEvent()?.locals!.locale as I18nLocale;
}
