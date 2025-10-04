import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as LogLevel from "effect/LogLevel";
import type { ClientResponse } from "./data/ClientResponse";
import {
	type ClientOptions,
	type CodegenOperations,
	LatestVersion,
	type RequestOptions,
	type StorefrontMutations,
	type StorefrontQueries,
	ValidVersion,
} from "./schemas.js";
import * as TypedStorefrontClient from "./services/TypedStorefrontClient.js";

export namespace createStorefrontClient {
	export type Options = ClientOptions["Encoded"] & {
		logger?: Parameters<typeof Logger.make>[0];
	};
	export type Variables<
		Operation extends string,
		GeneratedOperations extends CodegenOperations =
			| StorefrontQueries
			| StorefrontMutations,
	> = GeneratedOperations[Operation]["variables"];
	export type ReturnData<
		Operation extends string,
		GeneratedOperations extends CodegenOperations =
			| StorefrontMutations
			| StorefrontMutations,
	> = GeneratedOperations[Operation]["return"];
	export type Return<
		Operation extends string,
		GeneratedOperations extends Record<string, { return: any }>,
	> = Promise<ClientResponse<GeneratedOperations[Operation]["return"]>>;
}

export type { StorefrontQueries, StorefrontMutations, ValidVersion };

export const validVersions = ValidVersion.literals;
export const latestVersion = LatestVersion.literals[0];

export const createStorefrontClient = <
	GeneratedQueries extends CodegenOperations = StorefrontQueries,
	GeneratedMutations extends CodegenOperations = StorefrontMutations,
>({
	logger,
	...initOptions
}: createStorefrontClient.Options) => {
	let layer = TypedStorefrontClient.Default;
	let minimumLogLevel = LogLevel.None;
	let loggerLayer = Logger.pretty;

	if (logger) {
		loggerLayer = Logger.replace(Logger.defaultLogger, Logger.make(logger));
		layer = Layer.mergeAll(loggerLayer, layer);
		minimumLogLevel = LogLevel.All;
	}

	return Effect.runSync(
		Effect.gen(function* () {
			const client = yield* TypedStorefrontClient.make<
				GeneratedQueries,
				GeneratedMutations
			>(initOptions);

			return {
				mutate: <const Mutation extends string>(
					mutation: Mutation,
					options?: RequestOptions<GeneratedMutations[Mutation]["variables"]>,
				) =>
					Effect.runPromise(
						client.mutate(mutation, options).pipe(
							Logger.withMinimumLogLevel(minimumLogLevel),
							Effect.provide(loggerLayer),
							Effect.catchAll((error) => {
								if (
									error._tag === "ExtractOperationNameError" ||
									error._tag === "ParseError" ||
									error._tag === "RequestError" ||
									error._tag === "ResponseError"
								) {
									return Effect.fail(
										new Error(error.message, {
											cause: error.cause,
										}),
									);
								}

								if (error._tag === "HttpBodyError") {
									const reason = error.reason;
									if (reason._tag === "JsonError") {
										return Effect.fail(
											new Error("Failed to parse JSON response"),
										);
									}
									if (reason._tag === "SchemaError") {
										return Effect.fail(
											new Error(reason.error.message, {
												cause: reason.error.cause,
											}),
										);
									}
								}

								return Effect.fail(new Error("Something went horribly wrong!"));
							}),
						),
						{
							signal: options?.signal,
						},
					),

				query: <const Query extends string>(
					query: Query,
					options?: RequestOptions<GeneratedQueries[Query]["variables"]>,
				) =>
					Effect.runPromise(
						client.query(query, options).pipe(
							Logger.withMinimumLogLevel(minimumLogLevel),
							Effect.provide(loggerLayer),
							Effect.catchAll((error) => {
								if (
									error._tag === "ExtractOperationNameError" ||
									error._tag === "ParseError" ||
									error._tag === "RequestError" ||
									error._tag === "ResponseError"
								) {
									return Effect.fail(
										new Error(error.message, {
											cause: error.cause,
										}),
									);
								}

								if (error._tag === "HttpBodyError") {
									const reason = error.reason;
									if (reason._tag === "JsonError") {
										return Effect.fail(
											new Error("Failed to parse JSON response"),
										);
									}
									if (reason._tag === "SchemaError") {
										return Effect.fail(
											new Error(reason.error.message, {
												cause: reason.error.cause,
											}),
										);
									}
								}

								return Effect.fail(new Error("Something went horribly wrong!"));
							}),
						),
						{
							signal: options?.signal,
						},
					),
			};
		}).pipe(Logger.withMinimumLogLevel(minimumLogLevel), Effect.provide(layer)),
	);
};
