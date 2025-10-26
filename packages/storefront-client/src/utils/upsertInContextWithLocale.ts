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

const languageVarDef: VariableDefinitionNode = {
  kind: Kind.VARIABLE_DEFINITION,
  variable: varNode("language"),
  type: namedType("LanguageCode"),
};

const countryVarDef: VariableDefinitionNode = {
  kind: Kind.VARIABLE_DEFINITION,
  variable: varNode("country"),
  type: namedType("CountryCode"),
};

const languageArg: ArgumentNode = {
  kind: Kind.ARGUMENT,
  name: named("language"),
  value: varNode("language"),
};
const countryArg: ArgumentNode = {
  kind: Kind.ARGUMENT,
  name: named("country"),
  value: varNode("country"),
};

function upsertVarDefs(op: OperationDefinitionNode): VariableDefinitionNode[] {
  const defs = op.variableDefinitions ?? [];
  const hasLanguage = defs.some((d) => d.variable.name.value === "language");
  const hasCountry = defs.some((d) => d.variable.name.value === "country");
  return [
    ...defs,
    ...(hasLanguage ? [] : [languageVarDef]),
    ...(hasCountry ? [] : [countryVarDef]),
  ];
}

function upsertArgs(args: readonly ArgumentNode[] | undefined): ArgumentNode[] {
  const list = [...(args ?? [])];
  const replaceOrPush = (name: "language" | "country", arg: ArgumentNode) => {
    const i = list.findIndex((a) => a.name.value === name);
    if (i >= 0) list[i] = arg;
    else list.push(arg);
  };
  replaceOrPush("language", languageArg);
  replaceOrPush("country", countryArg);
  return list;
}

function patchInContext(op: OperationDefinitionNode): OperationDefinitionNode {
  const variableDefinitions = upsertVarDefs(op);

  const directives = op.directives ?? [];
  const idx = directives.findIndex((d) => d.name.value === "inContext");

  if (idx >= 0) {
    // If you might have repeatable directives, map over all instead.
    const d = directives[idx] as DirectiveNode;
    const patchedDir: DirectiveNode = {
      ...d,
      arguments: upsertArgs(d.arguments),
    };
    const newDirectives = directives.slice();
    newDirectives[idx] = patchedDir;
    return { ...op, variableDefinitions, directives: newDirectives };
  } else {
    const inContext: DirectiveNode = {
      kind: Kind.DIRECTIVE,
      name: named("inContext"),
      arguments: upsertArgs([]),
    };
    return {
      ...op,
      variableDefinitions,
      directives: [...directives, inContext],
    };
  }
}

export function upsertInContextWithLocale(doc: DocumentNode): DocumentNode {
  return visit(doc, {
    OperationDefinition(op) {
      return patchInContext(op);
    },
  });
}
