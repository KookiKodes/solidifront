import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import type { HttpBodyError } from "@effect/platform/HttpBody";
import * as HttpClient from "@effect/platform/HttpClient";
import type { HttpClientError } from "@effect/platform/HttpClientError";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import type { ParseError } from "effect/ParseResult";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { RETRY_WAIT_TIME } from "../constants.js";
import * as ClientResponse from "../data/ClientResponse.js";
import * as ResponseErrors from "../data/ResponseErrors.js";
import {
	BadRequestStatusError,
	ForbiddenStatusError,
	LockedStatusError,
	NotFoundStatusError,
	PaymentRequiredStatusError,
	RetriableStatusCodesError,
	StorefrontServerStatusError,
	type ExtractOperationNameError,
} from "../errors.js";
import {
	type ClientOptions,
	GraphQLJsonBody,
	RequestOptions,
	type CodegenOperations,
	type StorefrontMutations,
	type StorefrontQueries,
} from "../schemas.js";

import { buildStorefrontApiUrl } from "../utils/storefront.js";
import * as DefaultClientOptions from "./DefaultClientOptions.js";
import * as DefaultHeaders from "./DefaultHeaders.js";
import * as GraphQLOperation from "./GraphQLOperation.js";
import { withNamespacedLogSpan } from "../utils/logger.js";

export interface StorefrontClientImpl {
	query: <
		const Query extends string,
		GeneratedQueries extends CodegenOperations = StorefrontQueries,
	>(
		query: Query,
		options?: RequestOptions<GeneratedQueries[Query]["variables"]>,
	) => Effect.Effect<
		ClientResponse.ClientResponse<GeneratedQueries[Query]["return"]>,
		ParseError | HttpClientError | ExtractOperationNameError | HttpBodyError
	>;
	mutate: <
		const Mutation extends string,
		GeneratedMutations extends CodegenOperations = StorefrontMutations,
	>(
		query: Mutation,
		options?: RequestOptions<GeneratedMutations[Mutation]["variables"]>,
	) => Effect.Effect<
		ClientResponse.ClientResponse<GeneratedMutations[Mutation]["return"]>,
		ParseError | HttpClientError | ExtractOperationNameError | HttpBodyError
	>;
}

export class StorefrontClient extends Context.Tag(
	"@solidifront/storefront-client",
)<StorefrontClient, StorefrontClientImpl>() { }

export const make = <
	GeneratedQueries extends StorefrontQueries = StorefrontQueries,
	GeneratedMutations extends StorefrontMutations = StorefrontMutations,
