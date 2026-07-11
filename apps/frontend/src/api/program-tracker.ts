import { apiRequest } from "./client";

export type TrackerPhase = {
  n: number;
  key: string;
  label: string;
  total: number;
  registered: number;
  done: number;
  held: number;
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
  merged_at: string | null;
  merged_ct: string | null;
  deployed_ct: string | null;
};

export type ProgramTracker = {
  generated_at: string; // server ISO timestamp — recomputed every request
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
  views: { completed: TrackerBlockRow[]; in_progress: TrackerBlockRow[]; pending: TrackerBlockRow[] };
  view_counts: { completed: number; in_progress: number; pending: number };
};

export function getProgramTracker() {
  return apiRequest<ProgramTracker>("/api/v1/program/tracker");
}
