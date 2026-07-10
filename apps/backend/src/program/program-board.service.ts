// Program Board service — read-side aggregation of ALL repo blocks (from the reconcile JSON that
// `npm run reconcile:blocks` regenerates) + the two curated owner tracks (Owner-Batch + Dispatch-Kit)
// + the two-way notes (agent questions / owner answers+ideas). NON-FINANCIAL internal tooling.
//
// Repo JSON is read at REQUEST TIME so the board auto-updates whenever the reconcile tool regenerates
// the file (the repo ships alongside the compiled backend). The repo root is resolved from the compiled
// module location via resolveMonorepoRoot — NOT process.cwd(): in the Render runtime cwd is NOT the repo
// root, which silently left every extra track (Owner-Batch / Dispatch-Kit / Audit) empty in prod. Every
// other repo-file reader (migration runner, crons, admin data-import) already uses resolveMonorepoRoot;
// this one now matches. cwd ascents remain as a fallback. If a file is still unreadable we degrade to an
// empty track rather than 500 — the page still renders the tracks we do have.

import { readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import { resolveMonorepoRoot } from "../lib/monorepo-root.js";
import { getObjectTextIfExists } from "../storage/r2-client.js";

const CT_ZONE = "America/Chicago";

// ── LIVE snapshot (Cloudflare R2) ─────────────────────────────────────────────────────────────────────
// The sync engine (`scripts/sync-program-board.mjs --to-r2`) writes the LIVE parts of the board — the
// per-tab meta (tallies/deltas/deploy_version/last_synced_ct) + a per-row lifecycle map — to this R2 key
// on a schedule, WITHOUT committing to `main` (so the board refreshes live with NO prod redeploy). We read
// it here FIRST (cached ~60s) and OVERLAY it onto the committed repo JSON. When R2 is empty/unreadable we
// fall back to the committed JSON verbatim (the finding LIST + descriptive fields always come from there),
// so the page still renders and never 500s.
const R2_LIVE_SNAPSHOT_KEY = "program-board/live-snapshot.json";
const SNAPSHOT_TTL_MS = 60_000;

// LIVE lifecycle fields the sync engine derives per row; these (and only these) are overlaid from the R2 onto
// the committed rows. The canonical id/name/descriptive fields are NEVER overlaid.
const LIVE_OVERLAY_FIELDS = [
  "requested_ct",
  "written_ct",
  "merged_ct",
  "merged_at",
  "deployed_ct",
  "deploy_no",
  "pr_url",
  "live_state",
  "lifecycle",
  "synced_at",
] as const;

type LiveRowFields = Partial<Record<(typeof LIVE_OVERLAY_FIELDS)[number], unknown>>;
type LiveSnapshot = {
  generated_at_iso?: string;
  meta?: BoardMeta | null;
  live?: Record<string, LiveRowFields>;
};

let snapshotCache: { at: number; value: LiveSnapshot | null } | null = null;

// Read + parse the R2 live snapshot with a small TTL cache so the 60s auto-refresh payload doesn't hit R2
// on every request. Returns null (committed-JSON fallback) whenever R2 is absent/unconfigured/unparseable.
async function readLiveSnapshot(warnings: string[]): Promise<LiveSnapshot | null> {
  const now = Date.now();
  if (snapshotCache && now - snapshotCache.at < SNAPSHOT_TTL_MS) return snapshotCache.value;
  let value: LiveSnapshot | null = null;
  try {
    const text = await getObjectTextIfExists(R2_LIVE_SNAPSHOT_KEY);
    if (text) value = JSON.parse(text) as LiveSnapshot;
  } catch {
    // Present-but-corrupt snapshot → warn once and fall back to committed JSON (never a 500).
    warnings.push("program board live snapshot (R2) unparseable — falling back to committed JSON");
    value = null;
  }
  snapshotCache = { at: now, value };
  return value;
}

// Overlay ONLY the live lifecycle fields from a snapshot row onto a committed row (immutably). The
// snapshot is keyed `${track}::${id}::${name}` — the same key the sync engine writes.
function overlayLive<T extends { id?: unknown; name?: unknown }>(
  row: T,
  live: LiveSnapshot["live"] | undefined,
  key: string
): T {
  const src = live?.[key];
  if (!src) return row;
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const f of LIVE_OVERLAY_FIELDS) {
    if (src[f] !== undefined) out[f] = src[f];
  }
  return out as T;
}

