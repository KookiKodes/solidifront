import * as Effect from "effect/Effect";
import * as LoggerUtils from "./LoggerUtils.js";
import * as LogLevel from "effect/LogLevel";
import { isQuery, isMutation } from "../predicates.js";
import {
  ExtractOperationNameError,
  AssertQueryError,
  AssertMutationError,
} from "../errors.js";

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

export const minify = <const Operation extends string>(operation: Operation) =>
  Effect.succeed(
    operation
      .replace(/\s*#.*$/gm, "") // Remove GQL comments
      .replace(/\s+/gm, " ") // Minify spaces
      .trim() as Operation,
  );

export const extractName = <const Operation extends string>(
  operation: Operation,
) =>
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

export const assert = <const Operation extends string>({
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

export const annotate = <const Operation extends string>({
  type,
  operation: o,
  variables,
}: {
  type: "query" | "mutate";
  operation: Operation;
  variables?: any;
}) =>
  LoggerUtils.filterLevelOrNever(
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

export const validate = <const Operation extends string>({
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
