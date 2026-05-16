import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the IH35 monorepo root (directory containing `package.json` and `db/migrations`).
 * Required because `tsc` emits flat `dist/` from `apps/backend/src/` — fixed-depth `../`
 * chains differ between source and compiled layouts.
 */
export function resolveMonorepoRoot(fromImportMetaUrl: URL | string): string {
  const url = typeof fromImportMetaUrl === "string" ? new URL(fromImportMetaUrl) : fromImportMetaUrl;
  let dir = dirname(fileURLToPath(url));
  for (;;) {
    if (existsSync(join(dir, "db", "migrations")) && existsSync(join(dir, "package.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`[ih35] monorepo root not found (need db/migrations + package.json); search began at ${dirname(fileURLToPath(url))}`);
    }
    dir = parent;
  }
}
