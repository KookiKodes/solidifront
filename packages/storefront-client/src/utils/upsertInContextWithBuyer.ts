import {
  type ArgumentNode,
  type DirectiveNode,
  type DocumentNode,
  Kind,
  type NameNode,
  type OperationDefinitionNode,
  type TypeNode,
  type VariableDefinitionNode,
  type VariableNode,
  visit,
} from "graphql";

const named = (name: string): NameNode => ({ kind: Kind.NAME, value: name });
const varNode = (name: string): VariableNode => ({
  kind: Kind.VARIABLE,
  name: named(name),
});
const namedType = (name: string): TypeNode => ({
  kind: Kind.NAMED_TYPE,
  name: named(name),
});

const buyerVarDef: VariableDefinitionNode = {
  kind: Kind.VARIABLE_DEFINITION,
  variable: varNode("buyer"),
  type: namedType("BuyerIdentity"),
};

const buyerArg: ArgumentNode = {
  kind: Kind.ARGUMENT,
  name: named("buyer"),
  value: varNode("buyer"),
};

export function patchContext(
  op: OperationDefinitionNode,
): OperationDefinitionNode {
  // upserts $buyer into variableDefinitions
  const hasBuyerVar = (op.variableDefinitions ?? []).some(
    (v) => v.variable.name.value === "buyer",
  );
  const variableDefinitions = hasBuyerVar
    ? op.variableDefinitions
    : [...(op.variableDefinitions ?? []), buyerVarDef];

  // upsert @inContext and add/replace its buyer arg with $buyer
  const directives = op.directives ?? [];
  const idx = directives.findIndex((d) => d.name.value === "inContext");

  // If inContext directive already exists, replace buyer arg
  if (idx >= 0) {
    const d = directives[idx] as DirectiveNode;
    const args = d?.arguments ?? [];
    const existingBuyerIdx = args.findIndex((a) => a.name.value === "buyer");
    const newArgs =
      existingBuyerIdx >= 0
        ? args.map((a, i) => (i === existingBuyerIdx ? buyerArg : a)) // replace
        : [...args, buyerArg]; // append

    const patched: DirectiveNode = {
      ...d,
      arguments: newArgs,
    };
    const newDirectives = directives.slice();
    newDirectives[idx] = patched;

    return { ...op, variableDefinitions, directives: newDirectives };
  } else {
    const inContext: DirectiveNode = {
      kind: Kind.DIRECTIVE,
      name: named("inContext"),
      arguments: [buyerArg],
    };
    return {
      ...op,
      variableDefinitions,
      directives: [...directives, inContext],
    };
  }
}

export function upsertInContextWithBuyer(document: DocumentNode): DocumentNode {
  return visit(document, {
    OperationDefinition(op) {
      return patchContext(op);
    },
  });
}
