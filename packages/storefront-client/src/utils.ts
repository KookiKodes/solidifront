import * as Effect from "effect/Effect";
import * as GraphQLOperation from "./services/GraphQLOperation.js";

export const extractOperationName = (operation: string) =>
  Effect.runSync(
    Effect.gen(function* () {
      const utils = yield* GraphQLOperation.GraphQLOperation;
      return yield* utils.extractName(operation);
    }).pipe(Effect.provide(GraphQLOperation.layer)),
  );
