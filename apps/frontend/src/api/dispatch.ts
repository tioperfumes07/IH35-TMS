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
  active_loads: number;
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

export type DriverLoadAvailability = {
  ok: boolean;
  blocker?: string;
  work_order_id?: string | null;
  asset_id?: string | null;
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
  customer_po_number?: string;
  commodity?: string;
  weight_lbs?: number;
  hazmat?: boolean;
  driver_instructions_text?: string;
  notes?: string;
  status?: DispatchStatus;
  booking_mode?: "single_popup" | "legacy_form";
  requires_tarps?: boolean;
  tarp_type?: string;
  lumper_amount_cents?: number;
  customer_chargeback_requested?: boolean;
  customer_chargeback_reason?: string;
  live_load_number?: string;
  addToOpenPresettlement?: boolean;
  reservation_uuid?: string;
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
    time_window_type?: "appointment" | "open_window" | "select_hours" | "refused" | "first_come_first_serve" | "drop_window";
    appointment_start_at?: string;
    appointment_end_at?: string;
    lumper_required?: boolean;
    lumper_paid_by?: "carrier" | "shipper" | "broker" | "receiver" | "unknown";
    lumper_amount_cents?: number;
    is_tarp_stop?: boolean;
    tarp_count?: number;
    stop_notes?: string;
    site_contact_name?: string;
    site_contact_phone?: string;
    gate_dock_text?: string;
  }>;
  save_mode: "draft" | "book_dispatch";
  override_token?: string;
  override_reason?: string;
  anticipated_chargeback_cents?: number;
  anticipated_chargeback_reason?: string;
  detention_expected_y_n?: boolean;
  detention_expected_hours?: number;
  detention_bill_customer_per_hour_cents?: number;
  detention_driver_pay_per_hour_cents?: number;
  late_delivery_risk_y_n?: boolean;
  late_delivery_est_deduction_cents?: number;
  late_delivery_reason?: string;
  ocr_source_pdf_r2_key?: string;
  miles_practical?: number;
  miles_shortest?: number;
  miles_deadhead?: number;
  pickup_number?: string;
  border_routing?: string;
};

export function reserveDispatchLoadId(operatingCompanyId: string) {
  return apiRequest<{
    reservation_uuid: string;
    load_number: string;
    reserved_until: string;
    ttl_seconds: number;
  }>("/api/v1/dispatch/loads/reserve-id", {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export function releaseDispatchLoadReservation(operatingCompanyId: string, reservationUuid: string) {
  return apiRequest<{ released: boolean }>(
    `/api/v1/dispatch/loads/reserve-id/${encodeURIComponent(reservationUuid)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "DELETE" }
  );
}

export function patchAnticipatedChargeback(
  loadId: string,
  body: {
    operating_company_id: string;
    customer_chargeback_requested: boolean;
    customer_chargeback_reason?: string | null;
  }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/dispatch/loads/${loadId}/anticipated-chargeback`, {
    method: "PATCH",
    body,
  });
}

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
  return apiRequest<{
    driver_id: string;
    drive_remaining_min: number;
    window_remaining_min: number;
    break_remaining_min: number;
    cycle_remaining_min: number;
    last_reset_at: string | null;
    status: "ok" | "warning_1hr" | "warning_15min" | "violation";
  }>(
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
    override_repair_block?: boolean;
    assignment_method?: "quicksave" | "drag_drop";
    acknowledged_warnings?: string[];
  }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/dispatch/loads/${id}/quick-assign`, {
    method: "POST",
    body,
  });
}

export function getDriverLoadAvailability(driverId: string, operatingCompanyId: string) {
  return apiRequest<DriverLoadAvailability>(
    `/api/v1/dispatch/drivers/${encodeURIComponent(driverId)}/load-availability?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
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
    cancel_reason?: string;
    cancel_reason_code?: string;
    reason_code?: string;
    cancellation_notes?: string;
    billable_to_customer?: boolean;
    cancellation_charge_cents?: number;
  }
) {
  const normalizedReason = String(body.cancel_reason ?? body.cancellation_notes ?? "").trim();
  const normalizedReasonCode = String(body.cancel_reason_code ?? body.reason_code ?? "").trim();

  return apiRequest<Record<string, unknown>>(`/api/v1/dispatch/loads/${id}/cancel`, {
    method: "POST",
    body: {
      ...body,
      cancel_reason: normalizedReason,
      cancel_reason_code: normalizedReasonCode,
      reason_code: normalizedReasonCode || body.reason_code,
      cancellation_notes: String(body.cancellation_notes ?? normalizedReason).trim(),
    },
  });
}

export function distributeLoadInstructions(loadId: string, operatingCompanyId: string) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/dispatch/loads/${loadId}/distribute-instructions?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST" }
  );
}

