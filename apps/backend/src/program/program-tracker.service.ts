// Program Tracker service — NON-FINANCIAL, READ-ONLY internal tooling. Computes the Build-Progress view
// at request time from the DEPLOYED repo artifacts (no DB writes, no accounting/catalogs/mdata):
//   • .block-ready/*.json — the LIVE block registry, read directly (readRegistry). The headline "Registered"
//     count is `registry.size` counted HERE at request time, so a newly-registered/committed block bumps the
//     number on the very next deploy — no script re-run, no manual edit (A2, owner's core ask 2026-07-11).
//   • docs/trackers/program-phase-manifest.json  — authored MASTER-6 sequence → the 8 phases (authored
//     DENOMINATOR + authored-registered figure). Refreshed by the scheduled program-tracker-artifacts-sync
//     workflow; NOT the headline registered total.
//   • docs/trackers/block-reconciliation-data.json — reconcile:blocks per-block status + real timestamps +
//     live_state. Per-block status/phase rollup come from this artifact = "as of last sync" (recon_synced_at),
//     refreshed on schedule + on merge-to-main; NOT recomputed per request. Honest caption reflects that (A3).
//   • db/migrations/.held-migrations.json — open build-and-hold migration count.
// Honest failure (§0): unreadable manifest/reconcile → THROW (route 503s, page shows an error state, never
// fabricated numbers). Timestamps are always real (registry/sync) or null → "—"; never now()/fabricated.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";
import { resolveBackendVersion } from "../health/health.routes.js";
import { getObjectTextIfExists } from "../storage/r2-client.js";

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
// A registry file is RETIRED (excluded from the headline "Registered" count) when a DUP/DUPLICATE/STALE/
// LIKELY-STALE/SUPERSEDED marker is present — via the filename suffix, a status field, or an explicit
// superseded_by/duplicate_of. Mirrors scripts/verify-tracker-no-duplicate-block-ids.mjs + reconcile-block-
// status.mjs so the tracker headline, the reconcile report, and the CI guard can never disagree. Retirement
// is ADDITIVE (§7): duplicates are ARCHIVED (status:"superseded"), never deleted — so registered_total is
// UNIQUE registered blocks, not the raw .block-ready file count.
const RETIRE_FILENAME_RE = /[_-](DUP|DUPLICATE|STALE|LIKELY-STALE|SUPERSEDED)\.json$/i;
const RETIRE_STATUS_RE = /^(superseded|duplicate|dup|stale)$/i;
function isRetiredBlockFile(filename: string, j: Record<string, unknown>): boolean {
  if (RETIRE_FILENAME_RE.test(filename)) return true;
  const status = j.status;
  if (typeof status === "string" && RETIRE_STATUS_RE.test(status.trim())) return true;
  if (j.superseded_by != null || j.duplicate_of != null) return true;
  return false;
}
type RegistryEntry = { id: string; allowedFiles: string; moduleField: string | null; scopeText: string; linkageText: string; needsDesign: boolean; classification: string | null; phase: string | null; status: string | null; name: string | null };
function readRegistry(): Map<string, RegistryEntry> {
  const map = new Map<string, RegistryEntry>();
  const dir = path.join(ROOT, ".block-ready");
  if (!existsSync(dir)) return map;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const j = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Record<string, unknown>;
      if (isRetiredBlockFile(f, j)) continue; // dedup: retired duplicates excluded from registered_total
      const allowed = Array.isArray(j.allowed_files) ? j.allowed_files.join(" ") : String(j.allowed_files ?? "");
      const acc = Array.isArray(j.acceptance) ? j.acceptance.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") : "";
      const scopeText = `${allowed} ${acc} ${String(j.lane_lock ?? "")} ${String(j.summary ?? "")} ${String(j.task ?? "")} ${String(j.note ?? "")}`;
      // linkage field (string or array) — the block's DECLARED both-way wiring; absent on most legacy entries.
      const linkageText = typeof j.linkage === "string" ? j.linkage : Array.isArray(j.linkage) ? (j.linkage as unknown[]).map(String).join(" ") : String(j.linkage ?? "");
      // needs_design ONLY when an explicit marker is present — NEVER inferred from absence (§0 verify-everything).
      const needsDesign = j.needs_design === true || j.design_pending === true || NEEDS_DESIGN_RE.test(scopeText) || NEEDS_DESIGN_RE.test(String(j.status ?? ""));
      const id = String(j.block_id ?? j.block ?? f.replace(/\.json$/, ""));
      // DOC-20: module derivation uses ONLY the allowed_files PATHS + an explicit `module` field — never the
      // note/task/summary prose (whose boilerplate "dispatch" mentions caused deriveCrossModule to tag ~1006
      // blocks as dispatch). Keep allowedFiles separate from scopeText for that reason.
      map.set(normId(id), { id, allowedFiles: allowed, moduleField: typeof j.module === "string" ? j.module : null, scopeText, linkageText, needsDesign, classification: (j.classification as string) ?? (j.financial === true ? "FINANCIAL" : j.financial === false ? "NON-FINANCIAL" : null), phase: (j.phase as string) ?? null, status: j.status != null ? String(j.status) : null, name: (j.task as string) ?? (j.name as string) ?? null });
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

// DOC-20: the By-Module tab's per-block `module` — derived from an explicit `module` field OR the block's
// allowed_files PATHS with a WORD-BOUNDARY match (path segment / camel boundary), NEVER from prose (which
// made every block match "dispatch"). No default-to-MODULES[0]; unknown → "uncategorized".
function deriveModule(allowedFiles: string, moduleField: string | null): string {
  const explicit = (moduleField ?? "").trim().toLowerCase();
  if (explicit && MODULES.includes(explicit)) return explicit;
  const paths = allowedFiles.toLowerCase();
  for (const m of MODULES) {
    // match the module name only as a path segment or bounded token, e.g. "/banking/", "pages/fuel", "fuel-"
    const re = new RegExp(`(^|[\\/_.-])${m}([\\/_.-]|$)`);
    if (re.test(paths)) return m;
  }
  return "uncategorized";
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
type Recon = { counts?: Record<string, number>; blocks?: ReconBlock[]; merged_prs?: { number: number; title: string; mergedAt?: string }[]; merged_pr_total?: number; generated_at_iso?: string };

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
  created_at: string | null; // FIX B: git-derived add-date of the block's .block-ready file (null = undated)
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
  registered_total: number; // LIVE count of ALL .block-ready blocks (registry.size) — the headline "Registered"
  authored_registered_total: number; // how many authored MASTER-6 blocks are registered (authored-progress denom)
  not_registered_total: number; // authored blocks not yet registered (authored_total − authored_registered_total)
  recon_synced_at: string | null; // when the per-block status artifact was last reconciled (A3 honest "as of")
  held_migrations_open: number;
  merged_pr_total: number;
  recent_merged: { number: number; title: string; mergedAt: string | null }[];
  phases: TrackerPhase[];
  views: { pending: TrackerBlockRow[]; in_progress: TrackerBlockRow[]; completed: TrackerBlockRow[]; not_counted: TrackerBlockRow[] };
  view_counts: { pending: number; in_progress: number; completed: number; not_counted: number };
  modules: { module: string; built: number; partial: number; not_built: number; total: number }[];
  // FIX B: the SAME breakdown restricted to blocks created on/after 2026-07-01 (git add-date). `undated` =
  // blocks with no determinable add-date (never counted into the window). Side-by-side with the full view.
  since_jul1: {
    since: string;
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    not_counted: number;
    undated: number;
    modules: { module: string; built: number; partial: number; not_built: number; total: number }[];
  };
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

// LIVE reconcile artifact from Cloudflare R2 — the same CI→R2 mechanism the program board uses
// (program-board-sync.yml runs reconcile:blocks with git+gh, then uploads here). This is what makes the
// per-block STATUS rollup refresh on every merge WITHOUT a deploy: the prod backend has no git/gh so it
// cannot recompute the merged-PR DONE signal itself; it reads the CI-computed snapshot from R2 and falls
// back to the committed file only when R2 is empty/unconfigured/unparseable (never a 500).
const R2_TRACKER_RECON_KEY = "program-tracker/block-reconciliation-data.json";
const RECON_TTL_MS = 60_000;
let reconCache: { at: number; value: Recon | null } | null = null;

async function loadReconFromR2(nowMs: number): Promise<Recon | null> {
  if (reconCache && nowMs - reconCache.at < RECON_TTL_MS) return reconCache.value;
  let value: Recon | null = null;
  try {
    const text = await getObjectTextIfExists(R2_TRACKER_RECON_KEY);
    if (text) value = JSON.parse(text) as Recon;
  } catch {
    // Present-but-corrupt R2 snapshot → fall back to the committed file (below). Never throw.
    value = null;
  }
  reconCache = { at: nowMs, value };
  return value;
}

// FIX B — per-block creation dates (git add-date of each .block-ready file), generated in CI and served
// from R2 (program-tracker/block-created-dates.json) with the committed file as cold fallback. Powers the
// "Since Jul 1" view. A block with no add-date → null (undated, never guessed into the window).
const R2_CREATED_DATES_KEY = "program-tracker/block-created-dates.json";
let createdCache: { at: number; value: Record<string, string | null> } | null = null;
async function loadCreatedDates(nowMs: number): Promise<Record<string, string | null>> {
  if (createdCache && nowMs - createdCache.at < RECON_TTL_MS) return createdCache.value;
  let dates: Record<string, string | null> = {};
  try {
    const text = await getObjectTextIfExists(R2_CREATED_DATES_KEY);
    if (text) dates = (JSON.parse(text)?.dates ?? {}) as Record<string, string | null>;
    else dates = ((readJson("docs/trackers/block-created-dates.json") as { dates?: Record<string, string | null> })?.dates) ?? {};
  } catch {
    try { dates = ((readJson("docs/trackers/block-created-dates.json") as { dates?: Record<string, string | null> })?.dates) ?? {}; }
    catch { dates = {}; }
  }
  // Normalise keys so a block matches whether the map is keyed by raw id or normId.
  const norm: Record<string, string | null> = { ...dates };
  for (const [k, v] of Object.entries(dates)) norm[normId(k)] = v;
  createdCache = { at: nowMs, value: norm };
  return norm;
}

/** Async live variant: source the reconcile artifact + created-dates from R2 (fresh, CI-computed) when
 *  available, else the committed files. Delegates the derivation to computeProgramTracker. */
export async function computeProgramTrackerLive(now: Date): Promise<ProgramTracker> {
  const [r2Recon, createdDates] = await Promise.all([loadReconFromR2(now.getTime()), loadCreatedDates(now.getTime())]);
  return computeProgramTracker(now, r2Recon ?? undefined, createdDates);
}

// FIX B: blocks created on/after this date populate the "Since Jul 1" view (owner request 2026-07-12).
const SINCE_JUL1 = "2026-07-01";

export function computeProgramTracker(now: Date, reconOverride?: Recon, createdDates: Record<string, string | null> = {}): ProgramTracker {
  const manifest = readJson("docs/trackers/program-phase-manifest.json") as Manifest;
  // R2 live snapshot (fresh, refreshed every merge) WINS; committed file is the cold fallback.
  const recon = reconOverride ?? (readJson("docs/trackers/block-reconciliation-data.json") as Recon);

  // DOC-20 Sequence fix: authored manifest ids (e.g. "G1_..._DISPATCH") and recon/registry ids
  // ("G1-...") are DISJOINT namespaces — bridge them via the manifest's block_ready_key so merged work
  // actually shows up in its authored phase (was reading ~5 done of 935).
  const phaseByNorm = new Map<string, string>();
  for (const p of manifest.phases) for (const b of p.blocks) phaseByNorm.set(normId(b.block_ready_key ?? b.id), p.key);
  const registry = readRegistry();

  // Real merge timestamps by PR number, from the git-derived merged-PR spine (never fabricated).
  const mergedAtByPr = new Map<number, string>();
  for (const p of recon.merged_prs ?? []) if (typeof p.number === "number" && p.mergedAt) mergedAtByPr.set(p.number, p.mergedAt);

  // Build the row set from the LIVE registry UNIONED with the reconcile artifact, so a newly-registered block
  // appears IMMEDIATELY (in its own registry status) and a block's status transitions AUTOMATICALLY: the
  // reconcile artifact (auto-refreshed on every merge by program-tracker-artifacts-sync.yml) carries the
  // evidence-derived status (merged-PR → DONE), which WINS when present; a brand-new block not yet reconciled
  // shows in its registry-declared status (pending/in-progress) until the next auto-sync flips it. Nothing is
  // frozen and nothing is dropped: recon-only legacy blocks (no .block-ready file) are still included.
  const reconById = new Map<string, ReconBlock>();
  for (const rb of recon.blocks ?? []) reconById.set(normId(rb.id), rb);
  const unionIds = new Set<string>([...registry.keys(), ...reconById.keys()]);
  const blockInputs: ReconBlock[] = [...unionIds].map((nid) => {
    const rb = reconById.get(nid);
    const entry = registry.get(nid);
    if (rb) {
      // Reconcile status WINS (it applies overrides + evidence like merged-PR→DONE = the automatic transition).
      return rb;
    }
    // Registry-only block (registered but not yet reconciled): show it live in its own declared status.
    return { id: entry!.id, status: entry!.status ?? "pending", name: entry!.name ?? entry!.id, fin: entry!.classification === "FINANCIAL", pr: null, live_state: null };
  });

  const rows: TrackerBlockRow[] = blockInputs.map((b) => {
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
      module: deriveModule(entry?.allowedFiles ?? "", entry?.moduleField ?? null),
      status: String(b.status),
      tab: classify(String(b.status), liveVerified),
      live_verified: liveVerified,
      pr: b.pr ?? null,
      created_at: createdDates[b.id] ?? createdDates[normId(b.id)] ?? null,
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
      const rb = reconByNorm.get(normId(blk.block_ready_key ?? blk.id)) ?? reconByNorm.get(normId(blk.id));
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
    source: "live .block-ready registry (headline count) + authored phase manifest (MASTER-6) + reconcile sync",
    authored_total: manifest.authored_total,
    // A2 — headline "Registered" = ALL live-registered .block-ready blocks, counted right here at request time
    // from the DEPLOYED registry directory. A newly-committed block bumps this on the next deploy with NO script
    // re-run (the frozen manifest.registered_total is kept below as the authored-progress figure, never as headline).
    registered_total: registry.size,
    authored_registered_total: manifest.registered_total,
    not_registered_total: manifest.not_registered_total,
    // A3 — per-block status/PR/timestamps + phase rollup are from the last reconcile sync artifact (refreshed on
    // schedule + on merge), NOT recomputed per request → surface "as of last sync" so the UI never overclaims live.
    recon_synced_at: recon.generated_at_iso ?? null,
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
    since_jul1: (() => {
      // Same breakdown, restricted to blocks whose git add-date is >= 2026-07-01. Undated blocks are counted
      // separately (never guessed into the window). Completed/In-Progress/Pending mirror the tab classification.
      const inWindow = rows.filter((r) => r.created_at != null && r.created_at >= SINCE_JUL1);
      const undated = rows.filter((r) => r.created_at == null).length;
      const mm = new Map<string, { built: number; partial: number; not_built: number }>();
      let pending = 0, inProg = 0, completed = 0, notCounted = 0;
      for (const r of inWindow) {
        if (r.tab === "completed") completed++;
        else if (r.tab === "in_progress") inProg++;
        else if (r.tab === "not_counted") { notCounted++; continue; }
        else pending++;
        const key = r.module ?? "uncategorized";
        const e = mm.get(key) ?? { built: 0, partial: 0, not_built: 0 };
        if (r.tab === "completed") e.built++;
        else if (r.tab === "in_progress") e.partial++;
        else e.not_built++;
        mm.set(key, e);
      }
      return {
        since: SINCE_JUL1,
        total: inWindow.length,
        pending, in_progress: inProg, completed, not_counted: notCounted, undated,
        modules: [...mm.entries()].map(([module, c]) => ({ module, ...c, total: c.built + c.partial + c.not_built })).sort((a, b) => b.total - a.total),
      };
    })(),
  };
}