// Repo root resolved from THIS compiled module's location (cwd-independent). Falls back to null if the
// anchor walk fails, in which case readRepoJson still tries cwd-relative candidates.
let REPO_ROOT: string | null = null;
try {
  REPO_ROOT = resolveMonorepoRoot(import.meta.url);
} catch {
  REPO_ROOT = null;
}

// ── repo file locations (relative to the resolved repo root at runtime) ──────────────────────────────
const RECON_REL = "docs/trackers/block-reconciliation-data.json";
const EXTRA_REL = "docs/trackers/program-board-extra.json";
// Live board meta (per-tab totals + deltas + deploy version) maintained by the sync engine.
const META_REL = "docs/trackers/program-board-meta.json";
// TRUE-state audit snapshot (committed JSON only — never overlaid from the R2). Produced by the 2026-07-10
// MASTER-MANIFEST audit vs the prod branch; see docs/trackers/program-board-audit.json.
const AUDIT_REL = "docs/trackers/program-board-audit.json";

// ── types ───────────────────────────────────────────────────────────────────────────────────────────
export type ReconBlock = {
  id: string;
  source: string;
  fin: boolean;
  tier: string;
  status: string;
  evidence: string;
  name: string;
  registered_on: string | null;
  pr: number | null;
};

export type ExtraItem = {
  id: string;
  name: string;
  wave: string;
  type?: string;
  status: string;
  tier: string;
  fin: boolean;
  registered_on: string | null;
  notes?: string;
  track?: "owner-batch" | "dispatch-kit" | "audit";
  // Owner-Batch review tag (owner-populated). "proceed-on-row" | "needs-your-preview"; absent → proceed-on-row.
  review?: string;
  // Legacy per-row fields already present on some audit rows (kept explicit so `...it` never drops them).
  pr?: number | string | null;
  done_ct?: string | null;
  verified?: boolean | string | null;
  // ── Enriched audit-finding fields (added by the sync engine; ALL OPTIONAL — FE must tolerate absence).
  // These are spread through via `...it` into the board payload; they are typed here so nothing strips them.
  severity?: string; // CRIT / HIGH / MED / LOW (from xlsx Severity)
  lane?: string; // e.g. "FINANCIAL (STOP)" / "NON-FIN" (from xlsx Lane)
  module?: string; // module name (from xlsx Module)
  where?: string; // file:line location (from xlsx "Where (file:line)")
  guard?: string; // the CI guard that locks the fix (from xlsx Guard)
  root_cause?: string; // (from xlsx Root cause) — may be long
  impact?: string; // (from xlsx Impact) — may be long
  // LIVE git state: deployed | merged | waiting-merge | in-ci | ci-failed | pending | gated
  live_state?: string;
  pr_url?: string;
  merged_at?: string; // ISO
  deploy_no?: string; // short-sha/version the fix went live in
  synced_at?: string; // ISO, when live_state was last computed
  // ── LIFECYCLE TIMELINE (Jorge's core ask): 4-stage written→merged→deployed with REAL CT timestamps.
  // All OPTIONAL; spread through via `...it`; a row is fully DONE only when deployed_ct is set.
  requested_ct?: string | null; // intake (work-order pasted) — falls back to registered_on for findings
  written_ct?: string | null; // PR opened (gh createdAt)
  merged_ct?: string | null; // PR merged (gh mergedAt)
  deployed_ct?: string | null; // detected live on prod (health version == merge short-sha)
  // Derived furthest stage reached: "requested" | "written" | "merged" | "deployed".
  lifecycle?: string;
};

