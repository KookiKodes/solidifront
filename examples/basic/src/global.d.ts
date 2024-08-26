/// <reference types="@solidjs/start/env" />

import type {
  CountryCode,
  CurrencyCode,
  LanguageCode,
} from "@solidifront/start/storefront-api-types";

declare module "@solidifront/start/locales" {
  export type IsoCode = `${Lowercase<LanguageCode>}-${Lowercase<CountryCode>}`;

  export type Locale = {
    country: CountryCode;
    currency: CurrencyCode;
    isoCode: IsoCode;
    label:
      | `${string} ${CurrencyCode} ${string})`
      | `${string} - ${string} (${CurrencyCode} ${string})`;
    language: LanguageCode;
    languageLabel: string;
  };

  export type Localizations = Record<`/${string}` | "default", Locale>;
  export const countries: Localizations;
}
