import type {
	CountryCode,
	CurrencyCode,
	LanguageCode,
} from "../storefront.types.d.ts";

export type IsoCode = `${Lowercase<LanguageCode>}-${CountryCode}`;

export type Locale = {
	country: CountryCode;
	currency: CurrencyCode;
	isoCode: IsoCode;
	label:
	| `${string} (${CurrencyCode} ${string})`
	| `${string} - ${string} (${CurrencyCode} ${string})`;
	language: LanguageCode;
	languageLabel: string;
};

export type Localizations = Record<
	`/${Lowercase<IsoCode>}` | "default",
	Locale
>;
