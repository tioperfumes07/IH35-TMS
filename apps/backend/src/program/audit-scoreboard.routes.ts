// apps/backend/src/program/audit-scoreboard.routes.ts
//
// Read-only Program scoreboard endpoint.
//
// PRIMARY: compute counts/gate cells from docs/audit/AUDIT-COVERAGE-LIVE.md at
// request time (~60s cache) — same freshness model as recentActivity from GitHub.
// FALLBACK: committed docs/audit/program-scoreboard.json if the live parse fails.
//
// NON-FINANCIAL. Light Neon `SELECT now()` stamps meta.prodReadAt (honest "live prod
// read"). Never query accounting.*.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";
import { formatCt } from "./program-board.service.js";
import { existsSync, readFileSync } from "node:fs";

const REPO_ROOT = (() => {
  try {
    return resolveMonorepoRoot(import.meta.url);
  } catch {
    return process.cwd();
  }
})();
const SCOREBOARD_JSON = path.join(REPO_ROOT, "docs/audit/program-scoreboard.json");
const LEDGER_MD = path.join(REPO_ROOT, "docs/audit/AUDIT-COVERAGE-LIVE.md");
const SCOREBOARD_SCRIPT = path.join(REPO_ROOT, "scripts/audit-coverage-scoreboard.mjs");
const GITHUB_PULLS_URL =
  "https://api.github.com/repos/tioperfumes07/IH35-TMS/pulls?state=all&sort=updated&direction=desc&per_page=10";
const GITHUB_LEDGER_COMMITS_URL =
  "https://api.github.com/repos/tioperfumes07/IH35-TMS/commits?path=docs/audit/AUDIT-COVERAGE-LIVE.md&per_page=1";
const RECENT_CACHE_MS = 60_000;
const SCOREBOARD_CACHE_MS = 60_000;
const GITHUB_FETCH_TIMEOUT_MS = 8_000;

type ScoreboardPayload = {
  meta?: { generatedAt?: string; source?: string; [k: string]: unknown };
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

type ScoreboardCache = { atMs: number; data: ScoreboardPayload; source: "ledger_live" | "committed_fallback" };
let scoreboardCache: ScoreboardCache | null = null;

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

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ih35-tms-program-scoreboard",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = githubToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * When the deploy tree has no usable git history for the ledger, resolve
 * generatedAt/sourceSha from the GitHub commits API (same token as PR tracker).
 */
async function loadLedgerCommitMetaFromGitHub(): Promise<{ generatedAt: string; sourceSha: string } | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), GITHUB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(GITHUB_LEDGER_COMMITS_URL, { headers: githubHeaders(), signal: ac.signal });
    if (!res.ok) return null;
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const row = raw[0] as Record<string, unknown>;
    const sha = typeof row.sha === "string" ? row.sha.slice(0, 9) : "";
    const commit = row.commit as Record<string, unknown> | undefined;
    const author = commit?.author as Record<string, unknown> | undefined;
    const date = typeof author?.date === "string" ? author.date : "";
    if (!sha || !date) return null;
    return { generatedAt: date, sourceSha: sha };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Live last-10 PRs from GitHub (request-time). Short-cached (~60s).
 * On error/timeout → [] so the Scoreboard page never crashes.
 */
/**
 * Read the ledger-generated last-10 feed committed at docs/audit/program-scoreboard.json.
 * Never throws: a missing or malformed artifact returns [] so the caller can fall back.
 */
