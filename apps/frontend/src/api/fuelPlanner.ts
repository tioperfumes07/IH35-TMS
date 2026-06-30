import { apiRequest } from "./client";

export type LovesSyncStatus = {
  last_synced_at: string | null;
  rows_imported_24h: number;
  status: "ok" | "stale" | "error" | "disabled" | "never";
};

export type FuelDashboard = {
  active_plans: number;
  mtd_spend: number;
  avg_price_per_gallon: number;
  mtd_savings: number;
  compliance_pct: number;
  fleet_mpg: number;
  loves_sync_at: string | null;
};

export type FuelActiveRoute = {
  id: string;
  operating_company_id: string;
  load_id: string;
  load_display_id: string;
  driver_full_name: string;
  driver_display_id: string;
  unit_display_id: string;
  total_distance_miles: number;
  recommended_total_fuel_gallons: number;
  recommended_total_cost: number;
  station_avg_baseline_cost: number;
  savings_estimate: number;
  savings_percent: number;
  current_fuel_gallons: number | null;
  fuel_capacity_gallons: number | null;
  current_mpg: number | null;
  computed_at: string;
};

export type RecommendedStop = {
  id: string;
  station_name?: string;
  station_state?: string;
  state?: string;
  mile_marker?: number;
  gallons?: number;
  gallons_added?: number;
  price_per_gallon?: number;
  is_strategic_max_fill?: boolean;
  is_skipped?: boolean;
  reasoning_json?: Record<string, unknown>;
  hos_note?: string;
};

export type FuelRecommendationDetail = FuelActiveRoute & {
  stops: RecommendedStop[];
  hos_aware_recommendations?: Array<{
    stop_id: string;
    sequence_number: number;
    city: string | null;
    state: string | null;
    reason: "low_fuel" | "ten_hour_reset_window";
    estimated_arrival_at: string | null;
    estimated_route_mile: number;
    drive_remaining_min_at_arrival: number;
    note: string;
  }>;
};

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export function getFuelDashboard(companyId: string) {
  return apiRequest<FuelDashboard>(`/api/v1/fuel/planner/dashboard?${q(companyId)}`);
}

export function getLovesSyncStatus(companyId: string) {
  return apiRequest<LovesSyncStatus>(`/api/v1/sync/loves/status?${q(companyId)}`);
}

export function getFuelActiveRoutes(companyId: string) {
  return apiRequest<{ routes: FuelActiveRoute[] }>(`/api/v1/fuel/planner/active-routes?${q(companyId)}`);
}

export function getFuelRecommendationDetail(id: string, companyId: string) {
  return apiRequest<FuelRecommendationDetail>(`/api/v1/fuel/planner/recommendations/${id}?${q(companyId)}`);
}

export function sendFuelRecommendationToDriver(id: string, companyId: string) {
  return apiRequest<{ ok: boolean; recommendation_id: string; sent_at: string }>(
    `/api/v1/fuel/planner/recommendations/${id}/send-to-driver?${q(companyId)}`,
    { method: "POST" }
  );
}

export function getFuelComplianceSummary(companyId: string) {
  return apiRequest<{
    fleet_pct_followed: number;
    fleet_total_recommendations: number;
    per_driver: Array<Record<string, unknown>>;
  }>(`/api/v1/fuel/planner/compliance/summary?${q(companyId)}`);
}

export function getFuelSavingsSummary(companyId: string) {
  return apiRequest<{
    fleet_savings_ytd: number;
    fleet_lost_savings_ytd: number;
    top_driver: Record<string, unknown> | null;
  }>(`/api/v1/fuel/planner/savings/summary?${q(companyId)}`);
}

export type FuelPlannerSettings = {
  operating_company_id: string;
  expensive_states: string[];
  max_off_highway_miles: number;
  max_backwards_miles: number;
  max_miles_per_shift: number;
  overfill_threshold_pct: number;
};

export function getFuelPlannerSettings(companyId: string) {
  return apiRequest<FuelPlannerSettings>(`/api/v1/fuel/planner/settings?${q(companyId)}`);
}

export type FuelPlannerSettingsPatch = Partial<{
  expensive_states: string[];
  max_off_highway_miles: number;
  max_backwards_miles: number;
  max_miles_per_shift: number;
  overfill_threshold_pct: number;
}>;

// FUEL-3: persist Planner settings via the existing backend PATCH. apiRequest does the single
// JSON.stringify — pass a raw object body.
export function updateFuelPlannerSettings(companyId: string, patch: FuelPlannerSettingsPatch) {
  return apiRequest<FuelPlannerSettings>(`/api/v1/fuel/planner/settings?${q(companyId)}`, {
    method: "PATCH",
    body: patch,
  });
}

export async function uploadLovesPrices(
  companyId: string,
  file: File,
  ifMatch?: string | null
): Promise<{ rows_added: number; rows_updated: number; rows_skipped: number; etag: string | null }> {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const url = `${base ? base.replace(/\/$/, "") : ""}/api/v1/fuel/loves-prices/upload?${q(companyId)}`;
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: ifMatch ? { "If-Match": ifMatch } : undefined,
    body: form,
  });
  const payload = (await response.json()) as { rows_added: number; rows_updated: number; rows_skipped: number; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Upload failed");
  }
  return {
    rows_added: Number(payload.rows_added ?? 0),
    rows_updated: Number(payload.rows_updated ?? 0),
    rows_skipped: Number(payload.rows_skipped ?? 0),
    etag: response.headers.get("ETag"),
  };
}
