import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Scope from "effect/Scope";
import * as LogLevel from "effect/LogLevel";
import * as Layer from "effect/Layer";
import {
	AssertMutationError,
	AssertQueryError,
	ExtractOperationNameError,
} from "../errors.js";
import { isMutation, isQuery } from "../predicates.js";
import { filterLevelOrNever } from "../utils/logger.js";

export interface Options<Operation extends string> {
	type: "query" | "mutate";
	operation: Operation;
	variables?: any;
}

export type ExtractOperationName<T extends string> =
	T extends `${infer _}${"query" | "mutation"} ${infer Name}(${infer _}) {${infer _}`
		? Name
		: T extends `${infer _}${"query" | "mutation"} ${infer Name} {${infer _}`
			? Name
			: never;

export interface GraphQLOperationImpl {
	minify: <const Operation extends string>(
		operation: Operation,
	) => Effect.Effect<Operation>;
	extractName: <const Operation extends string>(
		operation: Operation,
	) => Effect.Effect<
		ExtractOperationName<Operation>,
		ExtractOperationNameError
	>;
	assert: <
		const Operation extends string,
		Type extends "query" | "mutate",
	>(options: {
		type: Type;
		operation: Operation;
	}) => Effect.Effect<
		Operation,
		Type extends "query" ? AssertQueryError : AssertMutationError
	>;
	annotate: <const Operation extends string>(
		options: Options<Operation>,
	) => Effect.Effect<void, ExtractOperationNameError, Scope.Scope>;
	validate: <const Operation extends string>(
		options: Options<Operation>,
	) => Effect.Effect<Operation, ExtractOperationNameError, Scope.Scope>;
}

export class GraphQLOperation extends Context.Tag(
	"@solidifront/storefront-client/GraphQLOperation",
)<GraphQLOperation, GraphQLOperationImpl>() {}

const minify = <const Operation extends string>(operation: Operation) =>
	Effect.succeed(
		operation
			.replace(/\s*#.*$/gm, "") // Remove GQL comments
			.replace(/\s+/gm, " ") // Minify spaces
			.trim() as Operation,
	);

const extractName = <const Operation extends string>(operation: Operation) =>
	Effect.succeed(operation).pipe(
		Effect.filterOrFail(
			(operation) => {
				const match = operation.match(/\b(query|mutation)\b\s+(\w+)/);
				return !!match;
			},
			(operation) => new ExtractOperationNameError(operation),
		),
		Effect.andThen((operation) => {
			const match = operation.match(/\b(query|mutation)\b\s+(\w+)/);
			return Effect.succeed(match![2] as ExtractOperationName<Operation>);
		}),
	);

const assert = <const Operation extends string>({
	type,
	operation,
}: {
	type: "query" | "mutate";
	operation: Operation;
}) =>
	Effect.succeed(operation).pipe(
		Effect.filterOrDie(
			(o) => (type === "query" ? isQuery(o) : isMutation(o)),
			(o) =>
				type === "query" ? new AssertQueryError(o) : new AssertMutationError(o),
		),
	);

const annotate = <const Operation extends string>({
	type,
	operation: o,
	variables,
}: {
	type: "query" | "mutate";
	operation: Operation;
	variables?: any;
}) =>
	filterLevelOrNever(
		LogLevel.None,
		Effect.gen(function* () {
			const name = yield* extractName(o);
			return yield* Effect.annotateLogsScoped({
				name,
				type,
				operation: o,
				variables,
			});
		}),
	);

const validate = <const Operation extends string>({
	type,
	operation,
	variables,
}: Options<Operation>) =>
	Effect.gen(function* () {
		const minifiedOperation = yield* minify(operation);
		yield* assert({ type, operation: minifiedOperation });
		yield* annotate({
			type,
			operation: minifiedOperation,
			variables,
		});
		return minifiedOperation;
	});

export const make = GraphQLOperation.of({
	minify,
	extractName,
	annotate,
	assert,
	validate,
});

export const layer = Layer.succeed(GraphQLOperation, make);