// Board meta object — served alongside the board from the sync-engine-maintained
// docs/trackers/program-board-meta.json (per-tab totals + additions/deltas + live deploy version).
// EVERYTHING is optional/tolerant: absence yields meta:null + a warning, never a 500.
export type BoardMetaTab = {
  total?: number;
  done?: number;
  open?: number;
  gated?: number;
  waiting_merge?: number;
  in_ci?: number;
  pending?: number;
  [k: string]: number | undefined;
};
export type BoardMetaDeltaEntry = { id?: string; name?: string; pr?: string; at?: string };
export type BoardMeta = {
  last_synced_ct: string | null;
  deploy_version: string | null;
  tabs: Record<string, BoardMetaTab>;
  deltas: {
    since: string | null;
    added: BoardMetaDeltaEntry[];
    completed: BoardMetaDeltaEntry[];
  };
};

// Owner-locked decision surfaced on the board so it isn't buried in a thread.
export type LockedDecision = { id: string; date_ct: string; decision: string };

// TRUE-state audit snapshot (2026-07-10 MASTER-MANIFEST audit vs prod branch br-fancy-credit-akjnd07a).
// Read verbatim from the committed docs/trackers/program-board-audit.json — never overlaid from the R2.
export type ProgramBoardAuditModule = {
  module: string;
  built: number;
  partial: number;
  not_built: number;
  needs_design: number;
};
export type ProgramBoardAuditFact = { fact: string; detail: string; verdict: string };
export type ProgramBoardAuditOpenItem = {
  id: string;
  module: string;
  verdict: string;
  tier: string;
  title: string;
  missing: string;
  evidence: string;
  spec: string;
  dup_count: number;
};
export type ProgramBoardAudit = {
  generated_ct: string;
  source: string;
  headline: string;
  why_done_overstates: string[];
  true_totals: {
    built: number;
    partial: number;
    not_built: number;
    needs_design: number;
    note: string;
  };
  by_module: ProgramBoardAuditModule[];
  prod_verified_facts: ProgramBoardAuditFact[];
  schema_drift_flags: string[];
  top_open_items: ProgramBoardAuditOpenItem[];
};

export type SequenceStep = { step: number; label: string };

// Merged-PR spine + HOLD-FOR-JORGE inventory — mirror of the master-tracker tabs "01 Merged PRs" and
// "11 HOLD-FOR-JORGE inventory". These come from the committed reconcile snapshot (AS-OF its run date),
// NOT a live GitHub feed — the backend runtime has no git/gh access (see LiveMetrics.is_live_pr_feed).
export type MergedPr = { number: number; title: string; mergedAt: string | null; branch: string | null };
export type HoldItem = { number: number; title: string; mergedAt: string | null; category: string };

// LiveMetrics = the section the backend TRUTHFULLY recomputes at request time from the snapshot it can
// read. counts here are re-derived from the blocks array (so they always match the rendered rows) — an
// honest live derivation, distinct from the snapshot's own cached counts. is_live_pr_feed is FALSE: PR
// figures reflect the last `reconcile:blocks` run, not the instant. snapshot_age_days makes staleness plain.
export type LiveMetrics = {
  computed_at_ct: string;
  block_total: number;
  counts: Record<string, number>;
  financial_count: number;
  merged_pr_total: number;
  hold_count: number;
  snapshot_age_days: number | null;
  is_live_pr_feed: false;
  note: string;
};

export type BoardNote = {
  id: string;
  block_id: string | null;
  kind: "question" | "answer" | "idea" | "note";
  author: "agent" | "owner";
  body: string;
  status: string;
  created_at: string; // ISO
  created_at_ct: string; // America/Chicago formatted
};

