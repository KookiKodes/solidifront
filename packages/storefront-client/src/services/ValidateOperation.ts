import * as Effect from "effect/Effect";

import { OperationUtils } from "./OperationUtils.js";
import { annotateOperation } from "../utils/logger.js";

interface OperationOptions<Operation extends string> {
  type: "query" | "mutate";
  operation: Operation;
  variables?: any;
}

export class ValidateOperation extends Effect.Service<ValidateOperation>()(
  "@solidifront/storefront-client/Operation",
  {
    effect: Effect.gen(function* () {
      const utils = yield* OperationUtils;
      return <const Operation extends string>({
        type,
        operation,
        variables,
      }: OperationOptions<Operation>) =>
        Effect.gen(function* () {
          const minifiedOperation = yield* utils.minify(operation);
          yield* utils.assert({ type, operation: minifiedOperation });
          yield* annotateOperation({
            type,
            operation: minifiedOperation,
            variables,
          });
          return minifiedOperation;
        });
    }),
    dependencies: [OperationUtils.Default],
  },
) {}
