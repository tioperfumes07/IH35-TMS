import { apiRequest } from "./client";

export type Tab = "pending" | "in_progress" | "completed" | "not_counted";

export type BlockLayers = { frontend: boolean; backend: boolean; db: boolean; gl: boolean; rls: boolean; guard: boolean; tests: boolean };

export type TrackerBlockRow = {
  id: string;
  name: string;
  phase: string | null;
  module: string | null;
  status: string;
  tab: Tab;
  live_verified: boolean;
  pr: number | null;
  last_changed_at: string | null;
  last_changed_ct: string | null;
  completed_at: string | null;
  completed_ct: string | null;
  financial: boolean;
  layers: BlockLayers;
  kind: "migration" | "ui" | "guard" | "feature" | "other";
  feature_incomplete: boolean;
  cross_module: string[];
  // FIX-11: LIVE completeness signals computed server-side from the same registry data as layers{}/cross_module.
  wired: boolean;
  needs_design: boolean;
  missing: string[];
  completeness: number;
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

export function getProgramTracker() {
  return apiRequest<ProgramTracker>("/api/v1/program/tracker");
}
