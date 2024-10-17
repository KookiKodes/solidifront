export type ExtractOperationName<T extends string> =
  T extends `${infer _}${"query" | "mutation"} ${infer Name}(${infer _}) {${infer _}`
    ? Name
    : T extends `${infer _}${"query" | "mutation"} ${infer Name} {${infer _}`
      ? Name
      : never;
