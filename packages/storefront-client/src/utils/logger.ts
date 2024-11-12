import * as Effect from "effect/Effect";
import * as FiberRef from "effect/FiberRef";
import * as LogLevel from "effect/LogLevel";
import { OperationUtils } from "../services/OperationUtils.js";

export const filterLogLevelOrNever = <A, E, R>(
  level: LogLevel.LogLevel,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const logLevel = yield* FiberRef.get(FiberRef.currentMinimumLogLevel);
    if (logLevel._tag !== level._tag) return yield* effect;
  });

export const annotateOperation = <const Operation extends string>({
  type,
  operation: o,
  variables,
}: {
  type: "query" | "mutate";
  operation: Operation;
  variables?: any;
}) =>
  filterLogLevelOrNever(
    LogLevel.None,
    Effect.gen(function* () {
      const utils = yield* OperationUtils;
      const name = yield* utils.extractName(o);
      return yield* Effect.annotateLogsScoped({
        name,
        type,
        operation: o,
        variables,
      });
    }),
  ).pipe(Effect.provide(OperationUtils.Default));

export const withNamespacedLogSpan = (label: string) =>
  Effect.withLogSpan(`[@solidifront/storefront-client]:${label}`);
