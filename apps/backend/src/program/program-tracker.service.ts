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

import { readFileSync, readdirSync, existsSync } from "node:fs";
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

// Registry entry text per block (allowed_files + acceptance + classification + linkage), keyed by normId, so
// the endpoint can AUTO-DERIVE layers/kind/cross-module/wired from the block's declared scope — never hand-entered.
const NEEDS_DESIGN_RE = /needs[_-]design|design[_-]pending/i;
type RegistryEntry = { scopeText: string; linkageText: string; needsDesign: boolean; classification: string | null; phase: string | null };
function readRegistry(): Map<string, RegistryEntry> {
  const map = new Map<string, RegistryEntry>();
  const dir = path.join(ROOT, ".block-ready");
  if (!existsSync(dir)) return map;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const j = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Record<string, unknown>;
      const allowed = Array.isArray(j.allowed_files) ? j.allowed_files.join(" ") : String(j.allowed_files ?? "");
      const acc = Array.isArray(j.acceptance) ? j.acceptance.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") : "";
      const scopeText = `${allowed} ${acc} ${String(j.lane_lock ?? "")} ${String(j.summary ?? "")} ${String(j.task ?? "")} ${String(j.note ?? "")}`;
      // linkage field (string or array) — the block's DECLARED both-way wiring; absent on most legacy entries.
      const linkageText = typeof j.linkage === "string" ? j.linkage : Array.isArray(j.linkage) ? (j.linkage as unknown[]).map(String).join(" ") : String(j.linkage ?? "");
      // needs_design ONLY when an explicit marker is present — NEVER inferred from absence (§0 verify-everything).
      const needsDesign = j.needs_design === true || j.design_pending === true || NEEDS_DESIGN_RE.test(scopeText) || NEEDS_DESIGN_RE.test(String(j.status ?? ""));
      const id = String(j.block_id ?? j.block ?? f.replace(/\.json$/, ""));
      map.set(normId(id), { scopeText, linkageText, needsDesign, classification: (j.classification as string) ?? (j.financial === true ? "FINANCIAL" : j.financial === false ? "NON-FINANCIAL" : null), phase: (j.phase as string) ?? null });
    } catch { /* skip unparseable */ }
  }
  return map;
}

// ── FIX-11: LIVE Wired / Missing-linkage derivation from the SAME registry text that feeds layers{}/cross_module ──
// Linkage-Law (§10 d): every record must link BOTH ways to (a) a financial primitive, (b) an operational module,
// and (c) a hub/backbone table. We detect each declared edge from the block's scope + linkage text. A block is
// WIRED only when all three edges are DECLARED; otherwise the undeclared edges are reported in `missing` so the
// chip row and the Wired/Missing columns are the exact inverse of one another (never disagree, never guessed).
const FIN_PRIMITIVE_RE = /vendor|customer|\bbill\b|bill[_-]?payment|expense|\bpayment|journal[_-]?entr|liabilit|asset account|catalogs\.accounts|accounting\.|\bgl\b|ledger|invoice|escrow|settlement|receivable|payable/i;
const HUB_TABLE_RE = /org\.companies|identity\.users|mdata\.drivers|mdata\.units|mdata\.loads|catalogs\.accounts|mdata\.customers|maintenance\.work_orders|mdata\.vendors|accounting\.journal_entries|docs\.files|mdata\.equipment/i;

function deriveLayers(text: string) {
  const t = text.toLowerCase();
  return {
    frontend: /apps\/frontend|driver-pwa/.test(t),
    backend: /apps\/backend/.test(t),
    db: /db\/migrations/.test(t),
    gl: /accounting\.|journal_entr|posting|\bgl\b|ledger|catalogs\.accounts/.test(t),
    rls: /\brls\b|grant\b|policy|policies|force row level|security_invoker/.test(t),
    guard: /scripts\/verify-|verify-[a-z0-9-]+\.mjs/.test(t),
    tests: /\.test\.|\.spec\.|__tests__/.test(t),
  };
}