>() =>
	Effect.gen(function*() {
		const defaultOptions = yield* DefaultClientOptions.DefaultClientOptions;
		const defaultHeaders = yield* DefaultHeaders.DefaultHeaders;
		const graphqlOperation = yield* GraphQLOperation.GraphQLOperation;
		const defaultClient = yield* HttpClient.HttpClient;

		const defaultEndpoint = buildStorefrontApiUrl(defaultOptions);

		const headers = yield* defaultHeaders.get();

		yield* Effect.annotateLogs(Effect.log("Intializing storefront client..."), {
			...defaultOptions,
			headers: Reflect.has(headers, "shopify-storefront-private-token")
				? {
					...headers,
					"shopify-storefront-private-token": Redacted.make(
						headers["shopify-storefront-private-token"],
					),
				}
				: headers,
		});

		const client = defaultClient.pipe(
			HttpClient.mapRequestInput((request) =>
				request.pipe(HttpClientRequest.setHeaders(headers)),
			),
			HttpClient.transformResponse((response) =>
				response.pipe(
					Effect.filterOrFail(
						(res) => res.status !== BadRequestStatusError.status,
						() => new BadRequestStatusError(),
					),
					Effect.filterOrFail(
						(res) => res.status !== PaymentRequiredStatusError.status,
						() => new PaymentRequiredStatusError(),
					),
					Effect.filterOrFail(
						(res) => res.status !== ForbiddenStatusError.status,
						() => new ForbiddenStatusError(),
					),
					Effect.filterOrFail(
						(res) => res.status !== NotFoundStatusError.status,
						() => new NotFoundStatusError(),
					),
					Effect.filterOrFail(
						(res) => res.status !== LockedStatusError.status,
						() => new LockedStatusError(),
					),
					Effect.filterOrElse(
						(res) =>
							!RetriableStatusCodesError.validStatuses.includes(res.status),
						(res) => new RetriableStatusCodesError(res.status),
					),
					Effect.filterOrElse(
						(res) => res.status < 500,
						(res) => new StorefrontServerStatusError(res.status),
					),
				),
			),
			HttpClient.retry({
				times: defaultOptions.retries,
				schedule: Schedule.spaced(`${RETRY_WAIT_TIME} millis`),
				while: (error) => {
					if (error._tag === "RetriableStatusCodesError") return true;
					return false;
				},
			}),
		);

		const executeRequest = <
			const Operation extends string,
			TVariables extends { [x: string]: never },
			TData = any,
		>(
			operation: Operation,
			options?: RequestOptions<TVariables>,
		) =>
			Effect.fn("executeRequest")(function*(
				operation: Operation,
				options?: RequestOptions<TVariables>,
			) {
				const validatedOptions = yield* Schema.decodeUnknown(RequestOptions)(
					options || {},
				);
				let endpoint = defaultEndpoint;
				if (options?.apiVersion || options?.storeName)
					endpoint = buildStorefrontApiUrl({
						apiVersion:
							validatedOptions.apiVersion || defaultOptions.apiVersion,
						storeName: validatedOptions.storeName || defaultOptions.storeName,
					});

				const headers = yield* defaultHeaders.combine({
					...validatedOptions,
					privateAccessToken: validatedOptions?.privateAccessToken
						? Redacted.value(validatedOptions.privateAccessToken)
						: undefined,
				});

				yield* Effect.annotateLogsScoped({
					apiVersion: validatedOptions.apiVersion || defaultOptions.apiVersion,
					storeName: validatedOptions.storeName || defaultOptions.storeName,
					accessToken:
						validatedOptions?.privateAccessToken ||
						validatedOptions?.publicAccessToken ||
						defaultOptions?.publicAccessToken ||
						defaultOptions?.privateAccessToken,
				});

				const request = yield* HttpClientRequest.post(endpoint).pipe(
					HttpClientRequest.setHeaders(headers),
					HttpClientRequest.bodyJson({
						query: operation,
						variables: validatedOptions?.variables,
					}),
				);

				const response = yield* client.execute(request);

				const json = yield* pipe(
					response,
					HttpClientResponse.schemaBodyJson(GraphQLJsonBody),
				);

				if (json.errors) {
					return ClientResponse.make<TData>({
						extensions: json.extensions,
						errors: ResponseErrors.make({
							networkStatusCode: response.status,
							graphQLErrors: json.errors,
						}),
					});
				}

				return ClientResponse.make<TData>({
					data: json.data as TData,
					extensions: json.extensions,
				});
			})(operation, options).pipe(
				Effect.catchAll((error) => {
					if (
						error._tag === "BadRequestStatusError" ||
						error._tag === "ForbiddenStatusError" ||
						error._tag === "LockedStatusError" ||
						error._tag === "NotFoundStatusError" ||
						error._tag === "PaymentRequiredStatusError" ||
						error._tag === "RetriableStatusCodesError" ||
						error._tag === "StorefrontServerStatusError"
					) {
						return Effect.succeed(
							ClientResponse.make<TData>({
								errors: ResponseErrors.make({
									networkStatusCode: error.status,
									graphQLErrors: [],
									message: error.message,
								}),
							}),
						);
					}
					return Effect.fail(error);
				}),
			);

		const executeOperation = <
			const Operation extends string,
			OperationData extends { variables: any; return: any } = {
				variables: any;
				return: any;
			},
		>(
			type: "query" | "mutate",
			originalOperation: Operation,
			options?: RequestOptions<OperationData["variables"]>,
		) =>
			Effect.gen(function*() {
				const operation = yield* graphqlOperation.validate({
					type,
					operation: originalOperation,
					variables: Reflect.get(options || {}, "variables"),
				});

				const operationName = yield* graphqlOperation.extractName(operation);
				const minifiedOperation = yield* graphqlOperation.minify(operation);

				yield* Effect.annotateLogsScoped({
					name: operationName,
					operation: minifiedOperation,
					variables: Reflect.get(options || {}, "variables"),
				});

				const response = yield* executeRequest<
					Operation,
					OperationData["variables"],
					OperationData["return"]
				>(operation, options);

				yield* Effect.annotateLogsScoped({
					extensions: response.extensions,
				});

				if (response?.errors) {
					yield* Effect.annotateLogsScoped({
						errors: response.errors,
					});
					yield* Effect.logError("Request failed with errors...");
				} else {
					yield* Effect.annotateLogsScoped({
						data: response.data,
					});
					yield* Effect.logInfo("Request completed successfully...");
				}

				return response;
			});

		return StorefrontClient.of({
			query: (query, options) =>
				executeOperation("query", query, options).pipe(
					withNamespacedLogSpan("Query"),
					Effect.scoped,
				),
			mutate: (mutation, options) =>
				executeOperation("mutate", mutation, options).pipe(
					withNamespacedLogSpan("Mutation"),
					Effect.scoped,
				),
		});
	});

export const layer = <
	GeneratedQueries extends StorefrontQueries = StorefrontQueries,
	GeneratedMutations extends StorefrontMutations = StorefrontMutations,
>(
	options: ClientOptions["Encoded"],
) =>
	Layer.scoped(
		StorefrontClient,
		make<GeneratedQueries, GeneratedMutations>(),
	).pipe(
		Layer.provide(
			Layer.mergeAll(
				DefaultHeaders.layer,
				GraphQLOperation.layer,
				FetchHttpClient.layer,
			),
		),
		Layer.provide(DefaultClientOptions.layer(options)),
	);

export const fromEnv = <
	GeneratedQueries extends StorefrontQueries = StorefrontQueries,
	GeneratedMutations extends StorefrontMutations = StorefrontMutations,
>() =>
	Layer.effect(
		StorefrontClient,
		make<GeneratedQueries, GeneratedMutations>(),
	).pipe(
		Layer.provide(
			Layer.mergeAll(
				DefaultHeaders.layer,
				GraphQLOperation.layer,
				FetchHttpClient.layer,
			),
		),
		Layer.provide(DefaultClientOptions.fromEnv),
	);
