import type { FetchEvent } from "@solidjs/start/server";
import type {
  Localizations,
  Locale,
  IsoCode,
} from "@solidifront/vite-plugin-generate-shopify-locales/locales";

import { getCookie, getHeader, setCookie } from "vinxi/http";
import { resolveAcceptLanguage } from "resolve-accept-language";

export type I18nLocale = Locale & {
  pathPrefix:
    | `/${Lowercase<Locale["language"]>}-${Lowercase<Locale["country"]>}`
    | "";
};

export type CreateLocaleMiddlewareOptions = {
  countries: Localizations;
};

export namespace createLocaleMiddleware {
  export type Config = {
    countries: Localizations;
  };
}

export function createLocaleMiddleware({
  countries,
}: createLocaleMiddleware.Config) {
  return async (event: FetchEvent) => {
    const locale = getLocaleFromRequest(countries);
    event.locals.locale = locale;
    setCookie("locale", locale.isoCode.toLowerCase());
  };
}

function parseLocaleFromCookie(countries: Localizations): I18nLocale | null {
  const cookie = getCookie("locale");
  if (!cookie) return null;
  const isoCode = cookie as Lowercase<IsoCode>,
    pathPrefix = `/${isoCode}` as const;
  if (!countries[pathPrefix]) return { ...countries.default, pathPrefix: "" };
  return { ...countries[pathPrefix], pathPrefix };
}

function getPathPrefix(
  defaultLocale: Localizations["default"],
  locale: Locale,
): I18nLocale["pathPrefix"] {
  if (defaultLocale.isoCode === locale.isoCode) return "";
  return `/${locale.isoCode.toLowerCase() as Lowercase<IsoCode>}`;
}

function getLocaleFromRequest(countries: Localizations): I18nLocale {
  // If local cookie is present, use it. Will use this later to allow the user to change the locale.
  const cookieLocale = parseLocaleFromCookie(countries);
  if (cookieLocale) return cookieLocale;

  const userLanguages = getHeader("accept-language");
  if (!userLanguages)
    return {
      ...countries.default,
      pathPrefix: "",
    };

  const locale = resolveAcceptLanguage(
    userLanguages,
    Object.values(countries).map((locale) => locale.isoCode),
    countries.default.isoCode,
    {
      matchCountry: true,
    },
  );

  if (locale === countries.default.isoCode)
    return {
      pathPrefix: "",
      ...countries.default,
    };

  const matchingLocale = countries[`/${locale.toLowerCase()}`];

  return {
    pathPrefix: getPathPrefix(countries.default, matchingLocale),
    ...matchingLocale,
  };
}
