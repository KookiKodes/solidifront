export function extractQueryName(query: string) {
  return query.match(/(query|mutation)\s+([^({]*)/)?.[0]?.trim();
}

export function queryHasDeferDirective(query: string) {
  return /@defer/.test(query);
}
