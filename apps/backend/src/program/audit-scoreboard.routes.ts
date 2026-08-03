// apps/backend/src/program/audit-scoreboard.routes.ts
//
// Read-only endpoint that serves the committed Program scoreboard JSON so the
// frontend can render the current repo state without a rebuild-only import.
//
// NON-FINANCIAL, READ-ONLY, NO DB: it only reads a file that was generated from
// the committed audit ledger. It intentionally does NOT query accounting.* — a
// live financial-count overlay must be its own RLS/entity-scoped read-only endpoint
// (V8), built against the app-path helper, and is deliberately left out here so this
// route stays a safe docs surface. Register under the existing /api/v1 prefix.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";

// Render cwd is NOT the repo root — resolve from this module (same pattern as program-board).
const REPO_ROOT = (() => {
  try {
    return resolveMonorepoRoot(import.meta.url);
  } catch {
    return process.cwd();
  }
})();
const SCOREBOARD_JSON = path.join(REPO_ROOT, "docs/audit/program-scoreboard.json");

export async function registerAuditScoreboardRoutes(app: FastifyInstance) {
  // CodeQL js/missing-rate-limiting: auth + filesystem read must be rate-limited (cf. safety-reports).
  app.get(
    "/api/v1/program/audit-scoreboard",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      try {
        const raw = await readFile(SCOREBOARD_JSON, "utf8");
        const data = JSON.parse(raw) as unknown;
        reply.header("cache-control", "public, max-age=300");
        return reply.send(data);
      } catch {
        // Missing/unreadable file → 204 so the frontend falls back to its committed seed data,
        // rather than erroring the page. Honest: absence is not a fake board.
        return reply.code(204).send();
      }
    },
  );
}
