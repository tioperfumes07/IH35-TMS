// Program Tracker service — NON-FINANCIAL, READ-ONLY internal tooling. Computes the Build-Progress view
// LIVE at request time from the DEPLOYED repo artifacts (no DB writes, no accounting/catalogs/mdata):
//   • docs/trackers/program-phase-manifest.json  — the authored MASTER-6 sequence mapped to the 8 phases
//     (+ per-block `registered` flag vs .block-ready). The DENOMINATOR / phase structure.
//   • docs/trackers/block-reconciliation-data.json — the LIVE registry rollup (reconcile:blocks output):
//     per-block status (DONE/PENDING/GATED/NEEDS-VERIFY) + merged PR list.
//   • db/migrations/.held-migrations.json — open build-and-hold migration count (phase-3 "Held FK").
// Numbers move automatically on every deploy because these files ship inside the build. Honest failure
// (§0): if the manifest or reconcile file is unreadable we THROW — the route returns an explicit error and
// the page shows an error state, NEVER stale/placeholder numbers.

import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";
import { resolveBackendVersion } from "../health/health.routes.js";

const ROOT = resolveMonorepoRoot(import.meta.url);

function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
}

function normId(s: string): string {
  return String(s).replace(/_(DISPATCH|VERIFY|SUPERSEDED|LIKELY-STALE)$/i, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

type ManifestBlock = { id: string; registered: boolean; block_ready_key?: string };
type ManifestPhase = { n: number; key: string; label: string; authored_total: number; registered_count: number; blocks: ManifestBlock[] };
type Manifest = { authored_total: number; registered_total: number; not_registered_total: number; phases: ManifestPhase[] };
type ReconBlock = { id: string; status: string; source?: string };
type Recon = {
  counts?: Record<string, number>;
  blocks?: ReconBlock[];
  merged_prs?: { number: number; title: string; mergedAt?: string; branch?: string }[];
  merged_pr_total?: number;
  hold_for_jorge?: unknown[];
};

export type TrackerPhase = {
  n: number;
  key: string;
  label: string;
  total: number; // authored in this phase
  registered: number; // authored blocks that map to a .block-ready entry
  done: number; // of the registered, how many reconcile marks DONE
  held: number; // build-and-hold (phase-3 = open held migrations)
  status: "done" | "in-progress" | "awaiting-owner" | "queued";
};

export type TrackerBlockRow = {
  id: string;
  name: string;
  phase: string | null;
  status: string;
  financial: boolean;
  pr: number | null;
  live_state: string | null;
  merged_at: string | null; // ISO — real, from the merge
  merged_ct: string | null; // Central-Time display string from the registry
  deployed_ct: string | null; // Central-Time display string when it went live
};

export type ProgramTracker = {
  generated_at: string;
  deployed_sha: string;
  source: string;
  authored_total: number;
  registered_total: number;
  not_registered_total: number;
  registry: { universe: number; done: number; pending: number; gated: number; needs_verify: number };
  held_migrations_open: number;
  merged_pr_total: number;
  recent_merged: { number: number; title: string; mergedAt: string | null }[];
  phases: TrackerPhase[];
  // Grouped per-block views for the tabs. "completed" = registry DONE AND live (deployed) — never false-done.
  views: { completed: TrackerBlockRow[]; in_progress: TrackerBlockRow[]; pending: TrackerBlockRow[] };
  view_counts: { completed: number; in_progress: number; pending: number };
};

function countHeldMigrations(): number {
  try {
    const held = readJson("db/migrations/.held-migrations.json") as unknown;
    if (Array.isArray(held)) return held.length;
    if (held && typeof held === "object") {
      const arr = (held as Record<string, unknown>).migrations ?? (held as Record<string, unknown>).held;
      if (Array.isArray(arr)) return arr.length;
    }
    return 0;
  } catch {
    return 0;
  }
}

export function computeProgramTracker(now: Date): ProgramTracker {
  // These two are REQUIRED — an unreadable file is an honest error, never a placeholder.
  const manifest = readJson("docs/trackers/program-phase-manifest.json") as Manifest;
  const recon = readJson("docs/trackers/block-reconciliation-data.json") as Recon;

  // Live DONE-id set from the registry (normalized) so per-phase "done" is computed, not stored.
  const doneNorm = new Set<string>();
  for (const b of recon.blocks ?? []) {
    if (String(b.status).toUpperCase() === "DONE") doneNorm.add(normId(b.id));
  }

  const heldOpen = countHeldMigrations();

  const phases: TrackerPhase[] = manifest.phases.map((p) => {
    const registered = p.blocks.filter((b) => b.registered).length;
    const done = p.blocks.filter((b) => b.registered && (doneNorm.has(normId(b.block_ready_key ?? b.id)) || doneNorm.has(normId(b.id)))).length;
    // Phase-3 (held-fk) has no authored manifest rows — it is the open held-migration queue itself.
    const isHeldFk = p.key === "held-fk";
    const total = isHeldFk ? heldOpen : p.authored_total;
    const held = isHeldFk ? heldOpen : 0;
    let status: TrackerPhase["status"];
    if (isHeldFk) status = heldOpen > 0 ? "awaiting-owner" : "done";
    else if (total > 0 && done >= total) status = "done";
    else if (done > 0 || registered > 0) status = "in-progress";
    else status = "queued";
    return { n: p.n, key: p.key, label: p.label, total, registered, done, held, status };
  });

  // Map each authored block-id (normalized) → phase key, so registry rows can show their phase.
  const phaseByNorm = new Map<string, string>();
  for (const p of manifest.phases) for (const b of p.blocks) phaseByNorm.set(normId(b.id), p.key);

  // Group the registry blocks into the 3 tab views from their LIVE status + live_state (real timestamps).
  const completed: TrackerBlockRow[] = [];
  const inProgress: TrackerBlockRow[] = [];
  const pending: TrackerBlockRow[] = [];
  for (const b of (recon.blocks ?? []) as (ReconBlock & Record<string, unknown>)[]) {
    const status = String(b.status ?? "").toUpperCase();
    const live = (b.live_state as string | undefined) ?? null;
    const row: TrackerBlockRow = {
      id: b.id,
      name: String((b as Record<string, unknown>).name ?? b.id).slice(0, 200),
      phase: phaseByNorm.get(normId(b.id)) ?? null,
      status,
      financial: Boolean((b as Record<string, unknown>).fin),
      pr: (b as Record<string, unknown>).pr as number | null ?? null,
      live_state: live,
      merged_at: ((b as Record<string, unknown>).merged_at as string | null) ?? null,
      merged_ct: ((b as Record<string, unknown>).merged_ct as string | null) ?? null,
      deployed_ct: ((b as Record<string, unknown>).deployed_ct as string | null) ?? null,
    };
    // COMPLETED = truly done AND live (deployed) — excludes "merged but not live" false-done.
    if (status === "DONE" && live === "deployed") completed.push(row);
    else if (status === "DONE" || status === "PARTIAL" || (live && ["merged", "waiting-merge", "in-ci", "ci-failed"].includes(live))) inProgress.push(row);
    else pending.push(row);
  }
  // Sort: completed newest-live first; pending/in-progress by phase then id (stable).
  completed.sort((a, b) => String(b.merged_at ?? "").localeCompare(String(a.merged_at ?? "")));
  const byPhaseId = (a: TrackerBlockRow, b: TrackerBlockRow) => String(a.phase ?? "zz").localeCompare(String(b.phase ?? "zz")) || a.id.localeCompare(b.id);
  inProgress.sort(byPhaseId);
  pending.sort(byPhaseId);

  const counts = recon.counts ?? {};
  const universe = Object.values(counts).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);

  return {
    generated_at: now.toISOString(),
    deployed_sha: resolveBackendVersion(),
    source: "block registry (.block-ready via reconcile:blocks) + authored phase manifest (MASTER-6)",
    authored_total: manifest.authored_total,
    registered_total: manifest.registered_total,
    not_registered_total: manifest.not_registered_total,
    registry: {
      universe,
      done: counts.DONE ?? 0,
      pending: counts.PENDING ?? 0,
      gated: counts["PENDING (GATED)"] ?? 0,
      needs_verify: counts["NEEDS-VERIFY"] ?? 0,
    },
    held_migrations_open: heldOpen,
    merged_pr_total: recon.merged_pr_total ?? (recon.merged_prs?.length ?? 0),
    recent_merged: (recon.merged_prs ?? []).slice(0, 12).map((p) => ({ number: p.number, title: p.title, mergedAt: p.mergedAt ?? null })),
    phases,
    views: { completed, in_progress: inProgress, pending },
    view_counts: { completed: completed.length, in_progress: inProgress.length, pending: pending.length },
  };
}
