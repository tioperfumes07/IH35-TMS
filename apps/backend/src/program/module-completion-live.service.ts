import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";
import { resolveBackendVersion } from "../health/health.routes.js";

type Generator = {
  buildData: () => {
    modules: unknown[];
    first14: string[];
    u14Exclusive: unknown[];
    u14CertifiedCount: number;
  };
};

/**
 * Module Completion board payload from docs/module-completion/*.json on THIS API process.
 * Not the frontend Vite bundle (that file is gitignored and frozen at static-site build).
 */
export async function loadModuleCompletionBoard() {
  const root = resolveMonorepoRoot(import.meta.url);
  const href = pathToFileURL(join(root, "scripts/generate-module-completion-data.mjs")).href;
  const gen = (await import(href)) as Generator;
  const data = gen.buildData();
  return {
    served_sha: resolveBackendVersion(),
    served_at: new Date().toISOString(),
    source:
      "docs/module-completion/*.json on this API process (healthz version). Not the frontend static bundle.",
    modules: data.modules,
    first14: data.first14,
    u14Exclusive: data.u14Exclusive,
    u14CertifiedCount: data.u14CertifiedCount,
  };
}
