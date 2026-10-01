import { apiRequest } from "./client";

/** E-41 — Engine status board (Round 306). */
export type EngineHealth = "ok" | "red" | "idle" | "n/a" | "pending" | "screen";

export type EngineStatusRow = {
  id: string;
  name: string;
  module: string;
  domain: string;
  schedule: string;
  owner_seat: string;
  kind: "engine" | "screen" | "pending";
  should_produce: boolean;
  expected_window_hours: number | null;
  last_run_at: string | null;
  last_run_success: boolean | null;
  last_error: string | null;
  rows_written_24h: number | null;
  rows_probe_note: string | null;
  next_run_hint: string | null;
  health: EngineHealth;
  health_reason: string;
};

export type EngineStatusBoardResponse = {
  operating_company_id: string;
  engines: EngineStatusRow[];
  catalog_count: number;
  measured_at: string;
};

export function getEngineStatusBoard(operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<EngineStatusBoardResponse>(`/api/v1/system/engine-status?${q.toString()}`);
}
