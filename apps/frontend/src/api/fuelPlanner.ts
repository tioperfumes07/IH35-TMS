import { apiRequest, apiRequestFormData } from "./client";
import { resolveApiUrl } from "./client";

export type LovesSyncStatus = {
  last_synced_at: string | null;
  rows_imported_24h: number;
  status: "ok" | "stale" | "error" | "disabled" | "never";
};

export type FuelDashboard = {
  planner_source_available: boolean;
  compliance_source_available: boolean;
  active_plans: number | null;
  mtd_spend: number;
  avg_price_per_gallon: number;
  mtd_savings: number | null;
  compliance_pct: number | null;
  fleet_mpg: number | null;
  loves_sync_at: string | null;
};

export type FuelActiveRoute = {
  id: string;
  operating_company_id: string;
  load_id: string;
  load_display_id: string;
  /** Canonical FKs from views.fuel_planner_active_routes — required for EntityLink drills. */
  driver_id: string | null;
  unit_id: string | null;
  driver_full_name: string;
  driver_display_id: string;
  unit_display_id: string;
  total_distance_miles: number | null;
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

export function getFuelActiveRoutes(companyId: string, range: { limit: number; offset: number }) {
  return apiRequest<{ routes: FuelActiveRoute[]; total_count: number | null; source_available: boolean; limit: number; offset: number }>(
    `/api/v1/fuel/planner/active-routes?${q(companyId)}&limit=${range.limit}&offset=${range.offset}`
  );
}

export function getFuelRecommendationDetail(id: string, companyId: string) {
  return apiRequest<FuelRecommendationDetail>(`/api/v1/fuel/planner/recommendations/${id}?${q(companyId)}`);
}

export function sendFuelRecommendationToDriver(id: string, companyId: string) {
  return apiRequest<{
    ok: boolean;
    recommendation_id: string;
    delivery_status: "queued" | "already_queued";
    queued_at: string | null;
  }>(
    `/api/v1/fuel/planner/recommendations/${id}/send-to-driver?${q(companyId)}`,
    { method: "POST" }
  );
}

export function getFuelComplianceSummary(companyId: string, driverId?: string | null) {
  const search = new URLSearchParams({ operating_company_id: companyId });
  if (driverId) search.set("driver_id", driverId);
  return apiRequest<{
    source_available: boolean;
    fleet_pct_followed: number | null;
    fleet_total_recommendations: number | null;
    per_driver: Array<Record<string, unknown>>;
  }>(`/api/v1/fuel/planner/compliance/summary?${search}`);
}

export function getFuelSavingsSummary(companyId: string) {
  return apiRequest<{
    source_available: boolean;
    fleet_savings_ytd: number | null;
    fleet_lost_savings_ytd: number | null;
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
  const url = `/api/v1/fuel/loves-prices/upload?${q(companyId)}`;
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(resolveApiUrl(url), {
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

// FUEL-4: History tab wiring. GET /api/v1/fuel/transactions already existed
// (apps/backend/src/fuel/fuel-transactions.routes.ts, registered in index.ts) as a read model for
// FuelTransactionsTable but had no frontend fetch hook — the History tab rendered `rows={[]}` hardcoded.
export type FuelTransactionListItem = {
  id: string;
  transaction_date: string;
  driver_name: string;
  gallons: number;
  amount_cents: number;
  station: string;
  // Drill-through ids returned by the backend (Law of the Land — total connectivity).
  driver_id: string | null;
  unit_id: string | null;
  unit_number: string | null;
  trailer_id: string | null;
  trailer_number: string | null;
  load_id: string | null;
  load_number: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
};

export type FuelTransactionListResponse = {
  transactions: FuelTransactionListItem[];
  total_count: number;
  has_more: boolean;
};

export function getFuelTransactions(
  companyId: string,
  params: {
    limit?: number;
    offset?: number;
    transaction_id?: string;
    driver_id?: string;
    unit_id?: string;
    load_id?: string;
    trailer_id?: string;
    from?: string;
    to?: string;
  } = {}
) {
  const search = new URLSearchParams({ operating_company_id: companyId });
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  if (params.transaction_id) search.set("transaction_id", params.transaction_id);
  if (params.driver_id) search.set("driver_id", params.driver_id);
  if (params.unit_id) search.set("unit_id", params.unit_id);
  if (params.load_id) search.set("load_id", params.load_id);
  if (params.trailer_id) search.set("trailer_id", params.trailer_id);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  return apiRequest<FuelTransactionListResponse>(`/api/v1/fuel/transactions?${search.toString()}`);
}

// FUEL-5: Import button wiring. POST /api/v1/fuel/transactions/import already existed
// (apps/backend/src/fuel/fuel-transaction-import.routes.ts, registered in index.ts) accepting a
// fleet-card (Love's/WEX/EFS/Comdata) .xlsx/.csv export — the History tab's Import button was
// `disabled` with a "coming soon" toast instead of calling it.
export type FuelTransactionImportResult = {
  rows_inserted: number;
  rows_duplicate: number;
  rows_skipped: number;
  rows_unlinked_to_load: number;
  dead_letters: number;
  dead_letter_details: Array<{ line_number: number; reason: string }>;
};

export function importFuelTransactions(companyId: string, file: File): Promise<FuelTransactionImportResult> {
  const form = new FormData();
  form.append("file", file);
  return apiRequestFormData<FuelTransactionImportResult>(
    `/api/v1/fuel/transactions/import?${q(companyId)}`,
    form
  );
}

/** RANK3 FE — office manual create (POST /api/v1/fuel/transactions, #6319). */
export type FuelType = "diesel" | "def" | "gas" | "reefer_diesel" | "other";

export type CreateFuelTransactionInput = {
  transaction_at: string;
  driver_id?: string | null;
  unit_id?: string | null;
  trailer_id?: string | null;
  vendor_id?: string | null;
  fuel_card_id?: string | null;
  fuel_type?: FuelType;
  gallons?: number;
  price_per_gallon?: number;
  total_cost: number;
  location_city?: string;
  location_state?: string;
  transaction_reference?: string;
  notes?: string;
  load_id?: string | null;
  load_exemption_reason?: string;
  cash_advance?: boolean;
};

export function createFuelTransaction(companyId: string, body: CreateFuelTransactionInput) {
  return apiRequest<{ id: string }>("/api/v1/fuel/transactions", {
    method: "POST",
    body: { operating_company_id: companyId, ...body },
  });
}
