// Program Tracker service — NON-FINANCIAL, READ-ONLY internal tooling. Computes the Build-Progress view
// LIVE at request time from the DEPLOYED repo artifacts (no DB writes, no accounting/catalogs/mdata):
//   • docs/trackers/program-phase-manifest.json  — authored MASTER-6 sequence → the 8 phases (denominator).
//   • docs/trackers/block-reconciliation-data.json — reconcile:blocks per-block status + real timestamps +
//     live_state (the LIVE registry rollup). This is the status source of truth.
//   • db/migrations/.held-migrations.json — open build-and-hold migration count.
// EVERY count is derived here at request time — nothing is stored/frozen. A newly-registered block appears
// in the right tab + increments the right count on the next refresh, no manual edit. Honest failure (§0):
// unreadable manifest/reconcile → THROW (route 503s, page shows an error state, never stale numbers).
// Timestamps are always real (from the registry) or null → "—"; never now()/fabricated.

import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";
import { resolveBackendVersion } from "../health/health.routes.js";

const ROOT = resolveMonorepoRoot(import.meta.url);
function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
}
function normId(s: string): string {
  return String(s).replace(/_(DISPATCH|VERIFY|SUPERSEDED|LIKELY-STALE|STALE|DUP|DUPLICATE|DONE)$/i, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

type ManifestBlock = { id: string; registered: boolean; block_ready_key?: string };
type ManifestPhase = { n: number; key: string; label: string; authored_total: number; blocks: ManifestBlock[] };
type Manifest = { authored_total: number; registered_total: number; not_registered_total: number; phases: ManifestPhase[] };
type ReconBlock = { id: string; status: string; name?: string; fin?: boolean; pr?: number | null; live_state?: string | null; merged_at?: string | null; merged_ct?: string | null; deployed_ct?: string | null; synced_at?: string | null };
type Recon = { counts?: Record<string, number>; blocks?: ReconBlock[]; merged_prs?: { number: number; title: string; mergedAt?: string }[]; merged_pr_total?: number };

export type Tab = "pending" | "in_progress" | "completed" | "not_counted";

export type TrackerBlockRow = {
  id: string;
  name: string;
  phase: string | null;
  status: string; // raw registry status
  tab: Tab;
  live_verified: boolean; // done AND merged+deployed — the ONLY path into Completed
  pr: number | null;
  last_changed_at: string | null; // ISO real registry change time; never faked
  last_changed_ct: string | null; // CT display string from the registry when present
  completed_at: string | null; // ISO merged/deployed time when live-verified, else null
  completed_ct: string | null; // CT display string
  financial: boolean;
};

export type TrackerPhase = {
  n: number;
  key: string;
  label: string;
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  not_counted: number;
  status: "done" | "in-progress" | "awaiting-owner" | "queued";
};

export type ProgramTracker = {
  generated_at: string;
  deployed_sha: string;
  source: string;
  authored_total: number;
  registered_total: number;
  not_registered_total: number;
  held_migrations_open: number;
  merged_pr_total: number;
  recent_merged: { number: number; title: string; mergedAt: string | null }[];
  phases: TrackerPhase[];
  views: { pending: TrackerBlockRow[]; in_progress: TrackerBlockRow[]; completed: TrackerBlockRow[]; not_counted: TrackerBlockRow[] };
  view_counts: { pending: number; in_progress: number; completed: number; not_counted: number };
};

function countHeld(): number {
  try {
    const held = readJson("db/migrations/.held-migrations.json") as unknown;
    if (Array.isArray(held)) return held.length;
    if (held && typeof held === "object") {
      const arr = (held as Record<string, unknown>).migrations ?? (held as Record<string, unknown>).held;
      if (Array.isArray(arr)) return arr.length;
    }
  } catch { /* ignore */ }
  return 0;
}

// Status → tab (owner mapping): superseded/duplicate excluded (not_counted); "done" counts as completed
// ONLY when it is ALSO live-verified (merged + deployed) — a bare "done" without live proof stays in_progress.
function classify(statusRaw: string, liveVerified: boolean): Tab {
  const s = statusRaw.toLowerCase();
  if (s.includes("supersed") || s.includes("dup")) return "not_counted";
  if (s === "done" || s === "ready" || s === "built") return liveVerified ? "completed" : "in_progress";
  if (s.includes("partial") || s.includes("needs-verify") || s.includes("verify") || s === "in-progress") return "in_progress";
  return "pending"; // pending / build / to-build / gated / unknown → not started
}

export function computeProgramTracker(now: Date): ProgramTracker {
  const manifest = readJson("docs/trackers/program-phase-manifest.json") as Manifest;
  const recon = readJson("docs/trackers/block-reconciliation-data.json") as Recon;

  const phaseByNorm = new Map<string, string>();
  for (const p of manifest.phases) for (const b of p.blocks) phaseByNorm.set(normId(b.id), p.key);

  // Real merge timestamps by PR number, from the git-derived merged-PR spine (never fabricated).
  const mergedAtByPr = new Map<number, string>();
  for (const p of recon.merged_prs ?? []) if (typeof p.number === "number" && p.mergedAt) mergedAtByPr.set(p.number, p.mergedAt);

  const rows: TrackerBlockRow[] = (recon.blocks ?? []).map((b) => {
    const isDone = String(b.status).toUpperCase() === "DONE";
    // Merge to main IS the prod deploy (§1.1), so a merged PR is the live-verified proof. Accept an explicit
    // live_state=deployed too. A bare "done" with NO merged PR is NOT live-verified → stays In Progress.
    const liveVerified = isDone && (b.pr != null || b.live_state === "deployed");
    const prMergedAt = b.pr != null ? mergedAtByPr.get(b.pr) ?? null : null;
    const mergedAt = b.merged_at ?? prMergedAt ?? null;
    return {
      id: b.id,
      name: String(b.name ?? b.id).slice(0, 200),
      phase: phaseByNorm.get(normId(b.id)) ?? null,
      status: String(b.status),
      tab: classify(String(b.status), liveVerified),
      live_verified: liveVerified,
      pr: b.pr ?? null,
      last_changed_at: mergedAt ?? b.synced_at ?? null,
      last_changed_ct: b.merged_ct ?? null,
      completed_at: liveVerified ? mergedAt : null,
      completed_ct: liveVerified ? b.deployed_ct ?? b.merged_ct ?? null : null,
      financial: Boolean(b.fin),
    };
  });

  const views = { pending: [] as TrackerBlockRow[], in_progress: [] as TrackerBlockRow[], completed: [] as TrackerBlockRow[], not_counted: [] as TrackerBlockRow[] };
  for (const r of rows) views[r.tab].push(r);
  views.completed.sort((a, b) => String(b.completed_at ?? "").localeCompare(String(a.completed_at ?? "")));
  const byPhaseId = (a: TrackerBlockRow, b: TrackerBlockRow) => String(a.phase ?? "zz").localeCompare(String(b.phase ?? "zz")) || a.id.localeCompare(b.id);
  views.pending.sort(byPhaseId);
  views.in_progress.sort(byPhaseId);
  views.not_counted.sort(byPhaseId);

  // Per-phase live rollup — classify each authored manifest block via the registry status map.
  const heldOpen = countHeld();
  const reconByNorm = new Map<string, ReconBlock>();
  for (const b of recon.blocks ?? []) reconByNorm.set(normId(b.id), b);
  const phases: TrackerPhase[] = manifest.phases.map((p) => {
    let pending = 0, inProg = 0, completed = 0, notCounted = 0;
    for (const blk of p.blocks) {
      const rb = reconByNorm.get(normId(blk.id));
      const status = rb ? String(rb.status) : "pending";
      const lv = rb ? String(rb.status).toUpperCase() === "DONE" && (rb.pr != null || rb.live_state === "deployed") : false;
      const t = classify(status, lv);
      if (t === "completed") completed++;
      else if (t === "in_progress") inProg++;
      else if (t === "not_counted") notCounted++;
      else pending++;
    }
    const isHeldFk = p.key === "held-fk";
    const total = isHeldFk ? heldOpen : p.authored_total;
    let status: TrackerPhase["status"];
    if (isHeldFk) status = heldOpen > 0 ? "awaiting-owner" : "done";
    else if (total > 0 && completed >= total) status = "done";
    else if (inProg > 0 || completed > 0) status = "in-progress";
    else status = "queued";
    return { n: p.n, key: p.key, label: p.label, total, pending, in_progress: inProg, completed, not_counted: notCounted, status };
  });

  return {
    generated_at: now.toISOString(),
    deployed_sha: resolveBackendVersion(),
    source: "block registry (.block-ready via reconcile:blocks) + authored phase manifest (MASTER-6)",
    authored_total: manifest.authored_total,
    registered_total: manifest.registered_total,
    not_registered_total: manifest.not_registered_total,
    held_migrations_open: heldOpen,
    merged_pr_total: recon.merged_pr_total ?? (recon.merged_prs?.length ?? 0),
    recent_merged: (recon.merged_prs ?? []).slice(0, 12).map((p) => ({ number: p.number, title: p.title, mergedAt: p.mergedAt ?? null })),
    phases,
    views,
    view_counts: { pending: views.pending.length, in_progress: views.in_progress.length, completed: views.completed.length, not_counted: views.not_counted.length },
  };
}