export type BoardResponse = {
  // HONEST TIMESTAMPS — two distinct fields, never conflated:
  //   data_as_of_ct  = when the block/task/PR SNAPSHOT was produced (its true age). Snapshot data.
  //   refreshed_at_ct = live server time when THIS response's live metrics were computed. Live.
  data_as_of_ct: string | null;
  refreshed_at_ct: string;
  generated_at_ct: string; // back-compat alias of refreshed_at_ct (kept so existing callers don't break)
  source_generated_on: string | null;
  counts: Record<string, number>;
  live: LiveMetrics;
  universe: unknown;
  blocks: ReconBlock[];
  extra: ExtraItem[];
  sequence: SequenceStep[];
  notes: BoardNote[];
  merged_prs: MergedPr[]; // most-recent slice of the merged-PR spine (see merged_pr_total for the full count)
  merged_pr_total: number;
  hold_for_jorge: HoldItem[];
  locked_decisions: LockedDecision[];
  // Live board meta (per-tab totals + additions/deltas + deploy version). null when the file is
  // absent/unparseable (a warning is pushed) — never a 500.
  meta: BoardMeta | null;
  // TRUE-state audit snapshot (committed JSON only, never overlaid from the R2). null when the file is
  // absent/unparseable (a warning is pushed) — never a 500.
  audit: ProgramBoardAudit | null;
  warnings: string[];
};

// The API returns only the most-recent slice of the merged-PR spine (the full spine lives in the committed
// snapshot) so the 60s auto-refresh payload stays small. merged_pr_total carries the true total.
const MERGED_PR_SLICE = 400;

