import { apiRequest } from "./client";

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
  // Owner-Batch review tag (data-driven; owner-populated). "proceed-on-row" = standard-pattern defect I can
  // build straight from the row; "needs-your-preview" = judgment-heavy, post a before→after preview first.
  // Absent → treated as "proceed-on-row".
  review?: string;
  // ── Live-data upgrade fields (all OPTIONAL — populated by the sync engine; FE tolerates absence) ──────
  severity?: string; // CRIT / HIGH / MED / LOW
  lane?: string; // "FINANCIAL (STOP)" / "NON-FIN"
  module?: string; // module name
  where?: string; // file:line location
  guard?: string; // CI guard that locks the fix
  root_cause?: string;
  impact?: string;
  // Live git state, one of: deployed | merged | waiting-merge | in-ci | ci-failed | pending | gated
  live_state?: string;
  pr_url?: string;
  merged_at?: string; // ISO
  deploy_no?: string; // short-sha/version the fix went live in
  synced_at?: string; // ISO, when live_state last computed
  // ── Lifecycle timeline: written → merged → deployed with real Central-Time timestamps (Jorge's core ask) ──
  requested_ct?: string; // intake — when the work-order was pasted (falls back to registered_on)
  written_ct?: string; // when the PR was opened (gh createdAt)
  merged_ct?: string; // when the PR merged (gh mergedAt)
  deployed_ct?: string; // when the merge went LIVE on prod (health version == merge sha)
  lifecycle?: "requested" | "written" | "merged" | "deployed"; // furthest stage reached
};

export type SequenceStep = { step: number; label: string };

// Owner-locked decision surfaced so it isn't buried in a thread. Owner-populated in program-board-extra.json.
export type LockedDecision = { id: string; date_ct: string; decision: string };

export type MergedPr = { number: number; title: string; mergedAt: string | null; branch: string | null };
export type HoldItem = { number: number; title: string; mergedAt: string | null; category: string };

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

// ── Board meta (NEW file docs/trackers/program-board-meta.json, served alongside the board) ──────────
// Optional throughout — the board renders unchanged when meta is absent.
export type BoardDeltaItem = { id: string; name?: string; at?: string; pr?: string };
export type BoardDeltas = { since?: string; added?: BoardDeltaItem[]; completed?: BoardDeltaItem[] };

// Per-tab (and global) live tally for the summary bar. All fields OPTIONAL — the sync engine populates
// them in parallel; the UI reads defensively and renders only the parts that are present.
export type TabTally = {
  total?: number;
  done?: number;
  deployed?: number;
  open?: number;
  gated?: number;
  waiting_merge?: number;
  in_ci?: number;
  pending?: number;
  pct_deployed?: number; // 0–100
  financial_pending?: number;
  added_recent?: number; // since last sync
  completed_recent?: number; // since last sync
  by_module?: Record<string, number>; // pending count per module
  // tolerate any extra numeric roll-ups the sync engine adds later without a type break
  [k: string]: number | Record<string, number> | undefined;
};
export type BoardTotals = TabTally; // same shape, whole-board roll-up

export type BoardMeta = {
  last_synced_ct?: string;
  deploy_version?: string;
  tabs?: Record<string, TabTally>;
  totals?: BoardTotals;
  deltas?: BoardDeltas;
};

export type BoardNote = {
  id: string;
  block_id: string | null;
  kind: "question" | "answer" | "idea" | "note";
  author: "agent" | "owner";
  body: string;
  status: string;
  created_at: string;
  created_at_ct: string;
};

export type ProgramBoard = {
  data_as_of_ct: string | null;
  refreshed_at_ct: string;
  generated_at_ct: string;
  source_generated_on: string | null;
  counts: Record<string, number>;
  live: LiveMetrics;
  universe: unknown;
  blocks: ReconBlock[];
  extra: ExtraItem[];
  sequence: SequenceStep[];
  notes: BoardNote[];
  merged_prs: MergedPr[];
  merged_pr_total: number;
  hold_for_jorge: HoldItem[];
  locked_decisions: LockedDecision[];
  warnings: string[];
  meta?: BoardMeta | null; // NEW: live-sync meta (deltas, tab totals, deploy version); tolerated absent
};

export async function getProgramBoard(): Promise<ProgramBoard> {
  return apiRequest<ProgramBoard>("/api/v1/program/board");
}

export async function postProgramBoardNote(input: {
  block_id?: string | null;
  kind: "answer" | "idea" | "note";
  body: string;
}): Promise<BoardNote> {
  return apiRequest<BoardNote>("/api/v1/program/board/notes", {
    method: "POST",
    body: input,
  });
}
