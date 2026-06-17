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
};

export type LoadsListResponse = {
  loads: DispatchLoadRow[];
  total_count: number;
  has_more: boolean;
};

export type LoadDetail = DispatchLoadRow & {
  stops: LoadStop[];
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
