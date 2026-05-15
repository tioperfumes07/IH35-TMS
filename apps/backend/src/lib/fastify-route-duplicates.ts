import type { FastifyInstance } from "fastify";

/**
 * Expand Fastify's ASCII `printRoutes({ commonPrefix: false })` tree into stable
 * `METHOD fullPath` keys. Nested rows only show relative segments (for example
 * `/:id`), so naive line-based duplicate scans false-positive across branches.
 */
export function parsePrintRoutesRouteKeys(printRoutesDump: string): string[] {
  const keys: string[] = [];
  const stack: string[] = [];

  for (const rawLine of printRoutesDump.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const lineMatch = /^([│ ├└─]+)\s*(.+?)\s+\(([^)]*)\)\s*$/.exec(line);
    if (!lineMatch) continue;

    const treePrefix = lineMatch[1] ?? "";
    const segment = (lineMatch[2] ?? "").trim();
    const methods =
      lineMatch[3]
        ?.split(",")
        .map((method) => method.trim())
        .filter(Boolean) ?? [];

    if ((treePrefix.length - 4) % 4 !== 0) continue;

    const depth = (treePrefix.length - 4) / 4;
    stack.length = depth;

    let full: string;
    if (depth === 0) {
      full = segment;
    } else {
      const parent = stack[depth - 1];
      if (!parent) continue;
      full = segment.startsWith("/")
        ? `${parent.replace(/\/$/, "")}${segment}`
        : `${parent}${segment}`;
    }

    stack.push(full);

    for (const method of methods) {
      keys.push(`${method} ${full}`);
    }
  }

  return keys;
}

export function assertNoDuplicateFastifyRouteKeys(keys: string[]): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (!key) continue;
    if (seen.has(key)) {
      throw new Error(`[boot] duplicate route detected: ${key}`);
    }
    seen.add(key);
  }
}

export function assertNoDuplicateFastifyRoutes(app: FastifyInstance): void {
  assertNoDuplicateFastifyRouteKeys(parsePrintRoutesRouteKeys(app.printRoutes({ commonPrefix: false })));
}
