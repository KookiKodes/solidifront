import type { PluginOption } from "vite";
import type { IsoCode, Locale, Localizations } from "./types.js";
import { debugLog } from "./utils/debugLog.js";
import { getStorefrontEnv } from "./utils/env.js";
import { getShopLocalization } from "./utils/getShopLocalization.js";

function buildShopLocales(
	defaultLocale: IsoCode,
	localization: Awaited<ReturnType<typeof getShopLocalization>>,
) {
	return localization.availableCountries.reduce(
		(localizations: Localizations, localization) => {
			localization.availableLanguages.forEach((language) => {
				const isoCode =
					`${language.isoCode.toLowerCase()}-${localization.isoCode}` as IsoCode;
				const data: Locale = {
					country: localization.isoCode,
					currency: localization.currency.isoCode,
					isoCode,
					label: `${language.name} (${localization.currency.isoCode} ${localization.currency.symbol})`,
					language: language.isoCode,
					languageLabel: language.endonymName,
				};
				if (isoCode === defaultLocale) localizations.default = data;
				else
					localizations[`/${isoCode.toLowerCase() as Lowercase<IsoCode>}`] =
						data;
			});
			return localizations;
		},
		{} as Localizations,
	);
}

const DEFAULT_LOCALE: IsoCode = "en-US",
	DEFAULT_NAMESPACE =
		"@solidifront/vite-plugin-generate-shopify-locales/locales";

export namespace generateShopifyShopLocales {
	export type Options = {
		/**
		 * The fallback locale to use if no other locale is found.
		 *
		 * @defaultValue `en-us`
		 */
		defaultLocale?: IsoCode;
		/**
		 * Log various steps to aid in tracking down bugs.
		 *
		 * @defaultValue `false`
		 */
		debug?: boolean;

		/**
		 * The namespace to use for the virtual module.
		 * @defaultValue `@solidifront/vite-plugin-generate-shopify-locales/locales`
		 */
		namespace?: string;
	};
}

function generateShopifyShopLocales(
	options?: generateShopifyShopLocales.Options,
): PluginOption {
	const {
		debug = false,
		defaultLocale = DEFAULT_LOCALE,
		namespace = DEFAULT_NAMESPACE,
	} = options ?? {
		defaultLocale: DEFAULT_LOCALE,
		namespace: DEFAULT_NAMESPACE,
	};

	const virtualModuleId = namespace;
	const resolvedVirtualModuleId = `\0${virtualModuleId}`;

	const log = (...args: unknown[]) => {
		if (!debug) return;
		debugLog(...args);
	};

	if (options) log("Plugin initialized with options:", options);

	let countries: Localizations | null = null;

	const getCode = (countries: Localizations | null) => `
    export const countries = ${JSON.stringify(countries, null, 2)};
  `;

	return {
		name: "vite-plugin-generate-shopify-locales",
		enforce: "pre",
		resolveId(id) {
			if (id !== virtualModuleId) return;
			return resolvedVirtualModuleId;
		},
		async load(id) {
			if (id === resolvedVirtualModuleId) {
				if (countries) return getCode(countries);
				log("Validating correct environment variables...");
				const env = getStorefrontEnv.call(this);
				log(
					`Overriding declaration file for virtual module:  ${virtualModuleId}`,
				);
				log("Fetching shop locales...");
				const localization = await getShopLocalization({
					...env,
				});
				log("Building shop locales");
				countries = buildShopLocales(defaultLocale, localization);
				return getCode(countries);
			}
		},
	};
}

export default generateShopifyShopLocales;
