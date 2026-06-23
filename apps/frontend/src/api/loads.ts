import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./client";

export type LoadStatus =
  | "draft"
  | "booked"
  | "planned"
  | "assigned"
  | "dispatched"
  | "at_pickup"
  | "in_transit"
  | "at_delivery"
  | "delivered"
  | "invoiced"
  | "paid"
  | "closed"
  | "cancelled"
  | "abandoned";

export type LoadStop = {
  id: string;
  load_id: string;
  sequence_number: number;
  stop_type: "pickup" | "delivery" | "fuel" | "rest" | "border";
  location_id: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  scheduled_arrival_at: string | null;
  scheduled_departure_at: string | null;
  actual_arrival_at: string | null;
  actual_departure_at: string | null;
  status: "pending" | "arrived" | "departed" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Block 7 full-edit — editable stop columns surfaced by the enriched detail endpoint.
  time_window_type?: string | null;
  appointment_start_at?: string | null;
  appointment_end_at?: string | null;
  lumper_required?: boolean | null;
  lumper_paid_by?: string | null;
  lumper_amount_cents?: number | null;
  is_tarp_stop?: boolean | null;
  tarp_count?: number | null;
  stop_notes?: string | null;
  site_contact_name?: string | null;
  site_contact_phone?: string | null;
  gate_dock_text?: string | null;
};

export type DispatchLoadRow = {
  id: string;
  operating_company_id: string;
  load_number: string;
  customer_id: string;
  customer_name: string | null;
  status: LoadStatus;
  rate_total_cents: number;
  currency_code: "USD" | "MXN";
  assigned_unit_id: string | null;
  assigned_unit_number: string | null;
  assigned_primary_driver_id: string | null;
  assigned_primary_driver_name: string | null;
  assigned_secondary_driver_id: string | null;
  team_id?: string | null;
  dispatcher_user_id: string;
  notes: string | null;
  driver_instructions_file_id?: string | null;
  first_pickup_city: string | null;
  first_delivery_city: string | null;
  // ETA-MODEL BLOCK 1 — two-date delivery model (scheduling/forecast only).
  scheduled_delivery_date?: string | null;
  predicted_delivery_date?: string | null;
  effective_delivery_date?: string | null;
  delivery_late_vs_appt?: boolean;
  geofence_ready?: boolean;
  flag_code: string;
  created_at: string;
  updated_at: string;
  soft_deleted_at: string | null;
  deleted_by_user_id: string | null;
  progress_status?: "on_track" | "behind" | "delayed" | "early" | "unknown";
  progress_eta_delta_minutes?: number | null;
  driver_lifecycle_stage?: string | null;
  driver_pwa_last_ping_at?: string | null;
  samsara_eta_at?: string | null;
  samsara_eta_source?: "samsara" | "manual" | "prediction" | "fallback" | null;
  samsara_cache_tier?: 1 | 2 | 3 | 4 | null;
  samsara_last_fetched_at?: string | null;
  delivery_scheduled_at?: string | null;
  on_time_prediction?: "green" | "amber" | "red" | null;
  // Block 7 full-edit prefill — editable columns surfaced by the enriched detail endpoint.
  customer_wo_number?: string | null;
  pickup_number?: string | null;
  border_routing?: string | null;
  driver_instructions_text?: string | null;
  requires_tarps?: boolean | null;
  tarp_type?: string | null;
  lumper_amount_cents?: number | null;
  customer_chargeback_requested?: boolean | null;
  customer_chargeback_reason?: string | null;
  live_load_number?: string | null;
  anticipated_chargeback_cents?: number | null;
  anticipated_chargeback_reason?: string | null;
  detention_expected_y_n?: boolean | null;
  detention_expected_hours?: number | null;
  detention_bill_customer_per_hour_cents?: number | null;
  detention_driver_pay_per_hour_cents?: number | null;
  late_delivery_risk_y_n?: boolean | null;
  late_delivery_est_deduction_cents?: number | null;
  late_delivery_reason?: string | null;
  miles_practical?: number | null;
  miles_shortest?: number | null;
  miles_deadhead?: number | null;
};

export type LoadsListResponse = {
  loads: DispatchLoadRow[];
  total_count: number;
  has_more: boolean;
};

export type LoadDetail = DispatchLoadRow & {
  stops: LoadStop[];
  // Block 7 (Jorge-approved, no migration): freight attributes the Edit wizard prefills + round-trips.
  commodity?: string | null;
  cargo_weight_lbs?: number | null;
  reefer_setpoint_temp_f?: number | null;
  trip_type?: "NB" | "TR" | "SB" | null;
  piece_count?: number | null;
  customer_po_number?: string | null;
  // render-v6 §B reefer/tarp detail (migration 202606231400).
  reefer_temp_f?: number | null;
  reefer_mode?: string | null;
  pre_cool?: boolean | null;
  tarp_qty?: number | null;
  tarp_size?: string | null;
};

export type LoadAuditEvent = {
  uuid: string;
  created_at: string;
  event_class: string;
  severity: "info" | "warning" | "critical";
  payload: Record<string, unknown>;
  actor_user_uuid: string | null;
  source: string | null;
};

export type LoadsListFilters = {
  limit?: number;
  offset?: number;
  sort?: string;
  search?: string;
  customer_id?: string | null;
  driver_id?: string | null;
  pickup_date_from?: string | null;
  pickup_date_to?: string | null;
  delivery_date_from?: string | null;
  delivery_date_to?: string | null;
  status?: LoadStatus[];
  operating_company_id?: string[];
  include_progress?: boolean;
};

