// apps/backend/src/program/audit-scoreboard.routes.ts
//
// Read-only endpoint that serves the committed Program scoreboard JSON so the
// frontend can render the current repo state without a rebuild-only import.
//
// NON-FINANCIAL, READ-ONLY, NO DB: it only reads files generated from the
// committed audit ledger / tracker recon. It intentionally does NOT query
// accounting.* — a live financial-count overlay must be its own RLS/entity-scoped
// read-only endpoint (V8). Register under the existing /api/v1 prefix.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";
import { formatCt } from "./program-board.service.js";

// Render cwd is NOT the repo root — resolve from this module (same pattern as program-board).
const REPO_ROOT = (() => {
  try {
    return resolveMonorepoRoot(import.meta.url);
  } catch {
    return process.cwd();
  }
})();
const SCOREBOARD_JSON = path.join(REPO_ROOT, "docs/audit/program-scoreboard.json");
// Recent PRs live in the tracker recon artifact (CI-written, NOT typecheck-gated FE seed).
const RECON_JSON = path.join(REPO_ROOT, "docs/trackers/block-reconciliation-data.json");

type ScoreboardPayload = {
  meta?: { generatedAt?: string; [k: string]: unknown };
  [k: string]: unknown;
};

type RecentPr = {
  number: number;
  title: string;
  mergedAtCt: string;
  url: string;
};

async function loadRecentActivity(limit = 10): Promise<RecentPr[]> {
  try {
    const raw = await readFile(RECON_JSON, "utf8");
    const data = JSON.parse(raw) as {
      merged_prs?: Array<{ number?: number; title?: string; mergedAt?: string }>;
    };
    const prs = Array.isArray(data.merged_prs) ? data.merged_prs : [];
    return prs.slice(0, limit).flatMap((p) => {
      const number = Number(p.number);
      if (!Number.isFinite(number) || number <= 0) return [];
      const title = String(p.title ?? "").trim() || `PR #${number}`;
      const mergedAtCt = formatCt(p.mergedAt ?? null) || "—";
      return [
        {
          number,
          title,
          mergedAtCt,
          url: `https://github.com/tioperfumes07/IH35-TMS/pull/${number}`,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function registerAuditScoreboardRoutes(app: FastifyInstance) {
  // CodeQL js/missing-rate-limiting: auth + filesystem read must be rate-limited (cf. safety-reports).
  app.get(
    "/api/v1/program/audit-scoreboard",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      try {
        const raw = await readFile(SCOREBOARD_JSON, "utf8");
        const data = JSON.parse(raw) as ScoreboardPayload;
        const generatedAt = typeof data.meta?.generatedAt === "string" ? data.meta.generatedAt : null;
        // Last synced = ledger git commit time (meta.generatedAt from git log %cI), never wall clock.
        const lastSyncedCt = formatCt(generatedAt) || null;
        const recentActivity = await loadRecentActivity(10);
        reply.header("cache-control", "public, max-age=60");
        return reply.send({
          ...data,
          meta: {
            ...(data.meta ?? {}),
            lastSyncedCt,
          },
          recentActivity,
        });
      } catch {
        // Missing/unreadable file → 204 so the frontend falls back to its committed seed data,
        // rather than erroring the page. Honest: absence is not a fake board.
        return reply.code(204).send();
      }
    },
  );

  // Separate live surface so recent PRs can refresh with recon without dirtying the typed FE seed.
  app.get(
    "/api/v1/program/audit-scoreboard/recent-activity",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const items = await loadRecentActivity(10);
      reply.header("cache-control", "public, max-age=60");
      return reply.send({ items, zone: "America/Chicago", label: "CT" });
    },
  );
}