// ── CT formatting ───────────────────────────────────────────────────────────────────────────────────
export function formatCt(input: Date | string | null | undefined): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return typeof input === "string" ? input : "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CT_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dayPart = `${get("month")}/${get("day")}/${get("year")}`;
  const timePart = `${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
  return `${dayPart} ${timePart} CT`;
}

// Whole-days elapsed between an ISO/date string and now (UTC-day granularity) — drives the honest
// "snapshot is N days old" staleness badge. Returns null if the input is unparseable.
function daysSince(input: string | null | undefined): number | null {
  if (!input) return null;
  const d = new Date(input.length <= 10 ? `${input}T00:00:00Z` : input);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

function readRepoJson<T>(rel: string, warnings: string[], label: string): T | null {
  // Resolved repo root FIRST (cwd-independent — the reliable path in the Render runtime), then a few
  // cwd-relative ascents as a fallback for local/dev invocations where cwd is already the repo root.
  const candidates = [
    ...(REPO_ROOT ? [path.join(REPO_ROOT, rel)] : []),
    path.join(process.cwd(), rel),
    path.join(process.cwd(), "..", rel),
    path.join(process.cwd(), "..", "..", rel),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, "utf8")) as T;
    } catch {
      // try next candidate
    }
  }
  // Surface the attempted absolute paths so a read failure can't stay invisible (it silently emptied
  // every extra track in prod before this fix).
  warnings.push(`could not read ${label} (${rel}) — tried: ${candidates.join(" | ")}`);
  return null;
}

// ── notes read (gracefully empty until the gated migration lands) ───────────────────────────────────
async function readNotes(client: pg.PoolClient, warnings: string[]): Promise<BoardNote[]> {
  try {
    const { rows } = await client.query(
      `SELECT id, block_id, kind, author, body, status, created_at
         FROM ops.program_board_notes
        WHERE is_active
        ORDER BY created_at ASC`
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      block_id: (r.block_id as string | null) ?? null,
      kind: r.kind as BoardNote["kind"],
      author: r.author as BoardNote["author"],
      body: String(r.body),
      status: String(r.status),
      created_at: new Date(r.created_at as string).toISOString(),
      created_at_ct: formatCt(r.created_at as string),
    }));
  } catch (err) {
    // Table not present yet (gated migration not applied) → empty, plus the seeded agent questions
    // still come from the extra JSON so the Questions tab is populated.
    warnings.push("ops.program_board_notes not readable yet (gated migration pending) — DB notes empty");
    void err;
    return [];
  }
}

// ── main aggregation ────────────────────────────────────────────────────────────────────────────────
export async function getProgramBoard(client: pg.PoolClient): Promise<BoardResponse> {
  const warnings: string[] = [];

  const recon = readRepoJson<{
    date?: string;
    generated_at_iso?: string;
    counts?: Record<string, number>;
    universe?: unknown;
    blocks?: ReconBlock[];
    merged_prs?: MergedPr[];
    merged_pr_total?: number;
    hold_for_jorge?: HoldItem[];
  }>(RECON_REL, warnings, "block reconciliation data");

  const extra = readRepoJson<{
    owner_batch?: ExtraItem[];
    dispatch_kit?: ExtraItem[];
    audit_bug_sweep?: ExtraItem[];
    sequence?: SequenceStep[];
    questions?: Array<Partial<BoardNote> & { created_at?: string }>;
    locked_decisions?: LockedDecision[];
  }>(EXTRA_REL, warnings, "program board extra");

  // Live board meta (per-tab totals + deltas + deploy version) — sync-engine maintained. Committed copy
  // read via the same cwd-independent resolveMonorepoRoot path as recon/extra; it is the FALLBACK.
  const committedMeta = readRepoJson<BoardMeta>(META_REL, warnings, "program board meta");

  // TRUE-state audit snapshot — committed JSON only (never overlaid from the R2/live snapshot). Same
  // cwd-independent read helper as every other tracker file; degrades to null (never 500) if unreadable.
  const audit = readRepoJson<ProgramBoardAudit>(AUDIT_REL, warnings, "program board audit");

  // LIVE snapshot from the R2 (refreshed by the scheduled sync WITHOUT a prod redeploy). Meta + per-row
  // lifecycle come from here FIRST; committed JSON is the graceful fallback. Absent/unreadable → null.
  const snapshot = await readLiveSnapshot(warnings);
  const liveMap = snapshot?.live;
  // R2-first for meta; committed file when the snapshot has none. NEVER a 500.
  const meta: BoardMeta | null = snapshot?.meta ?? committedMeta;

  const dbNotes = await readNotes(client, warnings);

  // Seeded agent questions from the curated JSON (read-side, always present). Give them stable synthetic
  // ids so the frontend can key them; they are merged with DB notes into one stream.
  const seededQuestions: BoardNote[] = (extra?.questions ?? []).map((q, i) => ({
    id: `seed-q-${i}`,
    block_id: q.block_id ?? null,
    kind: (q.kind as BoardNote["kind"]) ?? "question",
    author: (q.author as BoardNote["author"]) ?? "agent",
    body: String(q.body ?? ""),
    status: q.status ?? "open",
    created_at: q.created_at ? new Date(q.created_at).toISOString() : new Date().toISOString(),
    created_at_ct: formatCt(q.created_at ?? new Date()),
  }));

  const extraItems: ExtraItem[] = [
    // Owner-Batch + Dispatch-Kit tracks have no live-sync overlay (the sync engine enriches audit + block
    // rows only) — they render straight from the committed JSON.
    ...(extra?.owner_batch ?? []).map((it) => ({ ...it, track: "owner-batch" as const })),
    ...(extra?.dispatch_kit ?? []).map((it) => ({ ...it, track: "dispatch-kit" as const })),
    // Audit & Bug Sweep track — the 160-finding 2026-07-04 sweep, append-only (mark DONE, never delete).
    // Live lifecycle fields overlaid from the R2 snapshot (keyed `audit::id::name`) when present.
    ...(extra?.audit_bug_sweep ?? []).map((it) =>
      overlayLive({ ...it, track: "audit" as const }, liveMap, `audit::${it.id}::${it.name}`)
    ),
  ];

  // ── HONEST TIMESTAMPS ───────────────────────────────────────────────────────────────────────────
  // data_as_of_ct  = when the snapshot itself was produced (its precise reconcile-run stamp if present,
  //                  else its day). This is the TRUE age of the block/task/PR universe below.
  // refreshed_at_ct = right now, when the backend computed the live section. NEVER present snapshot data
  //                  as if it were live: these two are rendered with separate labels on the board.
  const refreshedAt = new Date();
  const refreshed_at_ct = formatCt(refreshedAt);
  const snapshotStamp = recon?.generated_at_iso ?? recon?.date ?? null;
  const data_as_of_ct = snapshotStamp ? formatCt(snapshotStamp) : null;

  // ── LIVE METRICS — recomputed at request time from what the backend can actually read ─────────────
  // Overlay the R2 live lifecycle fields (keyed `block::id::name`) onto the committed blocks before the
  // live counts/tallies are re-derived, so the rendered rows and the counts both reflect the R2 snapshot.
  const blocks = (recon?.blocks ?? []).map((b) => overlayLive(b, liveMap, `block::${b.id}::${b.name}`));
  const liveCounts: Record<string, number> = {};
  for (const b of blocks) liveCounts[b.status] = (liveCounts[b.status] ?? 0) + 1;
  const financial_count = blocks.filter((b) => b.fin).length;
  const mergedAll = recon?.merged_prs ?? [];
  const holdAll = recon?.hold_for_jorge ?? [];
  const merged_pr_total = recon?.merged_pr_total ?? mergedAll.length;
  const snapshot_age_days = daysSince(snapshotStamp);

  const live: LiveMetrics = {
    computed_at_ct: refreshed_at_ct,
    block_total: blocks.length,
    counts: liveCounts,
    financial_count,
    merged_pr_total,
    hold_count: holdAll.length,
    snapshot_age_days,
    is_live_pr_feed: false,
    note:
      "Counts recomputed live from the snapshot at request time. PR/HOLD figures reflect the last " +
      "`reconcile:blocks` run (see 'Blocks data as of'), not a live GitHub feed — the backend runtime has " +
      "no git/gh. Re-run reconcile (or schedule it) to advance the snapshot.",
  };

  return {
    data_as_of_ct,
    refreshed_at_ct,
    generated_at_ct: refreshed_at_ct, // back-compat alias
    source_generated_on: recon?.date ?? null,
    counts: recon?.counts ?? {},
    live,
    universe: recon?.universe ?? null,
    blocks,
    extra: extraItems,
    sequence: extra?.sequence ?? [],
    notes: [...seededQuestions, ...dbNotes],
    merged_prs: mergedAll.slice(0, MERGED_PR_SLICE),
    merged_pr_total,
    hold_for_jorge: holdAll,
    locked_decisions: extra?.locked_decisions ?? [],
    meta,
    audit,
    warnings,
  };
}

// ── note insert (owner side; author forced to 'owner' server-side) ──────────────────────────────────
export async function insertOwnerNote(
  client: pg.PoolClient,
  userUuid: string,
  input: { block_id?: string | null; kind: "answer" | "idea" | "note"; body: string }
): Promise<BoardNote> {
  const { rows } = await client.query(
    `INSERT INTO ops.program_board_notes (block_id, kind, author, body, created_by)
     VALUES ($1, $2, 'owner', $3, $4::uuid)
     RETURNING id, block_id, kind, author, body, status, created_at`,
    [input.block_id ?? null, input.kind, input.body, userUuid]
  );
  const r = rows[0] as Record<string, unknown>;
  return {
    id: String(r.id),
    block_id: (r.block_id as string | null) ?? null,
    kind: r.kind as BoardNote["kind"],
    author: r.author as BoardNote["author"],
    body: String(r.body),
    status: String(r.status),
    created_at: new Date(r.created_at as string).toISOString(),
    created_at_ct: formatCt(r.created_at as string),
  };
}
