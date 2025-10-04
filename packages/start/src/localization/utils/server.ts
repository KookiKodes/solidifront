import { query, redirect } from "@solidjs/router";
import { getRequestLocale } from "./getRequestLocale.js";
import { notFound } from "./notFound.js";

/**
 * Fetches the current locale based on the provided parameter.
 *
 * @remarks
 * This function is used to fetch the current locale from the server. It takes a `paramLocale` parameter, which is an optional string representing the desired locale. If no locale is provided, it returns the current locale. If the provided locale does not match the current locale, it throws a `404` error.
 *
 * @param {string=} paramLocale - An optional string representing the desired locale.
 * @returns The current locale as an `Accessor` object.
 */
export const getLocale = query(
	async (path: string, paramLocale?: string, notFoundRoute?: string) => {
		"use server";
		const locale = getRequestLocale();

		if (!locale) {
			console.warn(
				"To use 'LocaleProvider', make sure to setup the localization within your app config!",
			);
			return null;
		}

		function notCorrectPathLocale() {
			return (
				!paramLocale &&
				locale!.pathPrefix !== "" &&
				!path.startsWith(locale!.pathPrefix)
			);
		}

		if (notCorrectPathLocale()) {
			throw redirect(`${locale.pathPrefix}${path === "/" ? "" : path}`, {
				statusText: "Redirecting to your preferred shop view",
			});
		}
		if (
			paramLocale &&
			paramLocale.toLowerCase() !==
				`${locale.language}-${locale.country}`.toLowerCase()
		)
			throw notFound(
				notFoundRoute,
				"404 not found! The locale is not supported!",
			);
		return locale;
	},
	"locale",
);
