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

import { execSync, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Deployed SHA is CONSTANT for a process lifetime, so running git per request was pure waste on
 * the event loop. Render supplies RENDER_GIT_COMMIT, so git normally never runs at all.
 */
let tipShaMemo: string | undefined | null = null;
export function resolveTipShaCached(): string | undefined {
  if (tipShaMemo !== null) return tipShaMemo;
  const env = String(process.env.RENDER_GIT_COMMIT ?? process.env.GITHUB_SHA ?? "").trim();
  if (env) {
    tipShaMemo = env.slice(0, 9);
    return tipShaMemo;
  }
  try {
    tipShaMemo = execSync("git rev-parse --short HEAD", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3_000,
    }).trim();
  } catch {
    tipShaMemo = undefined;
  }
  return tipShaMemo;
}
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";
import { resolveClientIp } from "../config/client-ip.js";

/**
 * PROD-OUTAGE-MATRIX-POLL-STORM (2026-08-21): a hard, self-contained per-IP cap on the
 * expensive scoreboard projections.
 *
 * Six agent-driven browsers left open on the matrix page drove ~71 req/s of a 223 KB payload
 * (~15 MB/s) at production. That starved the Node event loop, so the trivial
 * `/api/v1/_healthcheck` (which only returns {status:"ok"}) took 25.9s against Render's 5s
 * timeout. Render SIGTERM-killed every instance (29 server_failed, nonZeroExit 143,
 * evicted:false = not OOM) and the API was down for hours.
 *
 * These routes ALREADY declare `config: { rateLimit: { max: 60, timeWindow: "1 minute" } }`,
 * but that never fired: 150 parallel requests against the deployed service returned 150
 * responses and ZERO 429s. Until that plugin-level failure is root-caused separately, the
 * endpoint that can take production down must not depend on it. This gate is in the handler,
 * so it cannot be bypassed by plugin encapsulation or hook-ordering.
 *
 * Normal cost: the page polls every 30s => 2 req/min. 20/min leaves 10x headroom for a human
 * reloading, while capping a runaway client at 20/min instead of 4,260/min.
 */
const MATRIX_MAX_PER_MIN = 20;
const MATRIX_WINDOW_MS = 60_000;
const matrixHits = new Map<string, { count: number; windowStart: number }>();