export function listDispatchCancellationReasons() {
  return apiRequest<{ reasons: Array<Record<string, unknown>> }>("/api/v1/dispatch/cancellation-reasons");
}

// --- P6-T11191 dispatch refinements ---

export type AvailableDriverRow = {
  driver_id: string;
  display_name: string;
  display_id: string | null;
  hours_remaining_today: number;
  hours_remaining_week: number;
  distance_to_pickup_miles: number;
  hos_safe: boolean;
  is_in_violation: boolean;
};

export function getDispatchAvailableDrivers(params: {
  operating_company_id: string;
  load_id: string;
  for_pickup_at?: string;
}) {
  const u = new URLSearchParams();
  u.set("operating_company_id", params.operating_company_id);
  u.set("load_id", params.load_id);
  if (params.for_pickup_at) u.set("for_pickup_at", params.for_pickup_at);
  return apiRequest<{ drivers: AvailableDriverRow[] }>(`/api/v1/dispatch/available-drivers?${u.toString()}`);
}

export type OptimalDriverScoreBreakdown = {
  hos_score: number;
  proximity_score: number;
  eligibility_score: number;
  performance_score: number;
  deadhead_penalty: number;
};

export type OptimalDriverRow = {
  driver_id: string;
  display_name: string;
  display_id: string | null;
  rank: number;
  total_score: number;
  breakdown: OptimalDriverScoreBreakdown;
  hos_safe: boolean;
  distance_to_pickup_miles: number;
  eligible: boolean;
  ineligible_reason: string | null;
};

export function getDispatchOptimalDrivers(params: {
  operating_company_id: string;
  load_id: string;
  for_pickup_at?: string;
  preview_pickup_city?: string;
  preview_pickup_state?: string;
  preview_hazmat?: boolean;
  preview_trailer_type?: string;
}) {
  const u = new URLSearchParams();
  u.set("operating_company_id", params.operating_company_id);
  if (params.for_pickup_at) u.set("for_pickup_at", params.for_pickup_at);
  if (params.preview_pickup_city) u.set("preview_pickup_city", params.preview_pickup_city);
  if (params.preview_pickup_state) u.set("preview_pickup_state", params.preview_pickup_state);
  if (params.preview_hazmat != null) u.set("preview_hazmat", String(params.preview_hazmat));
  if (params.preview_trailer_type) u.set("preview_trailer_type", params.preview_trailer_type);
  return apiRequest<{
    drivers: OptimalDriverRow[];
    weights: Record<string, number>;
    load_context: Record<string, unknown>;
  }>(`/api/v1/dispatch/loads/${encodeURIComponent(params.load_id)}/optimal-drivers?${u.toString()}`);
}

export type RefinedLoadStop = {
  id: string;
  load_id: string;
  sequence_number: number;
  stop_type: string;
  city: string | null;
  state: string | null;
  country: string | null;
  address_line1: string | null;
  scheduled_arrival_at: string | null;
  appointment_start_at: string | null;
  appointment_end_at: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  signature_required: boolean;
  photo_required: boolean;
};

