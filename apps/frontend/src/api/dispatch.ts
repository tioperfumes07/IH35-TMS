import { apiRequest } from "./client";

export type DispatchV2View = "home" | "loads";
export type DispatchLifecycleStage =
  | "pretrip"
  | "enroute_pu"
  | "at_shipper"
  | "loading"
  | "loaded"
  | "enroute_del"
  | "at_receiver"
  | "unloading"
  | "unloaded"
  | "detention"
  | "hos_break"
  | "off_duty"
  | "accident"
  | "breakdown"
  | "no_gps";

export type DispatchConfidenceClass = "on_time" | "tight" | "late_risk" | "late";
export type DispatchStatus =
  | "unassigned"
  | "assigned_not_dispatched"
  | "dispatched"
  | "in_transit"
  | "delivered_pending_docs"
  | "completed_docs_received"
  | "cancelled"
  | "abandoned"
  | "driver_walkoff"
  | "driver_no_show";

export type DispatchLoad = {
  id: string;
  operating_company_id: string;
  load_number: string;
  customer_id: string;
  customer_name: string | null;
  dispatch_status: DispatchStatus;
  status: string;
  unit_number: string | null;
  trailer_number: string | null;
  driver_short_name: string | null;
  has_open_pm_due_wo?: boolean;
  is_dispatch_blocked?: boolean;
  dispatch_block_reason?: string | null;
  hos_badge_color?: "green" | "yellow" | "red" | null;
  hos_is_in_violation?: boolean;
  hos_minutes_until_violation?: number;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  driver_lifecycle_stage: DispatchLifecycleStage;
  latest_eta_prediction?: {
    confidence_class?: DispatchConfidenceClass;
    predicted_arrival_at?: string;
    variance_minutes?: number;
  } | null;
  created_at: string;
};

export type DispatchKpis = {
  dispatched: number;
  need_load: number;
  delivered: number;
  in_transit: number;
  proj_inv_wk_cents: number;
  deadhead_pct: number;
  mpg: number;
};

export type UnitsWithoutLoad = {
  id: string;
  unit_number: string;
  trailer_number: string | null;
  driver_name: string | null;
  last_drop_at: string | null;
  hours_since_last_delivery: number | null;
};

export type DispatchLoadListQuery = {
  operating_company_id: string;
  view: DispatchV2View;
  limit: number;
  offset: number;
  status: DispatchStatus[];
  customer?: string | null;
  driver?: string | null;
  from?: string;
  to?: string;
  search?: string;
};

export type DispatchBookLoadPayload = {
  operating_company_id: string;
  customer_id: string;
  customer_wo_number?: string;
  commodity?: string;
  weight_lbs?: number;
  notes?: string;
  status?: DispatchStatus;
  trailer_type?: "refrigerated_van" | "dry_van" | "flatbed" | "power_only_no_trailer" | "power_only_customer_trailer";
  assigned_unit_id?: string;
  assigned_primary_driver_id?: string;
  assigned_secondary_driver_id?: string;
  team_id?: string;
  temp_fahrenheit?: number;
  charges: Array<{ code: string; amount_cents: number }>;
  stops: Array<{
    stop_type: "pickup" | "delivery";
    sequence_number: number;
    location_id?: string;
    company_name?: string;
    city?: string;
    state?: string;
    country?: string;
    address_line1?: string;
    scheduled_arrival_at?: string;
  }>;
  save_mode: "draft" | "book_dispatch";
  override_token?: string;
  override_reason?: string;
};

export function getDispatchPreferences() {
  return apiRequest<{ dispatch_default_view: DispatchV2View }>("/api/v1/dispatch/preferences");
}

export function updateDispatchPreferences(dispatch_default_view: DispatchV2View) {
  return apiRequest<{ dispatch_default_view: DispatchV2View }>("/api/v1/dispatch/preferences", {
    method: "PATCH",
    body: { dispatch_default_view },
  });
}

export function listDispatchLoads(query: DispatchLoadListQuery) {
  const params = new URLSearchParams();
  params.set("operating_company_id", query.operating_company_id);
  params.set("view", query.view);
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));
  for (const status of query.status) params.append("status", status);
  if (query.customer) params.set("customer", query.customer);
  if (query.driver) params.set("driver", query.driver);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.search) params.set("search", query.search);
  return apiRequest<{ loads: DispatchLoad[]; total_count: number; has_more: boolean }>(`/api/v1/dispatch/loads?${params.toString()}`);
}

export function getDispatchDashboard(operatingCompanyId: string) {
  return apiRequest<DispatchKpis>(`/api/v1/dispatch/dashboard?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}

export function listUnitsWithoutLoad(operatingCompanyId: string) {
  return apiRequest<{ units: UnitsWithoutLoad[] }>(
    `/api/v1/dispatch/units-without-load?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function getDispatchLoadDetail(id: string, operatingCompanyId: string) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/dispatch/loads/${id}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function getDispatchDriverStatus(id: string, operatingCompanyId: string) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/dispatch/loads/${id}/driver-status?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function getUnitDispatchStatus(unitId: string, operatingCompanyId: string) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/dispatch/units/${unitId}/dispatch-status?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function getDriverHosStatus(driverId: string, operatingCompanyId: string) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/dispatch/drivers/${driverId}/hos-status?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function createDispatchLoad(payload: DispatchBookLoadPayload) {
  return apiRequest<Record<string, unknown>>("/api/v1/dispatch/loads", { method: "POST", body: payload });
}

export function transitionDispatchLoad(
  id: string,
  operatingCompanyId: string,
  payload: { new_status: DispatchStatus; cancellation_reason_code?: string }
) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/dispatch/loads/${id}/transition?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "PATCH", body: payload }
  );
}

export function quickAssignDispatchLoad(
  id: string,
  body: {
    operating_company_id: string;
    driver_id: string;
    unit_id?: string;
    trailer_id?: string;
    assignment_method?: "quicksave" | "drag_drop";
    acknowledged_warnings?: string[];
  }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/dispatch/loads/${id}/quick-assign`, {
    method: "POST",
    body,
  });
}

export function completeQuicksaveDispatchLoad(
  id: string,
  body: { operating_company_id: string; fields: Record<string, unknown> }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/dispatch/loads/${id}/complete-quicksave-draft`, {
    method: "POST",
    body,
  });
}

export function listQuicksaveDrafts(operatingCompanyId: string) {
  return apiRequest<{ drafts: Array<Record<string, unknown>> }>(
    `/api/v1/dispatch/loads/quicksave-drafts?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function getDispatchAssignmentHistory(loadId: string, operatingCompanyId: string) {
  return apiRequest<{ rows: Array<Record<string, unknown>> }>(
    `/api/v1/dispatch/loads/${loadId}/assignment-history?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function cancelDispatchLoad(
  id: string,
  body: {
    operating_company_id: string;
    reason_code: string;
    cancellation_notes: string;
    billable_to_customer?: boolean;
    cancellation_charge_cents?: number;
  }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/dispatch/loads/${id}/cancel`, {
    method: "POST",
    body,
  });
}

export function listDispatchCancellationReasons() {
  return apiRequest<{ reasons: Array<Record<string, unknown>> }>("/api/v1/dispatch/cancellation-reasons");
}
