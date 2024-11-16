import * as Data from "effect/Data";

export class BadRequestStatusError extends Data.TaggedError(
  "BadRequestStatusError",
)<{
  message: string;
  status: 400;
}> {
  static readonly status = 400;
  constructor() {
    super({
      message: "The server will not process the request.",
      status: BadRequestStatusError.status,
    });
  }
}

export class PaymentRequiredStatusError extends Data.TaggedError(
  "PaymentRequiredStatusError",
)<{
  message: string;
  status: 402;
}> {
  static readonly status = 402;
  constructor() {
    super({
      message:
        "The shop is frozen. The shop owner will need to pay the outstanding balance to unfreeze the shop.",
      status: PaymentRequiredStatusError.status,
    });
  }
}

export class ForbiddenStatusError extends Data.TaggedError(
  "ForbiddenStatusError",
)<{
  message: string;
  status: 403;
}> {
  static readonly status = 403;
  constructor() {
    super({
      message:
        "The shop is forbidden. Returned if the store has been marked as fraudulent.",
      status: ForbiddenStatusError.status,
    });
  }
}

export class NotFoundStatusError extends Data.TaggedError(
  "NotFoundStatusError",
)<{
  message: string;
  status: 404;
}> {
  static readonly status = 404;
  constructor() {
    super({
      message:
        "The resource isn’t available. This is often caused by querying for something that’s been deleted.",
      status: NotFoundStatusError.status,
    });
  }
}

export class LockedStatusError extends Data.TaggedError("LockedStatusError")<{
  message: string;
  status: 423;
}> {
  static readonly status = 423;
  constructor() {
    super({
      status: LockedStatusError.status,
      message:
        "The shop isn’t available. This can happen when stores repeatedly exceed API rate limits or due to fraud risk.",
    });
  }
}

export class StorefrontServerStatusError extends Data.TaggedError(
  "StorefrontServerStatusError",
)<{
  message: string;
  status: number;
}> {
  constructor(status: number) {
    super({
      message:
        "An internal error occurred in Shopify. Check out the Shopify status page for more information.",
      status,
    });
  }
}

export class AssertQueryError extends Data.TaggedError("AssertQueryError")<{
  message: string;
  query: string;
}> {
  constructor(query: string) {
    super({
      message: "Invalid query string provided!",
      query,
    });
  }
}

export class AssertMutationError extends Data.TaggedError(
  "AssertMutationError",
)<{
  message: string;
  mutation: string;
}> {
  constructor(mutation: string) {
    super({
      message: "Invalid mutation string provided!",
      mutation,
    });
  }
}

export class ExtractOperationNameError extends Data.TaggedError(
  "ExtractOperationNameError",
)<{
  message: string;
}> {
  constructor(operation: string) {
    super({
      message: `Failed to extract operation name from operation: ${operation}`,
    });
  }
}
