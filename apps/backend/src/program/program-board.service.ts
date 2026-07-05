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

const CT_ZONE = "America/Chicago";

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
};

// Owner-locked decision surfaced on the board so it isn't buried in a thread.
export type LockedDecision = { id: string; date_ct: string; decision: string };

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
    ...(extra?.owner_batch ?? []).map((it) => ({ ...it, track: "owner-batch" as const })),
    ...(extra?.dispatch_kit ?? []).map((it) => ({ ...it, track: "dispatch-kit" as const })),
    // Audit & Bug Sweep track — the 160-finding 2026-07-04 sweep, append-only (mark DONE, never delete).
    ...(extra?.audit_bug_sweep ?? []).map((it) => ({ ...it, track: "audit" as const })),
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
  const blocks = recon?.blocks ?? [];
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
