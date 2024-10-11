import type { I18nLocale } from "../../middleware/createLocaleMiddleware";

import {
  type AnchorProps,
  A as RouterAnchor,
  cache,
  createAsync,
  redirect,
  useLocation,
  useParams,
} from "@solidjs/router";
import {
  createContext,
  createMemo,
  JSX,
  Show,
  splitProps,
  useContext,
  type Accessor,
} from "solid-js";

import { notFound } from "../utils/notFound.js";
import { getRequestLocale } from "../utils/getRequestLocale.js";

/**
 * Creates a context for managing the current locale.
 *
 * @remarks
 * This context is used to provide the current locale to components throughout the application.
 *
 * @returns A context object with a `locale` property that is an asynchronous accessor to the current locale.
 */
const LocaleContext = createContext<Accessor<I18nLocale | undefined>>();

/**
 * Fetches the current locale based on the provided parameter.
 *
 * @remarks
 * This function is used to fetch the current locale from the server. It takes a `paramLocale` parameter, which is an optional string representing the desired locale. If no locale is provided, it returns the current locale. If the provided locale does not match the current locale, it throws a `404` error.
 *
 * @param {string=} paramLocale - An optional string representing the desired locale.
 * @returns The current locale as an `Accessor` object.
 */
const fetchLocale = cache(
  async (path: string, paramLocale?: string, notFoundRoute?: string) => {
    "use server";
    const locale = getRequestLocale();

    if (!locale) {
      console.warn(
        "To use 'LocaleProvider', make sure to setup the localization within your app config!"
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
        "404 not found! The locale is not supported!"
      );
    return locale;
  },
  "locale"
);

/**
 * Provides the current locale to components throughout the application.
 *
 * @remarks
 * This component is used to wrap other components and provide them with the current locale. It takes a `children` prop, which is the component or components to be wrapped. It uses the `useParams` hook to retrieve the current locale from the URL parameters, and then uses the `createAsync` function to fetch the current locale using the `fetchLocale` function. It then returns a `LocaleContext.Provider` component with the `locale` value set to the asynchronous `fetchLocale` result.
 *
 * @param props - The properties of the `LocaleProvider` component.
 * @param props.children - The component or components to be wrapped.
 * @returns A `LocaleContext.Provider` component with the `locale` value set to the asynchronous `fetchLocale` result.
 */
export const LocaleProvider = (props: {
  children?: JSX.Element;
  notFoundRoute?: string;
}) => {
  const params = useParams();
  const location = useLocation();
  const locale = createAsync(async () =>
    fetchLocale(location.pathname, params.locale, props.notFoundRoute)
  );
  return (
    // @ts-expect-error
    <LocaleContext.Provider value={locale}>
      <InternalLocaleProvider>{props.children}</InternalLocaleProvider>
    </LocaleContext.Provider>
  );
};

/**
 * Retrieves the current locale from the `LocaleContext`.
 *
 * @remarks
 * This function is used to retrieve the current locale from the `LocaleContext`. It uses the `useContext` hook to access the `locale` value from the `LocaleContext`. It then returns the `locale` value.
 *
 * @returns The current locale as an `Accessor` object.
 */
export const useLocale = () => {
  return useContext(LocaleContext)!;
};

/**
 * Provides the current locale to components throughout the application.
 *
 * @remarks
 * This component is used to wrap other components and provide them with the current locale. It takes a `children` prop, which is the component or components to be wrapped. It uses the `useLocale` function to retrieve the current locale from the `LocaleContext`, and then uses a `Show` component to conditionally render the `children` prop based on whether the `locale` value is truthy.
 *
 * @param props - The properties of the `InternalLocaleProvider` component.
 * @param props.children - The component or components to be wrapped.
 * @returns A `Show` component with the `children` prop conditionally rendered based on whether the `locale` value is truthy.
 */
function InternalLocaleProvider(props: { children?: JSX.Element }) {
  const locale = useLocale();

  if (locale() === null)
    throw new Error("Localization not enabled through app config!");

  return <Show when={locale()}>{props.children}</Show>;
}

/**
 * Customized RouterAnchor component to handle locale in URL.
 *
 * @remarks
 * This component is used to create links in the application. It automatically adds the current locale
 * to the URL if it's not already present.
 *
 * @param props - The properties of the RouterAnchor component.
 * @param props.href - The href attribute of the anchor tag.
 * @param props.children - The children of the anchor tag.
 *
 * @returns - A RouterAnchor component with the appropriate href and hreflang attributes.
 */
export const A = (props: AnchorProps) => {
  // Get the current locale from the URL parameters
  const params = useParams();

  // Split the properties into hrefProps, childrenProps, and restProps
  const [hrefProps, childrenProps, restProps] = splitProps(
    props,
    ["href"],
    ["children"]
  );

  // Create a memoized href attribute
  const href = createMemo(() => {
    // If the locale is not present in the URL, return the original href
    if (!params.locale) return hrefProps.href;

    // If the href already starts with the current locale, return the original href
    if (hrefProps.href.startsWith(`/${params.locale}`)) return hrefProps.href;

    // If the href does not start with the current locale, prepend it to the href
    return `/${params.locale}${hrefProps.href === "/" ? "" : hrefProps.href}`;
  });

  // Return the RouterAnchor component with the appropriate href and hreflang attributes
  return (
    <RouterAnchor href={href()} hreflang={params.locale} {...restProps}>
      {childrenProps.children}
    </RouterAnchor>
  );
};
