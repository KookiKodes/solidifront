export const RETRY_WAIT_TIME = 1000;

export const IS_QUERY_RE = /(^|}\s)query[\s({]/im;
export const IS_MUTATION_RE = /(^|}\s)mutation[\s({]/im;

export const VALID_RESPONSE_TAGS = [
	"BadRequestStatusError",
	"PaymentRequiredStatusError",
	"ForbiddenStatusError",
	"NotFoundStatusError",
	"LockedStatusError",
	"StorefrontServerStatusError",
] as const;
