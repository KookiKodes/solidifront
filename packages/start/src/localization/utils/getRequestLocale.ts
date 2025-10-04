import { getRequestEvent } from "solid-js/web";
import type { I18nLocale } from "../../middleware";

export function getRequestLocale() {
	const event = getRequestEvent();
	if (!event?.locals.locale) return null;
	return event?.locals!.locale as I18nLocale;
}