const MODULES = ["dispatch", "safety", "insurance", "legal", "maintenance", "driver", "fleet", "accounting", "banking", "factoring", "settlement", "compliance", "fuel", "reports", "customer", "vendor", "unit", "load"];
function deriveCrossModule(text: string): string[] {
  const t = text.toLowerCase();
  return MODULES.filter((m) => t.includes(m));
}

function deriveKind(layers: ReturnType<typeof deriveLayers>): "migration" | "ui" | "guard" | "feature" | "other" {
  if (layers.frontend && layers.backend) return "feature";
  if (layers.db && !layers.frontend && !layers.backend) return "migration";
  if (layers.guard && !layers.frontend && !layers.backend && !layers.db) return "guard";
  if (layers.frontend && !layers.backend) return "ui";
  if (layers.backend && !layers.frontend) return "feature"; // backend-only feature (may be missing FE)
  return "other";
}

type ManifestBlock = { id: string; registered: boolean; block_ready_key?: string };
type ManifestPhase = { n: number; key: string; label: string; authored_total: number; blocks: ManifestBlock[] };
type Manifest = { authored_total: number; registered_total: number; not_registered_total: number; phases: ManifestPhase[] };
type ReconBlock = { id: string; status: string; name?: string; fin?: boolean; pr?: number | null; live_state?: string | null; merged_at?: string | null; merged_ct?: string | null; deployed_ct?: string | null; synced_at?: string | null };
type Recon = { counts?: Record<string, number>; blocks?: ReconBlock[]; merged_prs?: { number: number; title: string; mergedAt?: string }[]; merged_pr_total?: number };

export type Tab = "pending" | "in_progress" | "completed" | "not_counted";

export type BlockLayers = { frontend: boolean; backend: boolean; db: boolean; gl: boolean; rls: boolean; guard: boolean; tests: boolean };

