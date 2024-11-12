import * as Effect from "effect/Effect";

import { IS_QUERY_RE, IS_MUTATION_RE } from "../constants.js";
import {
  ExtractOperationNameError,
  AssertQueryError,
  AssertMutationError,
} from "../errors.js";

type ExtractOperationName<T extends string> =
  T extends `${infer _}${"query" | "mutation"} ${infer Name}(${infer _}) {${infer _}`
    ? Name
    : T extends `${infer _}${"query" | "mutation"} ${infer Name} {${infer _}`
      ? Name
      : never;

export class OperationUtils extends Effect.Service<OperationUtils>()(
  "@solidifront/storefront-client/OperationUtils",
  {
    effect: Effect.gen(function* () {
      return {
        minify: <const Operation extends string>(operation: Operation) =>
          Effect.succeed(
            operation
              .replace(/\s*#.*$/gm, "") // Remove GQL comments
              .replace(/\s+/gm, " ") // Minify spaces
              .trim() as Operation,
          ),
        extractName: <const Operation extends string>(operation: Operation) =>
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
              return Effect.succeed(
                match![2] as ExtractOperationName<Operation>,
              );
            }),
          ),
        assert: <const Operation extends string>({
          type,
          operation,
        }: {
          type: "query" | "mutate";
          operation: Operation;
        }) =>
          Effect.succeed(operation).pipe(
            Effect.filterOrDie(
              (o) =>
                type === "query"
                  ? OperationUtils.isQuery(o)
                  : OperationUtils.isMutation(o),
              (o) =>
                type === "query"
                  ? new AssertQueryError(o)
                  : new AssertMutationError(o),
            ),
          ),
      };
    }),
  },
) {
  static readonly isQuery = <const Query extends string>(query: Query) =>
    IS_QUERY_RE.test(query);
  static readonly isMutation = <const Mutation extends string>(
    mutation: Mutation,
  ) => IS_MUTATION_RE.test(mutation);
}
