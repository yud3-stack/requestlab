export function stripQuery(path: string): string {
  const queryIndex = path.indexOf("?");
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

export function normalizeIgnoredPaths(
  ignorePaths: string[] | undefined,
  excludePaths: string[] | undefined
): string[] {
  return [...(ignorePaths ?? []), ...(excludePaths ?? [])]
    .map(stripQuery)
    .filter(Boolean)
    .filter((path, index, paths) => paths.indexOf(path) === index);
}

export function isIgnoredPath(path: string, ignoredPaths: string[]): boolean {
  const requestPath = stripQuery(path);
  return ignoredPaths.some((ignoredPath) => ignoredPath === requestPath);
}