function matrixThrottleExceeded(ip: string, now: number): boolean {
  // Bound the map so a spoofed-header flood cannot grow it without limit.
  if (matrixHits.size > 5_000) {
    for (const [k, v] of matrixHits) {
      if (now - v.windowStart > MATRIX_WINDOW_MS) matrixHits.delete(k);
    }
  }
  const cur = matrixHits.get(ip);
  if (!cur || now - cur.windowStart >= MATRIX_WINDOW_MS) {
    matrixHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  cur.count += 1;
  return cur.count > MATRIX_MAX_PER_MIN;
}

/** Exported for the guard/selftest. */
export function __matrixThrottleForTest(ip: string, now: number): boolean {
  return matrixThrottleExceeded(ip, now);
}
import { formatCt } from "./program-board.service.js";
import { buildModuleMatrix, buildSystemModuleMatrix } from "./module-matrix.service.js";

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
const RECENT_CACHE_MS = 3_000;
const SCOREBOARD_CACHE_MS = 3_000;
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

export type RecentActivitySource = "git_log" | "github" | "ledger_committed";

type RecentCache = { atMs: number; items: RecentPr[]; source: RecentActivitySource };
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
async function readRecentActivityFromLedger(limit: number): Promise<RecentPr[]> {
  // Resolve through SCOREBOARD_JSON (REPO_ROOT + docs/audit/program-scoreboard.json), the SAME
  // constant the fallback payload loader already uses. Guessing relative paths off process.cwd()
  // would be a second, divergent path resolution in one file: the backend's cwd is whatever the
  // Render start command sets, so a cwd-relative read can miss the artifact that resolveMonorepoRoot
  // finds — and this function fails SILENTLY to [], which is precisely the empty-panel state the
  // finding is about. One resolution, or the two drift apart.
  // PROD-API-INTERMITTENT-502-BURST-STILL-RECURRING — was readFileSync; a sync fs call blocks the
  // whole event loop for every request being served, not just this one.
  try {
    const parsed = JSON.parse(await readFile(SCOREBOARD_JSON, "utf8")) as { recentActivity?: unknown };
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

/**
 * Request-time `git log` — same shape as scripts/audit-coverage-scoreboard.mjs ledgerRecentActivity,
 * but computed NOW so the panel moves when main moves (no waiting for a scoreboard JSON regenerate).
 */
/**
 * PROD-OUTAGE-EXECSYNC-EVENT-LOOP-BLOCK (2026-08-21): this used to run `git log` with execSync
 * INSIDE the request handler. execSync blocks the entire Node event loop — while it runs, no other
 * request can be served, including the trivial GET /api/v1/_healthcheck (`return {status:"ok"}`).
 * Its own `timeout: 8_000` guaranteed the failure: an 8s block against Render's 5s health-check
 * timeout. Render marked every instance unhealthy and SIGTERM-killed it (nonZeroExit 143,
 * evicted:false = not OOM), producing hours of 502s with ZERO application error logs and ZERO
 * database activity — because requests never got far enough to touch either.
 *
 * The git call now runs OFF the request path: the handler returns whatever is cached and kicks a
 * background refresh at most once per TTL. Nothing on the hot path blocks the loop.
 */
const RECENT_GIT_TTL_MS = 60_000;
let recentGitCache: { atMs: number; items: RecentPr[] } = { atMs: 0, items: [] };
let recentGitRefreshing = false;

function parseGitLogRecent(raw: string, limit: number): RecentPr[] {
  const SEP = "\u001f";
  const items: RecentPr[] = [];
  for (const line of raw.split("\n")) {
    const [sha, iso, ...rest] = line.split(SEP);
    if (!sha) continue;
    const subject = rest.join(SEP);
    const m = /\(#(\d+)\)\s*$/.exec(subject || "");
    const number = m ? Number(m[1]) : 0;
    items.push({
      number,
      title: (subject || "").replace(/\s*\(#\d+\)\s*$/, "").trim() || sha,
      state: "merged",
      mergedAtCt: formatCt(iso) || "—",
      url: number ? `https://github.com/tioperfumes07/IH35-TMS/pull/${number}` : "",
    });
    if (items.length >= limit) break;
  }
  return items;
}

/** Non-blocking: spawns git asynchronously, never on the request path. */
function refreshRecentGitCache(limit: number): void {
  if (recentGitRefreshing) return;
  if (Date.now() - recentGitCache.atMs < RECENT_GIT_TTL_MS) return;
  recentGitRefreshing = true;
  const SEP = "\u001f";
  void (async () => {
    try {
      for (const ref of ["origin/main", "HEAD"]) {
        try {
          const { stdout } = await execFileAsync(
            "git",
            ["log", ref, "-n", String(Math.max(limit, 10)), `--format=%h${SEP}%cI${SEP}%s`],
            { cwd: REPO_ROOT, encoding: "utf8", timeout: 8_000, maxBuffer: 4 * 1024 * 1024 },
          );
          const raw = String(stdout).trim();
          if (raw) {
            recentGitCache = { atMs: Date.now(), items: parseGitLogRecent(raw, Math.max(limit, 10)) };
            return;
          }
        } catch {
          /* shallow / missing ref — try next */
        }
      }
      // Nothing usable: stamp the attempt so we do not respawn git on every request.
      recentGitCache = { atMs: Date.now(), items: recentGitCache.items };
    } finally {
      recentGitRefreshing = false;
    }
  })();
}

export function readRecentActivityFromGitLog(limit = 10): RecentPr[] {
  refreshRecentGitCache(limit);
  return recentGitCache.items.slice(0, limit);
}

async function fetchRecentActivityFromGitHubApi(limit: number): Promise<RecentPr[]> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), GITHUB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(GITHUB_PULLS_URL, { headers: githubHeaders(), signal: ac.signal });
    if (!res.ok) return [];
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) return [];
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
    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * PROG-PRFEED-STALE-LEDGER (2026-08-08) — committed program-scoreboard.json recentActivity was
 * preferred whenever non-empty, so the panel froze at ~#4776 while main advanced past #4850.
 *
 * Order (live first; empty panel only if every source fails):
 *   1. request-time `git log` (no token; works on private repos; moves with the deploy tip)
 *   2. GitHub pulls API (token when present)
 *   3. committed ledger artifact — LAST, and labeled stale so it cannot pass as live
 *
 * Empty GitHub must never win over a populated git log. A non-empty stale ledger must never block
 * (1) or (2).
 */
export async function loadRecentActivityFromGitHub(
  limit = 10,
): Promise<{ items: RecentPr[]; source: RecentActivitySource }> {
  const now = Date.now();
  if (recentCache && now - recentCache.atMs < RECENT_CACHE_MS) {
    return { items: recentCache.items.slice(0, limit), source: recentCache.source };
  }

  const fromGit = readRecentActivityFromGitLog(limit);
  if (fromGit.length > 0) {
    recentCache = { atMs: now, items: fromGit, source: "git_log" };
    return { items: fromGit.slice(0, limit), source: "git_log" };
  }

  const fromGh = await fetchRecentActivityFromGitHubApi(limit);
  if (fromGh.length > 0) {
    recentCache = { atMs: now, items: fromGh, source: "github" };
    return { items: fromGh.slice(0, limit), source: "github" };
  }

  const ledger = await readRecentActivityFromLedger(limit);
  recentCache = { atMs: now, items: ledger, source: "ledger_committed" };
  return { items: ledger.slice(0, limit), source: "ledger_committed" };
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
  const modules = Array.isArray(data.modules) ? (data.modules as { cells?: string[]; cellsByEntity?: Record<string, string[]> }[]) : [];
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

function ensureGateTallyByEntity(data: ScoreboardPayload): Record<string, unknown> {
  const existing = data.meta?.gateTallyByEntity;
  if (existing && typeof existing === "object") return existing as Record<string, unknown>;
  const modules = Array.isArray(data.modules)
    ? (data.modules as { cells?: string[]; cellsByEntity?: Record<string, string[]> }[])
    : [];
  const gates = ["A", "B", "C", "D", "E", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"];
  const ents = ["TRANSP", "USMCA"];
  const out: Record<string, Record<string, { pass: number; applicable: number; fail: number; unverified: number }>> = {};
  for (const ent of ents) {
    out[ent] = {};
    for (let i = 0; i < gates.length; i++) {
      let pass = 0;
      let applicable = 0;
      let fail = 0;
      let unverified = 0;
      for (const m of modules) {
        const cells = m.cellsByEntity?.[ent] ?? m.cells ?? [];
        const c = (cells[i] as string) || "UNV";
        if (c === "NA") continue;
        applicable += 1;
        if (c === "PASS") pass += 1;
        else if (c === "FAIL") fail += 1;
        else if (c === "UNV") unverified += 1;
      }
      out[ent][gates[i]] = { pass, applicable, fail, unverified };
    }
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

/**
 * Owner 2026-08-08: individual CLS columns must be REAL — a queue row saying "drained" is not
 * green until the named guard file exists on disk. Otherwise amber + guardMissing (tracker theater).
 */
export function classCellVerified(
  status: string,
  guard: string | null,
  guardExists: boolean,
): ClassCell & { guardMissing: boolean } {
  const base = classCellFor(status);
  if (base.code !== "CC") {
    return { ...base, guardMissing: false };
  }
  if (!guard || !guardExists) {
    return {
      code: "BB",
      tone: "amber",
      label: guard ? "drained — guard missing on disk" : "drained — no guard named",
      guardMissing: true,
    };
  }
  return { ...base, guardMissing: false };
}

/**
 * Owner 2026-08-08: matrix ROWS = each sidebar module, excluding chrome stubs
 * (eld / help / program / system) → 26 rows. Columns = each CLS wave.
 */
export const PROGRAM_MATRIX_MODULE_IDS = [
  "home",
  "tasks",
  "fuel",
  "dispatch",
  "driver-hub",
  "maintenance",
  "safety",
  "compliance",
  "drivers",
  "fleet",
  "insurance",
  "legal",
  "cash-flow",
  "settlements",
  "accounting",
  "bank",
  "factoring",
  "finance",
  "customers",
  "vendors",
  "inventory",
  "form_425",
  "lists",
  "reports",
  "docs",
  "users",
] as const;

/** Wave-queue module tags → sidebar matrix row id (aliases only; never invent membership). */
const WAVE_MODULE_TO_ROW: Record<string, (typeof PROGRAM_MATRIX_MODULE_IDS)[number] | null> = {
  home: "home",
  tasks: "tasks",
  fuel: "fuel",
  dispatch: "dispatch",
  "driver-hub": "driver-hub",
  maintenance: "maintenance",
  safety: "safety",
  compliance: "compliance",
  drivers: "drivers",
  fleet: "fleet",
  insurance: "insurance",
  legal: "legal",
  "cash-flow": "cash-flow",
  settlements: "settlements",
  driver_finance: "settlements",
  accounting: "accounting",
  bank: "bank",
  banking: "bank",
  factoring: "factoring",
  finance: "finance",
  customers: "customers",
  vendors: "vendors",
  inventory: "inventory",
  form_425: "form_425",
  lists: "lists",
  catalogs: "lists",
  reports: "reports",
  docs: "docs",
  users: "users",
  // Not matrix rows (chrome / stubs) — map to null so they never fabricate a cell.
  eld: null,
  help: null,
  program: null,
  system: null,
};

export function waveModulesTouchRow(waveModules: unknown, rowId: string): boolean {
  if (!Array.isArray(waveModules) || waveModules.length === 0) return false;
  for (const raw of waveModules) {
    const key = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    const mapped = WAVE_MODULE_TO_ROW[key];
    if (mapped === rowId) return true;
  }
  return false;
}

export type ClassMatrixCell = {
  code: "CC" | "BB" | "NN" | "XX" | "NA";
  tone: "green" | "amber" | "grey" | "red" | "na";
  label: string;
  guardMissing: boolean;
};

/**
 * Module × CLS matrix from the live queue. Cell is NA unless the wave names that module
 * (after alias map). Status/tone come from classCellVerified — never invented tracker state.
 */
export function buildClassModuleMatrix(
  classRows: Array<Record<string, unknown>>,
  moduleIds: readonly string[] = PROGRAM_MATRIX_MODULE_IDS,
): {
  modules: string[];
  classIds: string[];
  cells: ClassMatrixCell[][];
} {
  const classIds = classRows.map((r) => String(r.id ?? ""));
  const cells = moduleIds.map((mod) =>
    classRows.map((r) => {
      const touches = waveModulesTouchRow(r.moduleIds, mod);
      if (!touches) {
        return { code: "NA" as const, tone: "na" as const, label: "n/a", guardMissing: false };
      }
      return {
        code: (r.code as ClassMatrixCell["code"]) || "NN",
        tone: (r.tone as ClassMatrixCell["tone"]) || "grey",
        label: String(r.label ?? r.status ?? ""),
        guardMissing: Boolean(r.guardMissing),
      };
    }),
  );
  return { modules: [...moduleIds], classIds, cells };
}

// PROD-API-INTERMITTENT-502-BURST-STILL-RECURRING — was readFileSync + a per-row existsSync
// inside the map (a sync fs call blocks the whole event loop for every request being served, not
// just this one). The read is now async; per-row guard existence checks resolve up front via
// Promise.all so the row-building map itself stays synchronous (pure, no async callback needed).
export async function readClassScoreboardFromQueue(): Promise<{
  meta: { generatedAt: string; source: string; columnCount: number; rowCount: number };
  summary: { total: number; drained: number; building: number; notStarted: number; liveDefect: number; drainedWithoutGuard: number };
  rows: Array<Record<string, unknown>>;
  matrix: ReturnType<typeof buildClassModuleMatrix>;
} | null> {
  try {
    const parsed = JSON.parse(await readFile(WAVE_QUEUE_JSON, "utf8")) as { waves?: unknown };
    if (!Array.isArray(parsed.waves)) return null;
    const waves = parsed.waves;
    const guardExistsByIndex = await Promise.all(
      waves.map(async (raw) => {
        const w = (raw ?? {}) as Record<string, unknown>;
        const guard = typeof w.guard === "string" && w.guard ? w.guard : null;
        if (!guard) return false;
        return access(path.join(REPO_ROOT, guard))
          .then(() => true)
          .catch(() => false);
      }),
    );
    const rows = waves.map((raw, i) => {
      const w = (raw ?? {}) as Record<string, unknown>;
      const status = String(w.status ?? "");
      const guard = typeof w.guard === "string" && w.guard ? w.guard : null;
      const guardExists = guard != null && guardExistsByIndex[i];
      const cell = classCellVerified(status, guard, guardExists);
      const instances = Array.isArray(w.instances) ? w.instances.length : 0;
      const drainProof = (w.drain_proof ?? {}) as Record<string, unknown>;
      const queueClaimsDrained = status.trim().toLowerCase() === "drained";
      const moduleIds = Array.isArray(w.modules) ? w.modules.map((m) => String(m)) : [];
      return {
        id: String(w.id ?? ""),
        lane: String(w.lane ?? "—"),
        layer: String(w.layer ?? "—"),
        status: status || "—",
        code: cell.code,
        tone: cell.tone,
        label: cell.label,
        instances,
        modules: moduleIds.length,
        moduleIds,
        guard,
        guardMissing: cell.guardMissing,
        guardNearMatch: null,
        // Money-critical still open, OR queue claimed drained without a verifiable guard file.
        liveDefect:
          (cell.code !== "CC" && drainProof.money_critical === true) ||
          (queueClaimsDrained && cell.guardMissing),
      };
    });
    const by = (code: string) => rows.filter((r) => r.code === code).length;
    const matrix = buildClassModuleMatrix(rows);
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        source: "docs/audit/wave-queue.json (request-time)",
        columnCount: rows.length,
        rowCount: matrix.modules.length,
      },
      summary: {
        total: rows.length,
        drained: by("CC"),
        building: by("BB"),
        notStarted: by("NN"),
        liveDefect: rows.filter((r) => r.liveDefect).length,
        drainedWithoutGuard: rows.filter((r) => r.guardMissing).length,
      },
      rows,
      matrix,
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
      if (!requireAuth(req, reply)) return reply;
      try {
        const { data, source } = await loadScoreboardPayload();
        const generatedAt = typeof data.meta?.generatedAt === "string" ? data.meta.generatedAt : null;
        // Last synced = ledger commit time (meta.generatedAt), never wall clock.
        const lastSyncedCt = formatCt(generatedAt) || null;
        const { prodReadAt, prodReadSource } = await stampProdReadAt(req);
        const gateTally = ensureGateTally(data);
        const gateTallyByEntity = ensureGateTallyByEntity(data);
        const recent = await loadRecentActivityFromGitHub(10);
        const classScoreboard = await readClassScoreboardFromQueue();
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
            gateTallyByEntity,
            boardEntities: ["TRANSP", "USMCA"],
            recentActivitySource: recent.source,
          },
          recentActivity: recent.items,
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
      if (!requireAuth(req, reply)) return reply;
      const recent = await loadRecentActivityFromGitHub(10);
      reply.header("cache-control", "public, max-age=60");
      return reply.send({
        items: recent.items,
        zone: "America/Chicago",
        label: "CT",
        source: recent.source,
      });
    },
  );

  // MATRIX-LIVE-RAD — Audited/Done projection for /program/matrix (not SAMPLE).
  app.get(
    "/api/v1/program/module-matrix",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return reply;
      const clientIp = resolveClientIp(req as never);
      if (matrixThrottleExceeded(clientIp, Date.now())) {
        reply.header("retry-after", "60");
        return reply.code(429).send({
          error: "rate_limited",
          message:
            "Module matrix is capped at 20 requests per minute per client. Close duplicate/automated tabs; the board polls every 30s.",
        });
      }
      const q = (req.query ?? {}) as { module?: unknown; scope?: unknown };
      const scope = typeof q.scope === "string" ? q.scope.trim().toLowerCase() : "";
      if (scope === "system" || scope === "all") {
        try {
          const payload = await buildSystemModuleMatrix(req.user?.uuid);
          reply.header("cache-control", "no-store");
          return reply.send({
            ...payload,
            meta: {
              ...payload.meta,
              prodReadAt: formatCt(new Date()) || "—",
              prodReadSource: "request_time",
            },
          });
        } catch (err) {
          req.log?.error?.({ err }, "[program] module-matrix system rollup failed");
          let tip: string | undefined;
          try {
            tip = resolveTipShaCached();
          } catch {
            tip = undefined;
          }
          return reply.code(503).send({
            error: "module_matrix_system_unavailable",
            message: err instanceof Error ? err.message : "Could not project system-wide matrix rollup",
            tipSha: tip,
          });
        }
      }
      const moduleId =
        typeof q.module === "string" && q.module.trim() ? q.module.trim().toLowerCase() : "maintenance";
      const SUPPORTED = new Set([
        "maintenance",
        "safety",
        "insurance",
        "legal",
        "accounting",
        "banking",
        "dispatch",
        "settlements",
        "fuel",
        "drivers",
        "fleet",
        "customers",
        "vendors",
        "lists",
        "factoring",
        "reports",
        "inventory",
        "compliance",
        "cash-flow",
        "home",
        "program",
        "tasks",
        "form_425",
        "finance",
        "docs",
        "system",
        "users",
        "help",
        "driver-hub",
      ]);
      if (!SUPPORTED.has(moduleId)) {
        return reply.code(400).send({
          error: "unsupported_module",
          message: `module-matrix supports module=maintenance|safety|insurance|legal|accounting|banking|dispatch|settlements|fuel|drivers|fleet|customers|vendors|lists|factoring|reports|inventory|compliance|cash-flow|home|program|tasks|form_425|finance|docs|system|users|help|driver-hub`,
        });
      }
      try {
        const payload = await buildModuleMatrix(moduleId, req.user?.uuid);
        const { prodReadAt, prodReadSource } = await stampProdReadAt(req);
        reply.header("cache-control", "no-store");
        return reply.send({
          ...payload,
          meta: {
            ...payload.meta,
            prodReadAt,
            prodReadSource,
          },
        });
      } catch (err) {
        req.log?.error?.({ err }, "[program] module-matrix projection failed");
        return reply.code(503).send({
          error: "module_matrix_unavailable",
          message: "Could not project live Audited/Done — frontend must keep SAMPLE banner",
        });
      }
    },
  );
}