type CreateLoadWizardBody = {
  operating_company_id: string;
  customer_id: string;
  rate_total_cents: number;
  notes?: string;
  pickup: {
    location_id?: string;
    address_line1?: string;
    city: string;
    state: string;
    country: string;
    scheduled_arrival_at: string;
  };
  delivery: {
    location_id?: string;
    address_line1?: string;
    city: string;
    state: string;
    country: string;
    scheduled_arrival_at: string;
  };
};

function encodeMulti(query: URLSearchParams, key: string, values?: string[]) {
  if (!values || values.length === 0) return;
  for (const value of values) query.append(key, value);
}

export function listLoads(filters: LoadsListFilters) {
  const query = new URLSearchParams();
  if (filters.limit !== undefined) query.set("limit", String(filters.limit));
  if (filters.offset !== undefined) query.set("offset", String(filters.offset));
  if (filters.sort) query.set("sort", filters.sort);
  if (filters.search) query.set("search", filters.search);
  if (filters.customer_id) query.set("customer_id", filters.customer_id);
  if (filters.driver_id) query.set("driver_id", filters.driver_id);
  if (filters.pickup_date_from) query.set("pickup_date_from", filters.pickup_date_from);
  if (filters.pickup_date_to) query.set("pickup_date_to", filters.pickup_date_to);
  if (filters.delivery_date_from) query.set("delivery_date_from", filters.delivery_date_from);
  if (filters.delivery_date_to) query.set("delivery_date_to", filters.delivery_date_to);
  encodeMulti(query, "status", filters.status);
  encodeMulti(query, "operating_company_id", filters.operating_company_id);
  if (filters.include_progress !== undefined) query.set("include_progress", String(filters.include_progress));
  const qs = query.toString();
  return apiRequest<LoadsListResponse>(`/api/v1/mdata/loads${qs ? `?${qs}` : ""}`);
}

export function getLoad(id: string) {
  return apiRequest<LoadDetail>(`/api/v1/mdata/loads/${id}`);
}

export function getLoadAudit(id: string) {
  return apiRequest<{ events: LoadAuditEvent[] }>(`/api/v1/mdata/loads/${id}/audit`);
}

export function createLoad(body: CreateLoadWizardBody) {
  return apiRequest<LoadDetail>(`/api/v1/mdata/loads`, { method: "POST", body });
}

export function updateLoad(id: string, body: Record<string, unknown>) {
  return apiRequest<LoadDetail>(`/api/v1/mdata/loads/${id}`, { method: "PATCH", body });
}

/**
 * Block 7 — FULL load edit via the guarded dispatch endpoint (money/evidence-guarded: 409
 * load_edit_locked behind open settlement / issued invoice / non-open driver bill; stops replaced
 * archive-not-delete). Body must be a PARTIAL update — only fields present are touched.
 */
export function updateDispatchLoadFull(id: string, body: Record<string, unknown>) {
  return apiRequest<LoadDetail>(`/api/v1/dispatch/loads/${id}`, { method: "PATCH", body });
}

export function updateLoadStatus(
  id: string,
  body: { new_status: LoadStatus; cancellation_reason_code?: string; cancellation_notes?: string }
) {
  return apiRequest<LoadDetail | { ok: true; status: string }>(`/api/v1/mdata/loads/${id}/status`, {
    method: "PATCH",
    body,
  });
}

export function cancelLoad(id: string, cancellationReasonCode: string, cancellationNotes?: string) {
  return updateLoadStatus(id, {
    new_status: "cancelled",
    cancellation_reason_code: cancellationReasonCode,
    cancellation_notes: cancellationNotes,
  });
}

export function useLoadsList(filters: LoadsListFilters) {
  return useQuery({
    queryKey: ["loads", "list", filters],
    queryFn: () => listLoads(filters),
    refetchInterval: 60000,
  });
}

export function useLoad(id: string | null) {
  return useQuery({
    queryKey: ["loads", "detail", id],
    queryFn: () => getLoad(id as string),
    enabled: Boolean(id),
    refetchInterval: 60000,
  });
}

export function useLoadAudit(id: string | null) {
  return useQuery({
    queryKey: ["loads", "audit", id],
    queryFn: () => getLoadAudit(id as string).then((value) => value.events),
    enabled: Boolean(id),
    refetchInterval: 60000,
  });
}

export function useCreateLoad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createLoad,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["loads", "list"] });
    },
  });
}

export function useUpdateLoadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { new_status: LoadStatus; cancellation_reason_code?: string; cancellation_notes?: string } }) =>
      updateLoadStatus(id, body),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["loads", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["loads", "detail", vars.id] });
      void queryClient.invalidateQueries({ queryKey: ["loads", "audit", vars.id] });
    },
  });
}

export function useCancelLoad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reasonCode, notes }: { id: string; reasonCode: string; notes?: string }) => cancelLoad(id, reasonCode, notes),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["loads", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["loads", "detail", vars.id] });
      void queryClient.invalidateQueries({ queryKey: ["loads", "audit", vars.id] });
    },
  });
}

// ─── Block 9 (DISP-PROFITABILITY): additive types ────────────────────────────
// Full API helpers live in src/lib/loadProfit.ts (Lane B).
// These re-exports let other modules stay in the loads import namespace.
export type { LoadProfitabilitySnapshot, TripProfitabilityRow, TripProfitabilityResponse } from "../lib/loadProfit";
export { getLoadProfitability, getTripProfitability } from "../lib/loadProfit";
