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

const named = (v: string): NameNode => ({ kind: Kind.NAME, value: v });
const varNode = (v: string): VariableNode => ({
  kind: Kind.VARIABLE,
  name: named(v),
});
const namedType = (v: string): TypeNode => ({
  kind: Kind.NAMED_TYPE,
  name: named(v),
});

const visitorVarDef: VariableDefinitionNode = {
  kind: Kind.VARIABLE_DEFINITION,
  variable: varNode("visitorConsent"),
  type: namedType("VisitorConsent"),
};

const visitorArg: ArgumentNode = {
  kind: Kind.ARGUMENT,
  name: named("visitorConsent"),
  value: varNode("visitorConsent"),
};

function upsertVisitorVar(
  op: OperationDefinitionNode,
): readonly VariableDefinitionNode[] {
  const defs = op.variableDefinitions ?? [];
  const has = defs.some((d) => d.variable.name.value === "visitorConsent");
  return has ? defs : [...defs, visitorVarDef];
}

function upsertVisitorArg(
  args: readonly ArgumentNode[] | undefined,
): ArgumentNode[] {
  const list = [...(args ?? [])];
  const i = list.findIndex((a) => a.name.value === "visitorConsent");
  if (i >= 0) list[i] = visitorArg;
  else list.push(visitorArg);
  return list;
}

export function upsertInContextWithVisitorConsent(
  doc: DocumentNode,
): DocumentNode {
  return visit(doc, {
    OperationDefinition(op) {
      const variableDefinitions = upsertVisitorVar(op);

      const directives = op.directives ?? [];
      const idx = directives.findIndex((d) => d.name.value === "inContext");
      if (idx >= 0) {
        const d = directives[idx] as DirectiveNode;
        const patched: DirectiveNode = {
          ...d,
          arguments: upsertVisitorArg(d.arguments),
        };
        const newDirectives = directives.slice();
        newDirectives[idx] = patched;
        return { ...op, variableDefinitions, directives: newDirectives };
      } else {
        const inContext: DirectiveNode = {
          kind: Kind.DIRECTIVE,
          name: named("inContext"),
          arguments: upsertVisitorArg([]),
        };
        return {
          ...op,
          variableDefinitions,
          directives: [...directives, inContext],
        };
      }
    },
  });
}