export type TrackerBlockRow = {
  id: string;
  name: string;
  phase: string | null;
  module: string | null;
  status: string; // raw registry status
  tab: Tab;
  live_verified: boolean; // done AND merged+deployed — the ONLY path into Completed
  pr: number | null;
  last_changed_at: string | null; // ISO real registry change time; never faked
  last_changed_ct: string | null; // CT display string from the registry when present
  completed_at: string | null; // ISO merged/deployed time when live-verified, else null
  completed_ct: string | null; // CT display string
  financial: boolean;
  layers: BlockLayers; // auto-derived from allowed_files — never hand-entered
  kind: "migration" | "ui" | "guard" | "feature" | "other";
  feature_incomplete: boolean; // FEATURE built on one side only (FE xor BE) — red-flag
  cross_module: string[]; // from the block's linkage/scope text
  // ── FIX-11: LIVE completeness signals, all derived from the SAME registry text as layers{}/cross_module ──
  wired: boolean; // Linkage-Law: financial-primitive AND operational-module AND hub-table edges all declared
  needs_design: boolean; // true ONLY when an explicit needs_design/design-pending marker exists — never inferred
  missing: string[]; // exact inverse of present layers + declared links: absent layer abbrs + undeclared link edges
  completeness: number; // 0-100 deterministic (see formula in computeProgramTracker); live-verified = 100
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
  modules: { module: string; built: number; partial: number; not_built: number; total: number }[];
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
  const registry = readRegistry();

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
    const entry = registry.get(normId(b.id));
    const scope = entry?.scopeText ?? String(b.name ?? "");
    const layers = deriveLayers(scope);
    const kind = deriveKind(layers);
    const feOnlyNeedsBe = layers.frontend && !layers.backend && /\bendpoint\b|\broute\b|\bapi\b|\bservice\b|POST |GET /i.test(scope);
    const beOnlyNeedsFe = layers.backend && !layers.frontend && !layers.db && !layers.guard;
    const crossModule = deriveCrossModule(scope + " " + String(b.name ?? ""));

    // ── FIX-11 (Linkage-Law §10 d) — WIRED + MISSING, derived LIVE from the block's declared scope + linkage ──
    // A block is WIRED only when it DECLARES all three Linkage-Law edges: a financial primitive, an operational
    // module, and a hub/backbone table. No linkage declaration → wired=false (honest conservative; never hardcoded).
    const linkText = `${scope} ${entry?.linkageText ?? ""} ${String(b.name ?? "")}`;
    const hasFinPrimitive = FIN_PRIMITIVE_RE.test(linkText);
    const hasOperationalModule = crossModule.length > 0;
    const hasHubTable = HUB_TABLE_RE.test(linkText);
    const wired = hasFinPrimitive && hasOperationalModule && hasHubTable;
    // MISSING = exact inverse of the layer chips (only layers that are false) + undeclared Linkage-Law edges,
    // so the Missing column can never disagree with the FE/BE/DB/GL/RLS/G/T chips shown on the same row.
    const LAYER_ABBR: [keyof typeof layers, string][] = [["frontend", "FE"], ["backend", "BE"], ["db", "DB"], ["gl", "GL"], ["rls", "RLS"], ["guard", "Guard"], ["tests", "Tests"]];
    const missing: string[] = [
      ...LAYER_ABBR.filter(([k]) => !layers[k]).map(([, a]) => a),
      ...(hasFinPrimitive ? [] : ["link:financial-primitive"]),
      ...(hasOperationalModule ? [] : ["link:operational-module"]),
      ...(hasHubTable ? [] : ["link:hub-table"]),
    ];
    const needs_design = entry?.needsDesign ?? NEEDS_DESIGN_RE.test(scope);
    // COMPLETENESS 0-100, DETERMINISTIC (never eyeballed):
    //   • live-verified (registry DONE + merged/deployed) → 100 (a completed+live block is 100% done).
    //   • otherwise → 100 · (0.5·layersPresentRatio + 0.2·wired + 0.3·in_progress), CAPPED at 95 so a bare
    //     "done" WITHOUT merged+deployed proof is ALWAYS < 100 (matches classify(): done-without-live = In Progress).
    const layersPresentRatio = LAYER_ABBR.filter(([k]) => layers[k]).length / LAYER_ABBR.length;
    const inProgressBit = classify(String(b.status), liveVerified) === "in_progress" ? 1 : 0;
    const completeness = liveVerified
      ? 100
      : Math.min(95, Math.round(100 * (0.5 * layersPresentRatio + 0.2 * (wired ? 1 : 0) + 0.3 * inProgressBit)));
    return {
      id: b.id,
      name: String(b.name ?? b.id).slice(0, 200),
      phase: phaseByNorm.get(normId(b.id)) ?? entry?.phase ?? null,
      module: crossModule[0] ?? phaseByNorm.get(normId(b.id)) ?? "uncategorized",
      status: String(b.status),
      tab: classify(String(b.status), liveVerified),
      live_verified: liveVerified,
      pr: b.pr ?? null,
      last_changed_at: mergedAt ?? b.synced_at ?? null,
      last_changed_ct: b.merged_ct ?? null,
      completed_at: liveVerified ? mergedAt : null,
      completed_ct: liveVerified ? b.deployed_ct ?? b.merged_ct ?? null : null,
      financial: Boolean(b.fin) || entry?.classification === "FINANCIAL",
      layers,
      kind,
      feature_incomplete: feOnlyNeedsBe || beOnlyNeedsFe,
      cross_module: crossModule,
      wired,
      needs_design,
      missing,
      completeness,
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
    modules: (() => {
      // Live per-module heat-map: Built = completed (live-verified), Partial = in_progress, Not Built = pending.
      const m = new Map<string, { built: number; partial: number; not_built: number }>();
      for (const r of rows) {
        if (r.tab === "not_counted") continue;
        const key = r.module ?? "uncategorized";
        const e = m.get(key) ?? { built: 0, partial: 0, not_built: 0 };
        if (r.tab === "completed") e.built++;
        else if (r.tab === "in_progress") e.partial++;
        else e.not_built++;
        m.set(key, e);
      }
      return [...m.entries()]
        .map(([module, c]) => ({ module, ...c, total: c.built + c.partial + c.not_built }))
        .sort((a, b) => b.total - a.total);
    })(),
  };
}
