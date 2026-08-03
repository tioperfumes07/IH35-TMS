// apps/backend/src/program/audit-scoreboard.routes.ts
//
// Read-only endpoint that serves the committed Program scoreboard JSON so the
// frontend can render the current repo state without a rebuild-only import.
//
// NON-FINANCIAL, READ-ONLY, NO DB: scoreboard JSON is filesystem; recentActivity
// is a live GitHub heartbeat (server-side, short-cached). Never query accounting.*.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";
import { formatCt } from "./program-board.service.js";

const REPO_ROOT = (() => {
  try {
    return resolveMonorepoRoot(import.meta.url);
  } catch {
    return process.cwd();
  }
})();
const SCOREBOARD_JSON = path.join(REPO_ROOT, "docs/audit/program-scoreboard.json");
const GITHUB_PULLS_URL =
  "https://api.github.com/repos/tioperfumes07/IH35-TMS/pulls?state=all&sort=updated&direction=desc&per_page=10";
const RECENT_CACHE_MS = 60_000;
const GITHUB_FETCH_TIMEOUT_MS = 8_000;

type ScoreboardPayload = {
  meta?: { generatedAt?: string; [k: string]: unknown };
  [k: string]: unknown;
};

export type RecentPr = {
  number: number;
  title: string;
  state: string;
  mergedAtCt: string;
  url: string;
};

type RecentCache = { atMs: number; items: RecentPr[] };
let recentCache: RecentCache | null = null;

function githubToken(): string | null {
  // Prefer explicit bot/PAT used by Program sync; fall back to Actions/default names.
  const candidates = [
    process.env.TRACKER_BOT_TOKEN,
    process.env.GITHUB_TOKEN,
    process.env.GH_TOKEN,
  ];
  for (const raw of candidates) {
    const t = typeof raw === "string" ? raw.trim() : "";
    if (t) return t;
  }
  return null;
}

/**
 * Live last-10 PRs from GitHub (request-time). Short-cached (~60s).
 * On error/timeout → [] so the Scoreboard page never crashes.
 */
export async function loadRecentActivityFromGitHub(limit = 10): Promise<RecentPr[]> {
  const now = Date.now();
  if (recentCache && now - recentCache.atMs < RECENT_CACHE_MS) {
    return recentCache.items.slice(0, limit);
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ih35-tms-program-scoreboard",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = githubToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), GITHUB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(GITHUB_PULLS_URL, { headers, signal: ac.signal });
    if (!res.ok) {
      recentCache = { atMs: now, items: [] };
      return [];
    }
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) {
      recentCache = { atMs: now, items: [] };
      return [];
    }
    const items: RecentPr[] = [];
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const number = Number(r.number);
      if (!Number.isFinite(number) || number <= 0) continue;
      const title = String(r.title ?? "").trim() || `PR #${number}`;
      const mergedAt = typeof r.merged_at === "string" ? r.merged_at : null;
      const updatedAt = typeof r.updated_at === "string" ? r.updated_at : null;
      const apiState = typeof r.state === "string" ? r.state : "open";
      const state = mergedAt ? "merged" : apiState;
      const stamp = mergedAt ?? updatedAt;
      items.push({
        number,
        title,
        state,
        mergedAtCt: formatCt(stamp) || "—",
        url: `https://github.com/tioperfumes07/IH35-TMS/pull/${number}`,
      });
      if (items.length >= limit) break;
    }
    recentCache = { atMs: now, items };
    return items;
  } catch {
    // Timeout / network / abort — empty panel, never 500 the scoreboard.
    recentCache = { atMs: now, items: [] };
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function registerAuditScoreboardRoutes(app: FastifyInstance) {
  // CodeQL js/missing-rate-limiting: auth + filesystem/GitHub read must be rate-limited.
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
        const recentActivity = await loadRecentActivityFromGitHub(10);
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
        // Missing/unreadable file → 204 so the frontend falls back to its committed seed data.
        return reply.code(204).send();
      }
    },
  );

  app.get(
    "/api/v1/program/audit-scoreboard/recent-activity",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      const items = await loadRecentActivityFromGitHub(10);
      reply.header("cache-control", "public, max-age=60");
      return reply.send({ items, zone: "America/Chicago", label: "CT", source: "github_live" });
    },
  );
}
