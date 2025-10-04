import { countries } from "@solidifront/start/locales";
import {
	action,
	createAsync,
	json,
	redirect,
	useLocation,
	useParams,
} from "@solidjs/router";
import { setCookie } from "vinxi/http";
import { useLocale } from "../components";
import { fetchLocale } from "../utils/fetchLocale";

const updateLocale = action(async (formData: FormData) => {
	"use server";
	const languageCode = formData.get("language");
	const countryCode = formData.get("country");
	if (!languageCode)
		return json({ error: "Missing language code!" }, { status: 400 });
	if (!countryCode)
		return json({ error: "Missing country code!" }, { status: 400 });
	const path = formData.get("path");
	const locale = `${languageCode}-${countryCode}`.toLowerCase();
	const toLocale = countries[`/${locale}`];

	if (!toLocale)
		return json(
			{ error: "Invalid language or country code!" },
			{ status: 400 },
		);

	const redirectUrl = `${locale ? `/${locale}` : ""}${path}`;

	setCookie("locale", locale);

	return redirect(redirectUrl, {
		status: 302,
		statusText: "Updated user locale.",
	});
}, "locale");

export const createCountrySelector = () => {
	const locale = useLocale();
};
