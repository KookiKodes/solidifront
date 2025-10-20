import * as Effect from "effect/Effect";
import * as Logger from "effect/Logger";
// import * as LogLevel from "effect/LogLevel";
import * as Scope from "effect/Scope";
import * as Layer from "effect/Layer";
import type * as Context from "effect/Context";
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
import * as StorefrontClient from "./services/StorefrontClient.js";
import { LogLevel } from "effect/index";

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
	let scope: Scope.Scope | null = null;
	let memo: Layer.MemoMap | null = null;
	let ctxPromise: Promise<
		Context.Context<StorefrontClient.StorefrontClient>
	> | null = null;
	// let minimumLogLevel = LogLevel.None;
	// const loggerLayer = Logger.pretty;

	// if (logger) {
	// 	loggerLayer = Logger.replace(Logger.defaultLogger, Logger.make(logger));
	// 	layer = Layer.mergeAll(loggerLayer, layer);
	// 	minimumLogLevel = LogLevel.All;
	// }

	const ensureContext = () => {
		if (ctxPromise) return ctxPromise;
		ctxPromise = (async () => {
			scope = await Effect.runPromise(Scope.make());
			memo = await Effect.runPromise(Layer.makeMemoMap);
			return await Effect.runPromise(
				Layer.buildWithMemoMap(
					StorefrontClient.layer(initOptions).pipe(
						Layer.provide(Logger.minimumLogLevel(LogLevel.Error)),
					),
					memo,
					scope,
				),
			);
		})();
		return ctxPromise;
	};

	type Requirements = StorefrontClient.StorefrontClient;

	const run = async <A, E>(fx: Effect.Effect<A, E, Requirements>) => {
		const ctx = await ensureContext();
		return Effect.runPromise(
			Effect.provide(fx, ctx).pipe(Logger.withMinimumLogLevel(LogLevel.Error)),
		);
	};

	return {
		mutate: <const Mutation extends string>(
			mutation: Mutation,
			options?: RequestOptions<GeneratedMutations[Mutation]["variables"]>,
		) =>
			run(
				Effect.flatMap(StorefrontClient.StorefrontClient, (client) =>
					client.mutate(mutation, options),
				),
			),
		query: <const Query extends string>(
			query: Query,
			options?: RequestOptions<GeneratedQueries[Query]["variables"]>,
		) =>
			run(
				Effect.flatMap(StorefrontClient.StorefrontClient, (client) =>
					client.query(query, options),
				),
			),
	};
};