function readRecentActivityFromLedger(limit: number): RecentPr[] {
  // Resolve through SCOREBOARD_JSON (REPO_ROOT + docs/audit/program-scoreboard.json), the SAME
  // constant the fallback payload loader already uses. Guessing relative paths off process.cwd()
  // would be a second, divergent path resolution in one file: the backend's cwd is whatever the
  // Render start command sets, so a cwd-relative read can miss the artifact that resolveMonorepoRoot
  // finds — and this function fails SILENTLY to [], which is precisely the empty-panel state the
  // finding is about. One resolution, or the two drift apart.
  try {
    const parsed = JSON.parse(readFileSync(SCOREBOARD_JSON, "utf8")) as { recentActivity?: unknown };
    if (!Array.isArray(parsed.recentActivity)) return [];
    const items: RecentPr[] = [];
    for (const row of parsed.recentActivity) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const number = Number(r.number ?? 0);
      items.push({
        number: Number.isFinite(number) ? number : 0,
        title: String(r.title ?? ""),
        state: String(r.state ?? "merged"),
        mergedAtCt: String(r.mergedAtCt ?? ""),
        url: String(r.url ?? ""),
      });
    }
    return items.slice(0, limit);
  } catch {
    return [];
  }
}

export async function loadRecentActivityFromGitHub(limit = 10): Promise<RecentPr[]> {
  const now = Date.now();
  if (recentCache && now - recentCache.atMs < RECENT_CACHE_MS) {
    return recentCache.items.slice(0, limit);
  }

  // PROG-PRFEED-PRIVATE-EMPTY — the LEDGER is the source, GitHub is only a fallback.
  //
  // This panel went permanently empty when the repo was made private: the GitHub call still answered,
  // it just returned nothing, so the endpoint replied 200 with `recentActivity: []` and the board
  // rendered "No recent PRs returned yet" forever instead of failing. An empty array is
  // indistinguishable from "nothing has merged", which is why it went unnoticed.
  //
  // docs/audit/program-scoreboard.json is generated in CI from `git log` (see
  // scripts/audit-coverage-scoreboard.mjs) and committed, so it ships with the deploy. Reading it needs
  // no token and cannot be emptied by a visibility change — the same reason "Last synced" survived the
  // event that killed this panel. The GitHub path is kept only as a fallback for the case where the
  // artifact is absent; it is no longer the primary source.
  const ledger = readRecentActivityFromLedger(limit);
  if (ledger.length > 0) {
    recentCache = { atMs: now, items: ledger };
    return ledger.slice(0, limit);
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), GITHUB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(GITHUB_PULLS_URL, { headers: githubHeaders(), signal: ac.signal });
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

async function loadCommittedFallback(): Promise<ScoreboardPayload> {
  const raw = await readFile(SCOREBOARD_JSON, "utf8");
  const data = JSON.parse(raw) as ScoreboardPayload;
  return {
    ...data,
    meta: {
      ...(data.meta ?? {}),
      source: "committed_fallback",
    },
  };
}

/**
 * Primary path: parse the deployed ledger via the same script that emits the
 * committed JSON. Short-cached (~60s). Falls back to committed JSON on failure.
 */
export async function loadScoreboardPayload(): Promise<{
  data: ScoreboardPayload;
  source: "ledger_live" | "committed_fallback";
}> {
  const now = Date.now();
  if (scoreboardCache && now - scoreboardCache.atMs < SCOREBOARD_CACHE_MS) {
    return { data: scoreboardCache.data, source: scoreboardCache.source };
  }

  try {
    // Ensure ledger is present before importing the heavy parser.
    await readFile(LEDGER_MD, "utf8");
    const mod = (await import(pathToFileURL(SCOREBOARD_SCRIPT).href)) as {
      buildProgramScoreboardLive: () => ScoreboardPayload;
    };
    let data = mod.buildProgramScoreboardLive();
    // Prefer GitHub ledger-commit meta ALWAYS when available.
    // Render/deploy trees are shallow: `git log -1 -- AUDIT-COVERAGE-LIVE.md` returns HEAD
    // (not the real ledger author commit), which made Last synced show the deploy SHA/time.
    const gh = await loadLedgerCommitMetaFromGitHub();
    if (gh) {
      data = {
        ...data,
        meta: {
          ...(data.meta ?? {}),
          generatedAt: gh.generatedAt,
          sourceSha: gh.sourceSha,
          source: "ledger_live",
        },
      };
    } else {
      data = {
        ...data,
        meta: {
          ...(data.meta ?? {}),
          source: "ledger_live",
        },
      };
    }
    scoreboardCache = { atMs: now, data, source: "ledger_live" };
    return { data, source: "ledger_live" };
  } catch {
    const data = await loadCommittedFallback();
    scoreboardCache = { atMs: now, data, source: "committed_fallback" };
    return { data, source: "committed_fallback" };
  }
}

async function stampProdReadAt(
  req: FastifyRequest,
): Promise<{ prodReadAt: string; prodReadSource: "neon_now" | "request_time" }> {
  const uuid = req.user?.uuid;
  if (uuid) {
    try {
      const t = await withCurrentUser(uuid, async (client) => {
        const r = await client.query<{ t: Date }>("SELECT now() AS t");
        return r.rows[0]?.t ?? null;
      });
      const label = formatCt(t);
      if (label) return { prodReadAt: label, prodReadSource: "neon_now" };
    } catch {
      /* fall through — never 500 the board for a stamp failure */
    }
  }
  return { prodReadAt: formatCt(new Date()) || "—", prodReadSource: "request_time" };
}

function ensureGateTally(data: ScoreboardPayload): Record<string, unknown> {
  const existing = data.meta?.gateTally;
  if (existing && typeof existing === "object") return existing as Record<string, unknown>;
  // Fallback path: compute from modules if the live script didn't attach gateTally.
  const modules = Array.isArray(data.modules) ? (data.modules as { cells?: string[] }[]) : [];
  const gates = ["A", "B", "C", "D", "E", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"];
  const out: Record<string, { pass: number; applicable: number; fail: number; unverified: number }> = {};
  for (let i = 0; i < gates.length; i++) {
    let pass = 0;
    let applicable = 0;
    let fail = 0;
    let unverified = 0;
    for (const m of modules) {
      const c = (m.cells?.[i] as string) || "UNV";
      if (c === "NA") continue;
      applicable += 1;
      if (c === "PASS") pass += 1;
      else if (c === "FAIL") fail += 1;
      else if (c === "UNV") unverified += 1;
    }
    out[gates[i]] = { pass, applicable, fail, unverified };
  }
  return out;
}

/**
 * PROG-CLASS-STALE — the by-class grid must be computed at REQUEST TIME from the wave queue.
 *
 * It used to render from `apps/frontend/src/pages/program/classScoreboard.data.ts`, a TS module
 * generated by `scripts/gen-class-scoreboard.mjs` and committed. That module can only change when
 * someone re-runs the generator AND the frontend is redeployed, so the grid silently drifted: on
 * 2026-08-07 the committed module described 26 classes while `docs/audit/wave-queue.json` held 31 —
 * CLS-CALENDAR and CLS-JOIN-ENTITY-UNSCOPED were absent from the board entirely, and the queue's
 * `draining` classes were not represented at all. `verify-class-scoreboard-fresh.mjs` catches exactly
 * that drift and was RED, but it is not wired into a verify-step, so the drift shipped.
 *
 * Reading the queue here puts the grid on the SAME 3s poll the rest of this payload already uses, so
 * a class status change reaches an open board without a deploy. The generated module stays as the
 * offline fallback only, and the page labels it as such rather than presenting it as live.
 *
 * COLOUR LAW (owner-stated 2026-08-07, and it wins over the generator's older mapping):
 *   drained → green · draining/in-progress → amber · open/not-started → neutral · blocked → red.
 * The previous mapping painted 12 OPEN classes red for "live defect", which spends the one colour
 * reserved for blocked on the ordinary backlog state. The live-defect signal is not lost — it is
 * carried as a separate `liveDefect` flag so the cell can mark it without hijacking the palette.
 */
const WAVE_QUEUE_JSON = path.join(REPO_ROOT, "docs/audit/wave-queue.json");

type ClassCell = { code: "CC" | "BB" | "NN" | "XX"; tone: "green" | "amber" | "grey" | "red"; label: string };

export function classCellFor(status: string): ClassCell {
  switch (status.trim().toLowerCase()) {
    case "drained":
      return { code: "CC", tone: "green", label: "drained" };
    case "draining":
    case "in_progress":
    case "in progress":
      return { code: "BB", tone: "amber", label: "in progress" };
    case "blocked":
      return { code: "XX", tone: "red", label: "blocked" };
    default:
      return { code: "NN", tone: "grey", label: "not started" };
  }
}

export function readClassScoreboardFromQueue(): {
  meta: { generatedAt: string; source: string };
  summary: { total: number; drained: number; building: number; notStarted: number; liveDefect: number; drainedWithoutGuard: number };
  rows: Array<Record<string, unknown>>;
} | null {
  try {
    const parsed = JSON.parse(readFileSync(WAVE_QUEUE_JSON, "utf8")) as { waves?: unknown };
    if (!Array.isArray(parsed.waves)) return null;
    const rows = parsed.waves.map((raw) => {
      const w = (raw ?? {}) as Record<string, unknown>;
      const status = String(w.status ?? "");
      const cell = classCellFor(status);
      const guard = typeof w.guard === "string" && w.guard ? w.guard : null;
      const instances = Array.isArray(w.instances) ? w.instances.length : 0;
      const drainProof = (w.drain_proof ?? {}) as Record<string, unknown>;
      return {
        id: String(w.id ?? ""),
        lane: String(w.lane ?? "—"),
        layer: String(w.layer ?? "—"),
        status: status || "—",
        code: cell.code,
        tone: cell.tone,
        label: cell.label,
        instances,
        modules: Array.isArray(w.modules) ? w.modules.length : 0,
        guard,
        // Existence only, and only meaningful for a DRAINED class: a drained class whose named guard
        // file is absent is a registry defect, not proof the class is unguarded.
        guardMissing: cell.code === "CC" && guard != null && !existsSync(path.join(REPO_ROOT, guard)),
        guardNearMatch: null,
        // A DRAINED class that was money-critical is no longer a live defect — it is a drained one.
        liveDefect: cell.code !== "CC" && drainProof.money_critical === true,
      };
    });
    const by = (code: string) => rows.filter((r) => r.code === code).length;
    return {
      meta: { generatedAt: new Date().toISOString(), source: "docs/audit/wave-queue.json (request-time)" },
      summary: {
        total: rows.length,
        drained: by("CC"),
        building: by("BB"),
        notStarted: by("NN"),
        liveDefect: rows.filter((r) => r.liveDefect).length,
        drainedWithoutGuard: rows.filter((r) => r.code === "CC" && r.guardMissing).length,
      },
      rows,
    };
  } catch {
    return null;
  }
}

export async function registerAuditScoreboardRoutes(app: FastifyInstance) {
  // CodeQL js/missing-rate-limiting: auth + filesystem/GitHub/Neon stamp must be rate-limited.
  app.get(
    "/api/v1/program/audit-scoreboard",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return;
      try {
        const { data, source } = await loadScoreboardPayload();
        const generatedAt = typeof data.meta?.generatedAt === "string" ? data.meta.generatedAt : null;
        // Last synced = ledger commit time (meta.generatedAt), never wall clock.
        const lastSyncedCt = formatCt(generatedAt) || null;
        const { prodReadAt, prodReadSource } = await stampProdReadAt(req);
        const gateTally = ensureGateTally(data);
        const recentActivity = await loadRecentActivityFromGitHub(10);
        const classScoreboard = readClassScoreboardFromQueue();
        // 60s here would cap the by-class grid's reactivity at 60s no matter how fast the page polls.
        // The queue read is a single small JSON parse, so it is cheap enough to serve fresh.
        reply.header("cache-control", "no-store");
        return reply.send({
          ...data,
          meta: {
            ...(data.meta ?? {}),
            source,
            lastSyncedCt,
            prodReadAt,
            prodReadSource,
            gateTally,
          },
          recentActivity,
          classScoreboard,
        });
      } catch {
        // Missing/unreadable everything → 204 so the frontend falls back to its committed seed data.
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
