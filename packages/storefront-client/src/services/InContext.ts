import * as Context from "effect/Context";
import * as Data from "effect/Data";
import type * as Effect from "effect/Effect";
import { parse, print } from "graphql";
import { upsertInContextWithBuyer } from "../utils/upsertInContextWithBuyer.js";
import { upsertInContextWithLocale } from "../utils/upsertInContextWithLocale.js";
import { upsertInContextWithVisitorConsent } from "../utils/upsertInContextWithVisitorConsent.js";

export class InContextError extends Data.TaggedError(
  "@solidifront/storefront-client/InContextError",
)<{
  message?: string;
  type: "buyer" | "locale" | "visitor-consent";
  cause?: unknown;
}> { }

type BuyerIdentity = {
  customerAccessToken: string;
  companyLocationId?: string;
};

type Locale = {
  language?: string;
  country?: string;
};

type VisitorConsent = {
  analytics?: boolean;
  preferences?: boolean;
  marketing?: boolean;
  saleOfData?: boolean;
};

export interface InContextImpl {
  getBuyerIdentity?: <E = InContextError>() => Effect.Effect<
    BuyerIdentity | null,
    E
  >;
  getLocale?: <E = InContextError>() => Effect.Effect<Locale | null, E>;
  getVisitorConsent?: <E = InContextError>() => Effect.Effect<
    VisitorConsent | null,
    E
  >;
}

export class InContext extends Context.Tag(
  "@solidifront/storefront-client/InContext",
)<InContext, InContextImpl>() {
  static injectBuyerIdentity = (
    operation: string,
    buyerIdentity: BuyerIdentity,
  ) => {
    const variables = {
      buyer: buyerIdentity,
    };

    const node = parse(operation);

    const transformed = upsertInContextWithBuyer(node);

    return {
      operation: print(transformed),
      variables,
    };
  };

  static injectLocale = (operation: string, locale: Locale) => {
    const variables = {
      language: locale.language || null,
      country: locale.country || null,
    };
    const node = parse(operation);

    const transformed = upsertInContextWithLocale(node);

    return {
      operation: print(transformed),
      variables,
    };
  };

  static injectVisitorConsent = (
    operation: string,
    visitorConsent: VisitorConsent,
  ) => {
    const variables = {
      visitorConsent: {
        analytics: visitorConsent.analytics || null,
        preferences: visitorConsent.preferences || null,
        marketing: visitorConsent.marketing || null,
        saleOfData: visitorConsent.saleOfData || null,
      },
    };
    const node = parse(operation);
    const transformed = upsertInContextWithVisitorConsent(node);
    return {
      operation: print(transformed),
      variables,
    };
  };
}

export const of = InContext.of;
