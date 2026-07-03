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
  track?: "owner-batch" | "dispatch-kit";
  // Owner-Batch review tag (data-driven; owner-populated). "proceed-on-row" = standard-pattern defect I can
  // build straight from the row; "needs-your-preview" = judgment-heavy, post a before→after preview first.
  // Absent → treated as "proceed-on-row".
  review?: string;
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