export function getLoadStopsForDispatch(loadId: string, operatingCompanyId: string) {
  return apiRequest<{ stops: RefinedLoadStop[] }>(
    `/api/v1/loads/${encodeURIComponent(loadId)}/stops?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function replaceLoadStopsDispatch(
  loadId: string,
  body: {
    operating_company_id: string;
    stops: Array<{
      sequence_number: number;
      stop_type: string;
      location_address?: string | null;
      city?: string | null;
      state?: string | null;
      country?: string | null;
      address_line1?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      window_start?: string | null;
      window_end?: string | null;
      notes?: string | null;
      signature_required?: boolean;
      photo_required?: boolean;
    }>;
  }
) {
  return apiRequest<{ ok: true; load_id: string }>(`/api/v1/loads/${encodeURIComponent(loadId)}/stops`, {
    method: "POST",
    body,
  });
}

export function postLoadReassign(
  loadId: string,
  body: { operating_company_id: string; new_driver_id: string; reason_code: string; notes?: string }
) {
  return apiRequest<{ ok: true; load_id: string }>(`/api/v1/loads/${encodeURIComponent(loadId)}/reassign`, {
    method: "POST",
    body,
  });
}

export function patchAssignUnit(
  loadId: string,
  body: { operating_company_id: string; unit_uuid: string }
) {
  return apiRequest<{ load_id: string; assigned_unit_id: string }>(
    `/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/assign-unit`,
    { method: "PATCH", body }
  );
}

export function patchAssignTrailer(
  loadId: string,
  body: { operating_company_id: string; trailer_uuid: string }
) {
  return apiRequest<{ load_id: string; trailer_uuid: string }>(
    `/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/assign-trailer`,
    { method: "PATCH", body }
  );
}

export function patchAssignDriver(
  loadId: string,
  body: { operating_company_id: string; driver_uuid: string }
) {
  return apiRequest<{ load_id: string; assigned_primary_driver_id: string }>(
    `/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/assign-driver`,
    { method: "PATCH", body }
  );
}

export type DispatchLoadEta = {
  driver_lat: number | null;
  driver_lng: number | null;
  distance_remaining_miles: number | null;
  eta_at: string;
  source: "samsara" | "manual" | "fallback";
};

export function getDispatchLoadEta(loadId: string, operatingCompanyId: string) {
  return apiRequest<DispatchLoadEta>(
    `/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/eta?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export type LoadTemplateRow = {
  id: string;
  name: string;
  template_json: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export function listLoadTemplates(operatingCompanyId: string) {
  return apiRequest<{ templates: LoadTemplateRow[] }>(
    `/api/v1/load-templates?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function createLoadTemplate(body: { operating_company_id: string; name: string; template_json: Record<string, unknown> }) {
  return apiRequest<{ template: LoadTemplateRow }>(`/api/v1/load-templates`, { method: "POST", body });
}

export type AtRiskLoadRow = {
  id: string;
  load_number: string;
  status: string;
  customer_name: string | null;
  unit_number: string | null;
  driver_name: string | null;
  latest_eta_prediction: Record<string, unknown> | null;
  next_stop_scheduled_at: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
};

export function listAtRiskDispatchLoads(operatingCompanyId: string) {
  return apiRequest<{ loads: AtRiskLoadRow[] }>(
    `/api/v1/dispatch/at-risk-loads?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export type LateArrivalLoadRow = {
  id: string;
  load_number: string;
  status: string;
  customer_name: string | null;
  unit_number: string | null;
  driver_name: string | null;
  latest_eta_prediction: Record<string, unknown> | null;
  next_stop_scheduled_at: string | null;
  next_stop_city: string | null;
  next_stop_state: string | null;
  next_stop_type: string | null;
};

export function listLateArrivalDispatchLoads(operatingCompanyId: string) {
  return apiRequest<{ count: number; grace_minutes: number; loads: LateArrivalLoadRow[] }>(
    `/api/v1/dispatch/alerts/late-arrivals?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export type DispatchIntransitIssueRow = {
  id: string;
  load_id: string | null;
  driver_id: string | null;
  unit_id: string | null;
  issue_category: string;
  issue_description: string;
  severity: string;
  status: string;
  reported_at: string;
  load_number: string | null;
  unit_number: string | null;
  driver_name: string | null;
};

export function listDispatchIntransitIssues(operatingCompanyId: string, status?: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (status) q.set("status", status);
  return apiRequest<{ issues: DispatchIntransitIssueRow[] }>(`/api/v1/dispatch/intransit-issues?${q.toString()}`);
}

export function createDispatchIntransitIssue(body: {
  operating_company_id: string;
  load_id: string;
  issue_category: string;
  issue_description: string;
  severity: "info" | "warning" | "severe";
  driver_id?: string;
  unit_id?: string;
}) {
  return apiRequest<{ id: string; reported_at: string }>(`/api/v1/dispatch/intransit-issues/office`, { method: "POST", body });
}

export function resolveDispatchIntransitIssue(issueId: string, body: { operating_company_id: string; notes?: string }) {
  return apiRequest<{ id: string; status: string }>(`/api/v1/dispatch/intransit-issues/${issueId}/resolve`, {
    method: "POST",
    body,
  });
}

export type DispatchAssignmentHistoryRow = {
  id: string;
  load_id: string;
  assignment_method: string;
  reason_code: string | null;
  notes: string | null;
  assigned_at: string;
  load_number: string | null;
  previous_driver_name: string | null;
  new_driver_name: string | null;
  previous_unit_number: string | null;
  new_unit_number: string | null;
};

export function listDispatchAssignmentHistory(
  operatingCompanyId: string,
  filters?: { driver_id?: string; from?: string; to?: string; reason?: string }
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (filters?.driver_id) q.set("driver_id", filters.driver_id);
  if (filters?.from) q.set("from", filters.from);
  if (filters?.to) q.set("to", filters.to);
  if (filters?.reason) q.set("reason", filters.reason);
  return apiRequest<{ rows: DispatchAssignmentHistoryRow[] }>(`/api/v1/dispatch/assignment-history?${q.toString()}`);
}

export type PlannerDriverRow = {
  id: string;
  name: string;
  unit_number: string | null;
  hos_status: "ok" | "warning_1hr" | "warning_15min" | "violation";
  blackouts: Array<{ start_at: string; end_at: string; reason: string }>;
};

export type PlannerLoadEvent = {
  id: string;
  load_number: string;
  driver_id: string;
  customer_name: string | null;
  status: string;
  start_at: string;
  end_at: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
};

export type PlannerWeekPayload = {
  week_start: string;
  week_end: string;
  drivers: PlannerDriverRow[];
  loads: PlannerLoadEvent[];
};

export function getDispatchPlannerWeek(operatingCompanyId: string, weekStart?: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (weekStart) q.set("week_start", weekStart);
  return apiRequest<PlannerWeekPayload>(`/api/v1/dispatch/planner/week?${q.toString()}`);
}

export function patchDispatchPlannerLoadStartAt(
  loadId: string,
  body: { operating_company_id: string; start_at: string; driver_id?: string }
) {
  return apiRequest<PlannerLoadEvent>(`/api/v1/dispatch/planner/loads/${loadId}/start_at`, {
    method: "PATCH",
    body,
  });
}

export type DetentionBoardEvent = {
  id: string;
  load_id: string;
  load_number: string;
  customer_name: string | null;
  stop_city: string | null;
  stop_state: string | null;
  stop_type: string | null;
  driver_name: string | null;
  status: string;
  started_at: string;
  stopped_at: string | null;
  free_time_minutes: number;
  rate_per_hour_cents: number;
  billable_minutes: number;
  live_accrued_amount_cents: number;
  accrued_amount_cents: number;
  notify_due: boolean;
  customer_notified_at: string | null;
};

export function getDetentionBoard(operatingCompanyId: string) {
  return apiRequest<{
    count: number;
    active_count: number;
    notify_threshold_minutes: number;
    events: DetentionBoardEvent[];
  }>(`/api/v1/dispatch/detention/board?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}

export function syncDetentionFromArrivals(operatingCompanyId: string) {
  return apiRequest<{ started: number; stopped: number }>(`/api/v1/dispatch/detention/sync`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export function closeDetentionEvent(eventId: string, body: { operating_company_id: string; stopped_at?: string }) {
  return apiRequest<Record<string, unknown>>(`/api/v1/dispatch/detention/events/${eventId}/close`, {
    method: "POST",
    body,
  });
}

export function bridgeDetentionBilling(eventId: string, body: { operating_company_id: string }) {
  return apiRequest<{ event: Record<string, unknown>; bridge: Record<string, unknown> }>(
    `/api/v1/dispatch/detention/events/${eventId}/bridge-billing`,
    { method: "POST", body }
  );
}

export function notifyDetentionCustomer(eventId: string, body: { operating_company_id: string }) {
  return apiRequest<{ ok: boolean; notified_at?: string }>(
    `/api/v1/dispatch/detention/events/${eventId}/notify-customer`,
    { method: "POST", body }
  );
}

export type DetentionRequest = {
  id: string;
  detention_event_id: string;
  load_id: string;
  load_number: string;
  customer_name: string | null;
  stop_type: string | null;
  stop_city: string | null;
  stop_state: string | null;
  billable_minutes: number;
  rate_per_hour_cents: number;
  amount_cents: number;
  status: "pending_review" | "approved" | "rejected" | "invoiced";
  reviewed_at: string | null;
  rejection_reason: string | null;
  invoice_id: string | null;
  created_at: string;
};

export type DetentionApprovalKpis = {
  pending_count: number;
  week_approved_cents: number;
  ytd_approved_cents: number;
};

export function getDetentionRequests(operatingCompanyId: string, status?: string) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (status) params.set("status", status);
  return apiRequest<{ count: number; requests: DetentionRequest[] }>(
    `/api/v1/dispatch/detention/requests?${params.toString()}`
  );
}

export function getDetentionApprovalKpis(operatingCompanyId: string) {
  return apiRequest<DetentionApprovalKpis>(
    `/api/v1/dispatch/detention/requests/kpis?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function approveDetentionRequest(requestId: string, body: { operating_company_id: string }) {
  return apiRequest<Record<string, unknown>>(`/api/v1/dispatch/detention/requests/${requestId}/approve`, {
    method: "PATCH",
    body,
  });
}

export function rejectDetentionRequest(
  requestId: string,
  body: { operating_company_id: string; reason: string }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/dispatch/detention/requests/${requestId}/reject`, {
    method: "PATCH",
    body,
  });
}

export type OcrIntakeExtractedFields = {
  customer_name_raw?: string;
  customer_id?: string | null;
  origin_city?: string;
  origin_state?: string;
  destination_city?: string;
  destination_state?: string;
  pickup_date?: string;
  delivery_date?: string;
  rate_cents?: number;
  load_number_external?: string;
  confidence_score?: number;
  ocr_source_pdf_r2_key?: string;
};

export type OcrIntakeQueueItem = {
  id: string;
  operating_company_id: string;
  status: string;
  source: string;
  email_from: string | null;
  email_subject: string | null;
  source_pdf_r2_key: string;
  attachment_filename: string | null;
  extracted_fields: OcrIntakeExtractedFields;
  confidence_score: number | null;
  error_message: string | null;
  created_at: string;
};

export function getOcrIntakeQueue(operatingCompanyId: string) {
  return apiRequest<{ items: OcrIntakeQueueItem[] }>(
    `/api/v1/dispatch/ocr-intake/queue?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function convertOcrIntakeToBookLoad(itemId: string, body: { operating_company_id: string }) {
  return apiRequest<{ item: OcrIntakeQueueItem; book_load_prefill: Record<string, unknown> }>(
    `/api/v1/dispatch/ocr-intake/items/${itemId}/convert`,
    { method: "POST", body }
  );
}

export type CustomerNotifyPreferences = {
  customer_id: string;
  opt_in: boolean;
  notify_sms: boolean;
  notify_email: boolean;
  notify_on_departed: boolean;
  notify_on_arrived: boolean;
  notify_on_near_arrival: boolean;
  notify_on_delayed: boolean;
};

export type CustomerNotifyLogEntry = {
  id: string;
  load_id: string;
  load_number: string | null;
  customer_id: string;
  customer_name: string | null;
  stop_id: string | null;
  milestone_type: string;
  channel: string;
  recipient: string;
  template_key: string;
  subject: string | null;
  provider_id: string | null;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

export function getCustomerNotifyLog(operatingCompanyId: string, customerId?: string) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (customerId) params.set("customer_id", customerId);
  return apiRequest<{ entries: CustomerNotifyLogEntry[]; count: number }>(
    `/api/v1/dispatch/customer-notify/log?${params.toString()}`
  );
}

export function getCustomerNotifyPreferences(customerId: string, operatingCompanyId: string) {
  return apiRequest<{ preferences: CustomerNotifyPreferences }>(
    `/api/v1/dispatch/customer-notify/preferences/${encodeURIComponent(customerId)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function updateCustomerNotifyPreferences(
  customerId: string,
  body: { operating_company_id: string } & Partial<Omit<CustomerNotifyPreferences, "customer_id">>
) {
  return apiRequest<{ preferences: CustomerNotifyPreferences }>(
    `/api/v1/dispatch/customer-notify/preferences/${encodeURIComponent(customerId)}`,
    { method: "PUT", body }
  );
}

export function syncCustomerNotify(operatingCompanyId: string) {
  return apiRequest<{ arrivals_processed: number; eta_processed: number; sent: number }>(
    `/api/v1/dispatch/customer-notify/sync`,
    { method: "POST", body: { operating_company_id: operatingCompanyId } }
  );
}

export type PodDocumentSummary = {
  id: string;
  load_id: string;
  load_number: string | null;
  stop_id: string;
  driver_id: string;
  driver_name: string | null;
  photo_r2_key: string | null;
  signature_r2_key: string | null;
  recipient_name: string | null;
  notes: string | null;
  status: string;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
};

export type BolDocumentSummary = {
  id: string;
  pdf_r2_key: string;
  sha256: string | null;
  generated_at: string;
  template_version: string;
};

export function getPodDocuments(
  operatingCompanyId: string,
  opts?: { load_id?: string; status?: string; limit?: number }
) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (opts?.load_id) params.set("load_id", opts.load_id);
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit) params.set("limit", String(opts.limit));
  return apiRequest<{ documents: PodDocumentSummary[]; count: number }>(
    `/api/v1/dispatch/pod-documents?${params.toString()}`
  );
}

export function reviewPodDocument(
  podId: string,
  body: { operating_company_id: string; status: "approved" | "rejected"; review_notes?: string }
) {
  return apiRequest<{ pod: Record<string, unknown> }>(`/api/v1/dispatch/pod-documents/${encodeURIComponent(podId)}/review`, {
    method: "POST",
    body,
  });
}

export function getLoadPodBolSummary(loadId: string, operatingCompanyId: string) {
  return apiRequest<{ pods: PodDocumentSummary[]; bols: BolDocumentSummary[] }>(
    `/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/pod-bol?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function generateLoadBol(loadId: string, operatingCompanyId: string) {
  return apiRequest<{ bol: BolDocumentSummary & { filename?: string } }>(
    `/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/bol/generate`,
    { method: "POST", body: { operating_company_id: operatingCompanyId } }
  );
}

export function downloadBolDocument(bolId: string, operatingCompanyId: string) {
  return apiRequest<{ download_url: string; expires_in_seconds: number }>(
    `/api/v1/dispatch/bol-documents/${encodeURIComponent(bolId)}/download?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}
