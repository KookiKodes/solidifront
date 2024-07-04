"use server";
import { getRequestEvent } from "solid-js/web";
import { getCookie } from "vinxi/http";

export function getShopifyContext() {
  const event = getRequestEvent();
  if (!event) {
    throw new Error("No request event");
  }
  return event.locals.shopify;
}

export function getLocale() {
  const event = getRequestEvent();
  if (!event) {
    throw new Error("No request event");
  }
  if (event.locals.locale) return event.locals.locale;
  const localeCookie = JSON.parse(getCookie("locale")!) as I18nLocale;
  return localeCookie;
}

export function getEnv() {
  const event = getRequestEvent();
  if (!event) {
    throw new Error("No request event");
  }
  return event.locals.env;
}
