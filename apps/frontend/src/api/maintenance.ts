import { ApiError, apiRequest, resolveApiUrl } from "./client";

export type WorkOrderType = "pm" | "repair" | "tire" | "accident";
export type WorkOrderStatus = "open" | "in_progress" | "waiting_parts" | "complete" | "cancelled";
export type PaymentTiming = "in_house" | "paid_same_day" | "vendor_invoice";

export type MaintenanceKpis = {
  open_wos: number;
  in_shop: number;
  past_due_pm: number;
  out_of_service: number;
  open_damage: number;
  avg_wo_age_days: number;
  mtd_repair_cost: number;
  mtd_parts_cost: number;
  avg_wo_cost: number;
  top_vendor: string | null;
  top_failure: string | null;
  pending_qbo: number;
};

export type MaintenancePmAlert = {
  id: string;
  unit_id: string;
  unit_number: string;
  pm_schedule_id: string;
  schedule_label: string;
  trigger_odometer: number;
  triggered_at: string;
  state: "open" | "acknowledged" | "scheduled" | "dismissed";
  scheduled_work_order_id: string | null;
};

export type WorkOrder = {
  id: string;
  display_id?: string | null;
  operating_company_id?: string;
  wo_type: WorkOrderType;
  status: WorkOrderStatus;
  unit_id: string;
  unit_number?: string | null;
  driver_id?: string | null;
  load_id?: string | null;
  repair_location?: string | null;
  bucket?: "in_house" | "external" | "roadside" | null;
  description?: string | null;
  source_type?: "IS" | "ES" | "AC" | "ET" | "RT" | "IT" | "RS" | null;
  external_vendor_id?: string | null;
  external_vendor_wo_number?: string | null;
  external_vendor_invoice_number?: string | null;
  severity?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  duration_seconds?: number | null;
  roadside_callout_at?: string | null;
  roadside_arrived_at?: string | null;
  roadside_response_minutes?: number | null;
  roadside_provider_vendor_id?: string | null;
  roadside_provider_name?: string | null;
  roadside_location?: string | null;
  roadside_breakdown_load_id?: string | null;
  updated_at?: string | null;
};

export type DtcAutoWorkOrderRow = {
  id: string;
  display_id?: string | null;
  unit_id: string;
  unit_number: string | null;
  status: string;
  description: string | null;
  opened_at: string | null;
  updated_at: string | null;
};

export type ArrivingSoonCard = {
  load_id: string;
  load_display_id: string;
  load_status: string;
  unit_id: string;
  unit_number: string;
  driver_id: string | null;
  driver_name: string | null;
  final_dest_name: string | null;
  final_dest_city: string | null;
  final_dest_state: string | null;
  final_dest_is_yard: boolean;
  predicted_yard_arrival_at: string | null;
  hours_until_yard_arrival: number | null;
  already_arrived: boolean;
  eta_confidence: string | null;
  issues: Array<{
    issue_id: string;
    issue_type: string;
    severity: "info" | "warning" | "severe" | string;
    description: string;
    reported_at: string;
    reported_lat?: number | null;
    reported_lon?: number | null;
  }>;
  severe_count: number;
  warning_count: number;
  info_count: number;
  total_open_issues: number;
  suggested_wo_source_type: "IS" | "ES" | "AC" | "ET" | "RT" | "IT" | "RS";
};

export type InTransitIssue = {
  id: string;
  reported_at: string;
  unit_id: string;
  driver_id: string;
  issue_category: string;
  issue_description: string;
  severity: string;
  unit_display_id: string;
  driver_full_name: string;
  gps_lat?: number | null;
  gps_lng?: number | null;
  gps_label?: string | null;
  hours_since_report: number;
};

export type PartsInventoryRow = {
  id: string;
  operating_company_id: string;
  part_description: string;
  vendor_id: string | null;
  last_purchase_invoice_number: string | null;
  last_purchase_amount: number | null;
  last_purchase_date: string | null;
  on_hand_qty: number;
  location: string | null;
  created_at: string;
  updated_at: string;
};

export type SevereRepairEstimate = {
  id: string;
  unit_id: string;
  unit_number: string | null;
  trigger_wo_id: string | null;
  damage_severity: "severe" | "out_of_service" | "total_loss";
  estimate_status: "open" | "awaiting_approval" | "approved" | "rejected" | "completed";
  estimate_location: string | null;
  estimated_labor_cents: number;
  estimated_parts_cents: number;
  estimated_outside_service_cents: number;
  estimated_total_cents: number;
  description: string | null;
  estimated_completion_date: string | null;
  refreshed_at: string;
  is_oos: boolean;
  oos_since: string | null;
  days_oos: number;
};

export type SevereRepairRollup = {
  open_count: number;
  total_cents: number;
  avg_days_oos: number;
  oldest_oos_days: number;
};

export type FleetRestoreCost = {
  total_estimated_cents: number;
  total_actual_cents: number;
  total_remaining_cents: number;
  unit_count: number;
  avg_days_open: number;
};

export type CreateWorkOrderLegacyPayload = {
  operating_company_id: string;
  wo_type: WorkOrderType;
  status?: WorkOrderStatus;
  unit_id: string;
  driver_id?: string;
  load_id?: string;
  service_date?: string;
  repair_location: string;
  vendor_id?: string;
  vendor_invoice_number?: string;
  source_type?: "IS" | "ES" | "AC" | "ET" | "RT" | "IT" | "RS";
  external_vendor_id?: string;
  external_vendor_wo_number?: string;
  external_vendor_invoice_number?: string;
  description: string;
  severity?: string;
  payment_timing: PaymentTiming;
  bill_terms?: string;
  bill_date?: string;
  due_date?: string;
  line_items: Array<{
    line_type: "parts" | "labor" | "other";
    description: string;
    quantity: number;
    unit_cost: number;
    amount: number;
  }>;
};

export type CreateWorkOrderTwoSectionPayload = {
  header: {
    operating_company_id: string;
    attachment_draft_id?: string;
    wo_type: WorkOrderType;
    source_type?: "IS" | "ES" | "AC" | "ET" | "RT" | "IT" | "RS";
    unit_id: string;
    driver_id?: string;
    load_id?: string;
    load_exemption_reason?: string;
    service_date?: string;
    repair_location: string;
    bucket?: "in_house" | "external" | "roadside";
    vendor_id?: string;
    vendor_qbo_id?: string;
    shop_name?: string;
    shop_address?: string;
    shop_phone?: string;
    vendor_invoice_number?: string;
    external_vendor_id?: string;
    external_vendor_wo_number?: string;
    external_vendor_invoice_number?: string;
    description: string;
    payment_timing: PaymentTiming;
    bill_terms?: string;
    bill_date?: string;
    due_date?: string;
    payment_account_uuid?: string;
    roadside_callout_at?: string;
    roadside_arrived_at?: string;
    roadside_provider_vendor_id?: string;
    roadside_location?: string;
    roadside_breakdown_load_id?: string;
  };
  sectionA: Array<{
    description: string;
    quantity: number;
    amount: number;
    expense_category_uuid: string;
  }>;
  sectionB: Array<{
    description: string;
    quantity: number;
    unit_cost: number;
    amount: number;
    service_item_uuid: string;
    sub_rows: Array<{
      line_type: "parts" | "labor";
      description: string;
      quantity: number;
      unit_cost: number;
      amount: number;
      part_uuid?: string;
      labor_rate_uuid?: string;
      part_location_codes?: string[];
    }>;
  }>;
};

function query(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export function getMaintenanceKpis(companyId: string) {
  return apiRequest<MaintenanceKpis>(`/api/v1/maintenance/dashboard/kpis?${query(companyId)}`);
}

export type MaintKpiSparkPoint = { day: string; value: number };

export type MaintKpiSummary = {
  period: { start: string; end: string };
  unit_id: string | null;
  downtime_hours: number;
  mtbf_hours: number | null;
  cpm_cents: number | null;
  cost_per_truck_cents: number;
  pm_compliance_pct: number;
  sparklines: {
    downtime: MaintKpiSparkPoint[];
    mtbf: MaintKpiSparkPoint[];
    cpm: MaintKpiSparkPoint[];
    cost_per_truck: MaintKpiSparkPoint[];
    pm_compliance: MaintKpiSparkPoint[];
  };
};

export type MaintKpiDrilldownKind = "downtime" | "mtbf" | "cpm" | "cost_per_truck";

function maintKpiQuery(companyId: string, periodStart: string, periodEnd: string, unitId?: string) {
  const q = new URLSearchParams({
    operating_company_id: companyId,
    period_start: periodStart,
    period_end: periodEnd,
  });
  if (unitId) q.set("unit_id", unitId);
  return q.toString();
}

export function getMaintenanceKpiSummary(companyId: string, periodStart: string, periodEnd: string, unitId?: string) {
  return apiRequest<MaintKpiSummary>(`/api/v1/maintenance/kpi/summary?${maintKpiQuery(companyId, periodStart, periodEnd, unitId)}`);
}

export function getMaintenanceKpiDrilldown(
  kind: MaintKpiDrilldownKind,
  companyId: string,
  periodStart: string,
  periodEnd: string,
  unitId?: string
) {
  return apiRequest<{ kind: string; rows: Record<string, unknown>[]; report_cross_link?: string }>(
    `/api/v1/maintenance/kpi/${kind}?${maintKpiQuery(companyId, periodStart, periodEnd, unitId)}`
  );
}

export function getMaintenanceKpiPmCompliance(companyId: string, periodStart: string, periodEnd: string, unitId?: string) {
  return apiRequest<{
    rows: Array<{
      schedule_id: string;
      schedule_label: string;
      unit_number: string;
      unit_id: string;
      compliance_status: string;
      next_due_odometer: number | null;
    }>;
    hub_links: { pm_auto_engine: string; pm_schedule: string };
  }>(`/api/v1/maintenance/kpi/pm-compliance?${maintKpiQuery(companyId, periodStart, periodEnd, unitId)}`);
}

export function listMaintenancePmAlerts(companyId: string) {
  return apiRequest<{ alerts: MaintenancePmAlert[] }>(`/api/v1/maintenance/pm-alerts?${query(companyId)}`);
}

export function acknowledgeMaintenancePmAlert(alertId: string, companyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/maintenance/pm-alerts/${encodeURIComponent(alertId)}/ack`, {
    method: "PATCH",
    body: { operating_company_id: companyId },
  });
}

export function scheduleMaintenancePmAlert(alertId: string, companyId: string, workOrderId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/maintenance/pm-alerts/${encodeURIComponent(alertId)}/schedule`, {
    method: "PATCH",
    body: { operating_company_id: companyId, work_order_id: workOrderId },
  });
}

export function getVendorIntegrityHistory(vendorId: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/maintenance/integrity/vendor-history/${encodeURIComponent(vendorId)}?${query(companyId)}`);
}

export function getMaintenanceRmStatus(companyId: string) {
  return apiRequest<{ in_house: WorkOrder[]; external: WorkOrder[]; roadside: WorkOrder[] }>(
    `/api/v1/maintenance/dashboard/rm-status?${query(companyId)}`
  );
}

export function getMaintenanceSevereAlerts(companyId: string) {
  return apiRequest<{ alerts: Array<Record<string, unknown>> }>(
    `/api/v1/maintenance/dashboard/severe-alerts?${query(companyId)}`
  );
}

export function listSevereRepairEstimates(companyId: string) {
  return apiRequest<{ data: SevereRepairEstimate[] }>(
    `/api/v1/maintenance/severe-repair-estimates?${query(companyId)}`
  );
}

export function getSevereRepairRollup(companyId: string) {
  return apiRequest<{ data: SevereRepairRollup }>(
    `/api/v1/maintenance/severe-repair-estimates/total?${query(companyId)}`
  );
}

export function getFleetRestoreCost(companyId: string) {
  return apiRequest<{ data: FleetRestoreCost }>(
    `/api/v1/maintenance/severe-repair/fleet-restore-cost?${query(companyId)}`
  );
}

export function exportSevereRepairInsurancePdf(operatingCompanyId: string) {
  return resolveApiUrl(
    `/api/v1/maintenance/severe-repair/export-pdf?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function refreshSevereRepairEstimate(id: string, operatingCompanyId: string) {
  return apiRequest<{ data: { id: string; estimated_total_cents: number } }>(
    `/api/v1/maintenance/severe-repair-estimates/${id}/refresh`,
    {
      method: "POST",
      body: { operating_company_id: operatingCompanyId },
    }
  );
}

export function markUnitOos(
  unitId: string,
  payload: { operating_company_id: string; reason: string; oos_location?: string }
) {
  return apiRequest<{ data: { unit_id: string } }>(`/api/v1/maintenance/units/${unitId}/mark-oos`, {
    method: "POST",
    body: payload,
  });
}

export function markUnitBackInService(
  unitId: string,
  payload: { operating_company_id: string; review_notes: string }
) {
  return apiRequest<{ data: { unit_id: string } }>(`/api/v1/maintenance/units/${unitId}/mark-back-in-service`, {
    method: "POST",
    body: payload,
  });
}

export function getMaintenanceInTransitQueue(companyId: string) {
  return apiRequest<{ issues: InTransitIssue[] }>(
    `/api/v1/maintenance/dashboard/intransit-triage-queue?${query(companyId)}`
  );
}

export function getMaintenanceRecentActivity(companyId: string) {
  return apiRequest<{ recent: WorkOrder[]; completed: WorkOrder[] }>(
    `/api/v1/maintenance/dashboard/recent-activity?${query(companyId)}`
  );
}

export function getMaintenanceDtcAutoWorkOrders(companyId: string) {
  return apiRequest<{ rows: DtcAutoWorkOrderRow[] }>(
    `/api/v1/maintenance/dashboard/dtc-auto-work-orders?${query(companyId)}`
  );
}

export function listWorkOrders(companyId: string) {
  return apiRequest<{ work_orders: WorkOrder[]; total_count: number }>(`/api/v1/maintenance/work-orders?${query(companyId)}`);
}

export function listWorkOrdersFiltered(
  companyId: string,
  params: { source_type?: string; external_vendor_id?: string; status?: string; location?: string; bucket?: string } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.source_type) qs.set("source_type", params.source_type);
  if (params.external_vendor_id) qs.set("external_vendor_id", params.external_vendor_id);
  if (params.status) qs.set("status", params.status);
  if (params.location) qs.set("location", params.location);
  if (params.bucket) qs.set("bucket", params.bucket);
  return apiRequest<{ work_orders: WorkOrder[]; total_count: number }>(`/api/v1/maintenance/work-orders?${qs.toString()}`);
}

export function getWorkOrder(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/maintenance/work-orders/${id}?${query(companyId)}`);
}

export function getMaintenanceWorkOrderPdfUrl(id: string, companyId: string) {
  return resolveApiUrl(`/api/v1/maintenance/work-orders/${id}/pdf?${query(companyId)}`);
}

export function createWorkOrder(payload: CreateWorkOrderLegacyPayload | CreateWorkOrderTwoSectionPayload) {
  return apiRequest<WorkOrder | { wo: { uuid: string; display_id: string }; bill?: { uuid: string }; expense?: { uuid: string } }>(
    "/api/v1/maintenance/work-orders",
    { method: "POST", body: payload }
  );
}

export function updateWorkOrder(
  id: string,
  companyId: string,
  payload: {
    external_vendor_id?: string | null;
    external_vendor_wo_number?: string | null;
    external_vendor_invoice_number?: string | null;
    description?: string;
  }
) {
  return apiRequest<WorkOrder>(`/api/v1/maintenance/work-orders/${id}?${query(companyId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function completeWorkOrder(id: string, companyId: string) {
  return apiRequest<{ ok: boolean; work_order?: WorkOrder }>(`/api/v1/maintenance/work-orders/${id}/complete?${query(companyId)}`, {
    method: "PATCH",
  });
}

export function transitionWorkOrder(
  id: string,
  companyId: string,
  payload: { new_status: WorkOrderStatus; cancellation_reason?: string }
) {
  return apiRequest<{ ok: boolean }>(`/api/v1/maintenance/work-orders/${id}/transition?${query(companyId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function convertInTransitIssueToWo(
  issueId: string,
  companyId: string,
  payload: { wo_type: WorkOrderType; additional_notes?: string }
) {
  return apiRequest<{ work_order_id: string }>(`/api/v1/maintenance/triage/${issueId}/convert-to-wo?${query(companyId)}`, {
    method: "POST",
    body: payload,
  });
}

export function convertInTransitIssueToDamage(
  issueId: string,
  companyId: string,
  payload: { damage_category: string; additional_notes?: string }
) {
  return apiRequest<{ damage_report_id: string }>(
    `/api/v1/maintenance/triage/${issueId}/convert-to-damage?${query(companyId)}`,
    {
      method: "POST",
      body: payload,
    }
  );
}

export function getArrivingSoon(params: {
  operating_company_id: string;
  within_hours?: number;
  include_already_arrived?: boolean;
  include_non_yard_destination?: boolean;
  severity_min?: "info" | "warning" | "severe";
}) {
  const qs = new URLSearchParams();
  qs.set("operating_company_id", params.operating_company_id);
  if (params.within_hours != null) qs.set("within_hours", String(params.within_hours));
  if (params.include_already_arrived != null) qs.set("include_already_arrived", String(params.include_already_arrived));
  if (params.include_non_yard_destination != null) qs.set("include_non_yard_destination", String(params.include_non_yard_destination));
  if (params.severity_min) qs.set("severity_min", params.severity_min);
  return apiRequest<{ cards: ArrivingSoonCard[]; counts: Record<string, number> }>(`/api/v1/maintenance/arriving-soon?${qs.toString()}`);
}

export function convertIssueToWo(
  loadId: string,
  companyId: string,
  payload: { issue_id: string; wo_source_type: "IS" | "ES" | "AC" | "ET" | "RT" | "IT" | "RS"; additional_notes?: string }
) {
  return apiRequest<{ wo: WorkOrder; issue_updated: Record<string, unknown>; unit_blocked: boolean }>(
    `/api/v1/maintenance/arriving-soon/${loadId}/convert-issue-to-wo?${query(companyId)}`,
    {
      method: "POST",
      body: payload,
    }
  );
}

export type ExpenseLoadSuggestion = {
  load_id: string;
  load_number: string;
  confidence: "exact" | "fuzzy" | "none";
};

export function suggestExpenseLoad(params: {
  operating_company_id: string;
  transaction_date: string;
  driver_id?: string;
  unit_id?: string;
  trailer_id?: string;
}) {
  const qs = new URLSearchParams({
    operating_company_id: params.operating_company_id,
    transaction_date: params.transaction_date,
  });
  if (params.driver_id) qs.set("driver_id", params.driver_id);
  if (params.unit_id) qs.set("unit_id", params.unit_id);
  if (params.trailer_id) qs.set("trailer_id", params.trailer_id);
  return apiRequest<{ data: ExpenseLoadSuggestion | null }>(`/api/v1/expenses/suggest-load?${qs.toString()}`);
}

export function logArrivingSoonView(companyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/maintenance/arriving-soon/audit-view?${query(companyId)}`, {
    method: "POST",
  });
}

export function listPartsInventory(operatingCompanyId: string) {
  return apiRequest<{ rows: PartsInventoryRow[] }>(
    `/api/v1/maintenance/parts-inventory?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  ).then((result) => result.rows);
}

export function adjustPartsInventory(
  rowId: string,
  operatingCompanyId: string,
  body: { delta_qty: number; reason: "used" | "discarded" | "shrinkage" | "recount" }
) {
  return apiRequest<PartsInventoryRow>(
    `/api/v1/maintenance/parts-inventory/${encodeURIComponent(rowId)}/adjust?operating_company_id=${encodeURIComponent(
      operatingCompanyId
    )}`,
    {
      method: "PATCH",
      body,
    }
  );
}

export function recordPartsPurchase(
  operatingCompanyId: string,
  body: {
    part_description: string;
    qty_received: number;
    vendor_id?: string;
    vendor_invoice_number?: string;
    purchase_amount?: number;
    location?: string;
  }
) {
  return apiRequest<PartsInventoryRow>(
    `/api/v1/maintenance/parts-inventory/purchases?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    {
      method: "POST",
      body,
    }
  );
}

export type DriverReportRow = {
  id: string;
  operating_company_id: string;
  driver_id: string;
  driver_name: string | null;
  load_id: string | null;
  load_number: string | null;
  report_type: string;
  description: string;
  photo_r2_paths: string[] | null;
  voice_memo_r2_path: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  reported_at: string;
  status: "submitted" | "under_review" | "resolved" | "dismissed";
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listDriverReports(params: { operating_company_id: string; status?: string }) {
  const qs = new URLSearchParams({ operating_company_id: params.operating_company_id });
  if (params.status) qs.set("status", params.status);
  return apiRequest<{ rows: DriverReportRow[] }>(`/api/v1/maintenance/driver-reports?${qs.toString()}`);
}

export async function updateDriverReportStatus(
  id: string,
  body: {
    operating_company_id: string;
    status: "under_review" | "resolved" | "dismissed";
    resolution_notes?: string;
  }
) {
  return apiRequest<DriverReportRow>(`/api/v1/maintenance/driver-reports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
}


export type MaintenanceLaborCodeRow = {
  id: string; code: string; display_name: string; description: string | null;
  rate_cents_per_hour: number | null; metadata: Record<string, unknown>; is_active: boolean; sort_order: number;
};
export async function listMaintenanceLaborCodes(operatingCompanyId: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ labor_codes: MaintenanceLaborCodeRow[] }>(`/api/v1/maintenance/labor-codes?${qs.toString()}`);
}

export type WoCostContextPayload = {
  expense_categories: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  parts: Array<Record<string, unknown>>;
  labor_rates: Array<Record<string, unknown>>;
};

export type MaintPmDueRow = {
  id: string;
  asset_id: string;
  unit_code: string;
  pm_type: "oil" | "tires" | "dot_inspection" | "brake" | string;
  is_due: boolean;
  due_reasons: Array<"miles" | "date">;
  miles_remaining: number | null;
  days_remaining: number | null;
  current_odometer_mi: number | null;
  next_due_miles: number | null;
  next_due_date: string | null;
};

export type MaintPartRow = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit_cost_cents: number;
  qty_on_hand: number;
  reorder_point: number;
  needs_reorder: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkOrderPostingPreviewLine = {
  line_type: "parts" | "labor" | "other" | string;
  description: string;
  quantity: number;
  amount_cents: number;
  asset_id?: string | null;
  asset_unit_code?: string | null;
  ps_category_id?: string | null;
  ps_category_name?: string | null;
  ps_item_id?: string | null;
  ps_item_name?: string | null;
  account_id?: string | null;
  account_name?: string | null;
};

export type WorkOrderPostingPreview = {
  work_order_id: string;
  currency: string;
  vendor_id: string | null;
  bill_date: string | null;
  due_date: string | null;
  total_cents: number;
  lines: WorkOrderPostingPreviewLine[];
};

export function getWoCostContext(operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<WoCostContextPayload>(`/api/v1/maintenance/wo-cost-context?${q.toString()}`);
}

export function listMaintPmDue(operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ rows: MaintPmDueRow[] }>(`/api/v1/maint/pm/due?${q.toString()}`);
}

export function listMaintParts(operatingCompanyId: string, params: { search?: string } = {}) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.search) q.set("search", params.search);
  return apiRequest<{ rows: MaintPartRow[] }>(`/api/v1/maint/parts?${q.toString()}`);
}

export async function getWorkOrderPostingPreview(workOrderId: string, operatingCompanyId: string) {
  const q = `operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
  const candidatePaths = [
    `/api/v1/maint/work-orders/${encodeURIComponent(workOrderId)}/posting-preview?${q}`,
    `/api/v1/maintenance/work-orders/${encodeURIComponent(workOrderId)}/posting-preview?${q}`,
  ];

  let lastError: unknown = null;
  for (const path of candidatePaths) {
    try {
      return await apiRequest<WorkOrderPostingPreview>(path);
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError && [404, 405, 501].includes(error.status)) {
        continue;
      }
      throw error;
    }
  }

  if (lastError instanceof ApiError && [404, 405, 501].includes(lastError.status)) {
    return null;
  }
  throw lastError;
}

export type PmScheduleRow = {
  id: string;
  unit_id: string;
  unit_display_id: string;
  pm_type: string;
  interval_kind: string;
  interval_value: number;
  status: "current" | "due_soon" | "overdue";
};

export function listMaintenancePmSchedules(operatingCompanyId: string) {
  return apiRequest<{ rows: PmScheduleRow[] }>(
    `/api/v1/maintenance/pm-schedule?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function createMaintenancePmSchedule(
  body: {
    operating_company_id: string;
    unit_id: string;
    pm_type: string;
    interval_kind: "miles" | "hours" | "days";
    interval_value: number;
    last_service_odometer?: number;
  }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/maintenance/pm-schedule`, { method: "POST", body });
}

export function generateMaintenancePmWorkOrder(id: string, operatingCompanyId: string) {
  return apiRequest<{ work_order_id: string }>(
    `/api/v1/maintenance/pm-schedule/${encodeURIComponent(id)}/generate-wo?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST" }
  );
}

export type MaintenanceInspectionType = "annual_dot" | "pre_trip" | "post_trip" | "custom";
export type MaintenanceInspectionStatus = "scheduled" | "in_progress" | "completed" | "archived";
export type MaintenanceInspectionOutcome = "pass" | "fail" | "pending";

export type MaintenanceInspectionRow = {
  id: string;
  operating_company_id?: string;
  unit_id: string;
  unit_number?: string | null;
  inspection_type: MaintenanceInspectionType;
  inspection_type_label?: string;
  status: MaintenanceInspectionStatus;
  scheduled_date?: string | null;
  inspection_date?: string | null;
  inspector_name?: string | null;
  mileage?: number | null;
  outcome?: MaintenanceInspectionOutcome | null;
  notes?: string;
  defects?: string[];
  dvir_submission_id?: string | null;
  dvir_type?: string | null;
  dvir_submitted_at?: string | null;
  is_ad_hoc?: boolean;
  archived_at?: string | null;
  archive_reason?: string | null;
  photo_count?: number;
  created_at?: string;
  updated_at?: string;
};

export function listMaintenanceInspections(
  operatingCompanyId: string,
  params: { include_archived?: boolean; unit_id?: string } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.include_archived != null) q.set("include_archived", String(params.include_archived));
  if (params.unit_id) q.set("unit_id", params.unit_id);
  return apiRequest<{ rows: MaintenanceInspectionRow[] }>(`/api/v1/maintenance/inspections?${q.toString()}`);
}

export function getMaintenanceInspectionDetail(id: string, operatingCompanyId: string) {
  return apiRequest<{
    inspection: MaintenanceInspectionRow;
    photos: Array<Record<string, unknown>>;
  }>(`/api/v1/maintenance/inspections/${encodeURIComponent(id)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}

export function createMaintenanceInspection(body: Record<string, unknown>) {
  return apiRequest<MaintenanceInspectionRow>(`/api/v1/maintenance/inspections`, { method: "POST", body });
}

export function updateMaintenanceInspection(id: string, body: Record<string, unknown>) {
  return apiRequest<MaintenanceInspectionRow>(`/api/v1/maintenance/inspections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
}

export function archiveMaintenanceInspection(id: string, operatingCompanyId: string, archiveReason: string) {
  return apiRequest<{ ok: boolean; id: string }>(`/api/v1/maintenance/inspections/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, archive_reason: archiveReason },
  });
}

export type ServiceTimelineEventType = "work_order" | "inspection" | "pm" | "fuel" | "accident";

export type ServiceTimelineEvent = {
  id: string;
  event_type: ServiceTimelineEventType;
  occurred_at: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  detail_path: string;
};

export function getMaintenanceServiceTimeline(params: {
  operating_company_id: string;
  unit_id?: string;
  equipment_id?: string;
  event_types?: ServiceTimelineEventType[];
  from_date?: string;
  to_date?: string;
  limit?: number;
}) {
  const q = new URLSearchParams({ operating_company_id: params.operating_company_id });
  if (params.unit_id) q.set("unit_id", params.unit_id);
  if (params.equipment_id) q.set("equipment_id", params.equipment_id);
  if (params.event_types?.length) q.set("event_types", params.event_types.join(","));
  if (params.from_date) q.set("from_date", params.from_date);
  if (params.to_date) q.set("to_date", params.to_date);
  if (params.limit != null) q.set("limit", String(params.limit));
  return apiRequest<{ events: ServiceTimelineEvent[]; filters: Record<string, unknown> }>(
    `/api/v1/maintenance/service-timeline?${q.toString()}`
  );
}

export function attachMaintenanceInspectionPhoto(
  id: string,
  body: { operating_company_id: string; docs_file_id: string; caption?: string; sort_order?: number }
) {
  return apiRequest<{ photo: Record<string, unknown> }>(
    `/api/v1/maintenance/inspections/${encodeURIComponent(id)}/photos`,
    { method: "POST", body }
  );
}

export type MaintenanceTireRecordRow = {
  id: string;
  unit_id?: string | null;
  equipment_id?: string | null;
  unit_number?: string | null;
  equipment_number?: string | null;
  position_code: string;
  position_group: "steer" | "drive" | "trailer";
  position_label?: string;
  brand_id?: string | null;
  brand_name?: string;
  serial_number?: string;
  size?: string;
  tread_depth_32nds: number;
  tread_low_threshold_32nds: number;
  is_low_tread?: boolean;
  installed_at?: string | null;
  status?: string;
  work_order_id?: string | null;
};

export type MaintenanceTireEventRow = {
  id: string;
  tire_record_id: string;
  event_type: "rotation" | "replacement" | "tread_audit";
  event_type_label?: string;
  from_position_code?: string | null;
  to_position_code?: string | null;
  tread_depth_32nds?: number | null;
  brand_name?: string;
  serial_number?: string;
  notes?: string;
  is_low_tread_alert?: boolean;
  created_at?: string;
};

export type MaintenanceTireBrandRow = {
  id: string;
  name: string;
  manufacturer?: string;
  tread_warranty_32nds?: number | null;
  is_active?: boolean;
  sort_order?: number;
};

export function listMaintenanceTireBrands(operatingCompanyId: string) {
  return apiRequest<{ rows: MaintenanceTireBrandRow[] }>(
    `/api/v1/maintenance/tires/brands?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function createMaintenanceTireBrand(body: {
  operating_company_id: string;
  name: string;
  manufacturer?: string;
  tread_warranty_32nds?: number;
}) {
  return apiRequest<MaintenanceTireBrandRow>(`/api/v1/maintenance/tires/brands`, { method: "POST", body });
}

export function getMaintenanceTireLayout(
  operatingCompanyId: string,
  params: { unit_id?: string; equipment_id?: string }
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.unit_id) q.set("unit_id", params.unit_id);
  if (params.equipment_id) q.set("equipment_id", params.equipment_id);
  return apiRequest<{
    positions: Array<{
      code: string;
      group: string;
      label: string;
      record: MaintenanceTireRecordRow | null;
    }>;
  }>(`/api/v1/maintenance/tires/layout?${q.toString()}`);
}

export function listMaintenanceTireRecords(
  operatingCompanyId: string,
  params: { unit_id?: string; equipment_id?: string; include_archived?: boolean } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.unit_id) q.set("unit_id", params.unit_id);
  if (params.equipment_id) q.set("equipment_id", params.equipment_id);
  if (params.include_archived != null) q.set("include_archived", String(params.include_archived));
  return apiRequest<{ rows: MaintenanceTireRecordRow[] }>(`/api/v1/maintenance/tires/records?${q.toString()}`);
}

export function createMaintenanceTireRecord(body: Record<string, unknown>) {
  return apiRequest<MaintenanceTireRecordRow>(`/api/v1/maintenance/tires/records`, { method: "POST", body });
}

export function rotateMaintenanceTire(body: {
  operating_company_id: string;
  tire_record_id: string;
  to_position_code: string;
  notes?: string;
  work_order_id?: string;
}) {
  return apiRequest<{ record: MaintenanceTireRecordRow }>(`/api/v1/maintenance/tires/rotate`, { method: "POST", body });
}

export function replaceMaintenanceTire(body: Record<string, unknown>) {
  return apiRequest<{ record: MaintenanceTireRecordRow }>(`/api/v1/maintenance/tires/replace`, { method: "POST", body });
}

export function auditMaintenanceTireTread(body: {
  operating_company_id: string;
  tire_record_id: string;
  tread_depth_32nds: number;
  notes?: string;
}) {
  return apiRequest<{ record: MaintenanceTireRecordRow; is_low_tread_alert: boolean }>(
    `/api/v1/maintenance/tires/tread-audit`,
    { method: "POST", body }
  );
}

export function listMaintenanceTireEvents(
  operatingCompanyId: string,
  params: { unit_id?: string; equipment_id?: string; tire_record_id?: string } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.unit_id) q.set("unit_id", params.unit_id);
  if (params.equipment_id) q.set("equipment_id", params.equipment_id);
  if (params.tire_record_id) q.set("tire_record_id", params.tire_record_id);
  return apiRequest<{ rows: MaintenanceTireEventRow[] }>(`/api/v1/maintenance/tires/events?${q.toString()}`);
}

export function listMaintenanceTireAlerts(operatingCompanyId: string) {
  return apiRequest<{ rows: MaintenanceTireRecordRow[]; count: number }>(
    `/api/v1/maintenance/tires/alerts?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export type MaintenanceWarrantyPartRow = {
  id: string;
  operating_company_id: string;
  parts_inventory_id?: string | null;
  part_description: string;
  vendor_id?: string | null;
  vendor_name?: string | null;
  warranty_months: number;
  purchased_at: string;
  expires_at: string;
  is_expired?: boolean;
  original_invoice_number?: string;
  work_order_id?: string | null;
  notes?: string;
  archived_at?: string | null;
  archive_reason?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MaintenanceWarrantyClaimRow = {
  id: string;
  operating_company_id: string;
  parts_warranty_id?: string | null;
  work_order_id?: string | null;
  vendor_id?: string | null;
  vendor_name?: string | null;
  claim_number?: string;
  status: "draft" | "filed" | "pending" | "approved" | "denied" | "reimbursed";
  status_label?: string;
  part_description: string;
  claim_amount_cents: number;
  reimbursement_amount_cents?: number | null;
  filed_at?: string | null;
  reimbursement_received_at?: string | null;
  notes?: string;
  auto_detected?: boolean;
  archived_at?: string | null;
  archive_reason?: string | null;
  created_at?: string;
  updated_at?: string;
};

export function listMaintenanceWarrantyParts(
  operatingCompanyId: string,
  params: { work_order_id?: string; include_archived?: boolean } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.work_order_id) q.set("work_order_id", params.work_order_id);
  if (params.include_archived != null) q.set("include_archived", String(params.include_archived));
  return apiRequest<{ rows: MaintenanceWarrantyPartRow[] }>(`/api/v1/maintenance/warranty/parts?${q.toString()}`);
}

export function createMaintenanceWarrantyPart(body: Record<string, unknown>) {
  return apiRequest<MaintenanceWarrantyPartRow>(`/api/v1/maintenance/warranty/parts`, { method: "POST", body });
}

export function listMaintenanceWarrantyClaims(
  operatingCompanyId: string,
  params: { work_order_id?: string; status?: string; include_archived?: boolean } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.work_order_id) q.set("work_order_id", params.work_order_id);
  if (params.status) q.set("status", params.status);
  if (params.include_archived != null) q.set("include_archived", String(params.include_archived));
  return apiRequest<{ rows: MaintenanceWarrantyClaimRow[] }>(`/api/v1/maintenance/warranty/claims?${q.toString()}`);
}

export function createMaintenanceWarrantyClaim(body: Record<string, unknown>) {
  return apiRequest<MaintenanceWarrantyClaimRow>(`/api/v1/maintenance/warranty/claims`, { method: "POST", body });
}

export function patchMaintenanceWarrantyClaim(id: string, body: Record<string, unknown>) {
  return apiRequest<MaintenanceWarrantyClaimRow>(`/api/v1/maintenance/warranty/claims/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
}

export function fileMaintenanceWarrantyClaim(id: string, body: Record<string, unknown>) {
  return apiRequest<MaintenanceWarrantyClaimRow>(
    `/api/v1/maintenance/warranty/claims/${encodeURIComponent(id)}/file`,
    { method: "POST", body }
  );
}

export function reimburseMaintenanceWarrantyClaim(id: string, body: Record<string, unknown>) {
  return apiRequest<MaintenanceWarrantyClaimRow>(
    `/api/v1/maintenance/warranty/claims/${encodeURIComponent(id)}/reimburse`,
    { method: "POST", body }
  );
}

export function archiveMaintenanceWarrantyClaim(id: string, body: Record<string, unknown>) {
  return apiRequest<{ ok: boolean; id: string }>(
    `/api/v1/maintenance/warranty/claims/${encodeURIComponent(id)}/archive`,
    { method: "POST", body }
  );
}

export function detectMaintenanceWarrantyFromWorkOrder(body: {
  operating_company_id: string;
  work_order_id: string;
  create_draft_claims?: boolean;
}) {
  return apiRequest<{
    work_order_id: string;
    eligible: Array<Record<string, unknown>>;
    created_claims?: MaintenanceWarrantyClaimRow[];
  }>(`/api/v1/maintenance/warranty/detect-from-wo`, { method: "POST", body });
}

export type MaintenanceReeferHoursLogRow = {
  id: string;
  equipment_id: string;
  hours_reading: number;
  source: "samsara" | "manual" | string;
  source_label: string;
  recorded_at: string;
  notes: string;
  samsara_event_id?: string | null;
};

export type MaintenanceReeferSpecsRow = {
  id: string;
  equipment_id: string;
  equipment_number?: string | null;
  reefer_brand: string;
  service_interval_hours: number;
  last_service_hours: number | null;
  last_service_date: string | null;
  current_hours: number | null;
  hours_until_service: number | null;
  pm_status: "due" | "near_due" | "current";
  notes?: string;
};

export function fetchMaintenanceReeferHoursSnapshot(operatingCompanyId: string, equipmentId: string, limit = 20) {
  const q = new URLSearchParams({
    operating_company_id: operatingCompanyId,
    equipment_id: equipmentId,
    limit: String(limit),
  });
  return apiRequest<{ specs: MaintenanceReeferSpecsRow; history: MaintenanceReeferHoursLogRow[] }>(
    `/api/v1/maintenance/reefer-hours/snapshot?${q.toString()}`
  );
}

export function listMaintenanceReeferHoursLog(
  operatingCompanyId: string,
  params: { equipment_id?: string; limit?: number } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.equipment_id) q.set("equipment_id", params.equipment_id);
  if (params.limit != null) q.set("limit", String(params.limit));
  return apiRequest<{ rows: MaintenanceReeferHoursLogRow[] }>(`/api/v1/maintenance/reefer-hours/log?${q.toString()}`);
}

export function createMaintenanceReeferHoursLogEntry(body: {
  operating_company_id: string;
  equipment_id: string;
  hours_reading: number;
  recorded_at?: string;
  notes?: string;
}) {
  return apiRequest<MaintenanceReeferHoursLogRow>(`/api/v1/maintenance/reefer-hours/log`, { method: "POST", body });
}

export function updateMaintenanceReeferSpecs(body: {
  operating_company_id: string;
  equipment_id: string;
  reefer_brand?: string;
  service_interval_hours?: number;
  last_service_hours?: number | null;
  last_service_date?: string | null;
  notes?: string;
}) {
  return apiRequest<MaintenanceReeferSpecsRow>(`/api/v1/maintenance/reefer-hours/specs`, { method: "PUT", body });
}

export function ingestMaintenanceReeferHoursFromSamsara(operatingCompanyId: string) {
  return apiRequest<{ ingested: number; skipped: number }>(`/api/v1/maintenance/reefer-hours/ingest-samsara`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export function listMaintenanceReeferHoursPmDue(operatingCompanyId: string) {
  return apiRequest<{ rows: Array<Record<string, unknown>> }>(
    `/api/v1/maintenance/reefer-hours/pm-due?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function listMaintenanceVendors(
  operatingCompanyId: string,
  params: { search?: string; include_archived?: boolean } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.search) q.set("search", params.search);
  if (params.include_archived != null) q.set("include_archived", String(params.include_archived));
  return apiRequest<{ rows: MaintenanceVendorRow[]; csv_import_enabled: boolean }>(
    `/api/v1/maintenance/vendors?${q.toString()}`
  );
}

export type MaintenanceVendorRow = {
  id: string;
  code: string;
  display_name: string;
  name?: string;
  description: string | null;
  type: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
  active?: boolean;
  archived_at?: string | null;
  archive_reason?: string | null;
};

export function getMaintenanceVendorDetail(vendorId: string, operatingCompanyId: string) {
  return apiRequest<{
    vendor: MaintenanceVendorRow;
    wo_history: Array<Record<string, unknown>>;
    invoice_history: Array<Record<string, unknown>>;
  }>(`/api/v1/maintenance/vendors/${encodeURIComponent(vendorId)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}

export function createMaintenanceVendor(body: Record<string, unknown>) {
  return apiRequest<MaintenanceVendorRow>(`/api/v1/maintenance/vendors`, { method: "POST", body });
}

export function updateMaintenanceVendor(id: string, body: Record<string, unknown>) {
  return apiRequest<MaintenanceVendorRow>(`/api/v1/maintenance/vendors/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export function archiveMaintenanceVendor(id: string, operatingCompanyId: string, archiveReason: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/maintenance/vendors/${encodeURIComponent(id)}/archive`, {
    method: "PATCH",
    body: { operating_company_id: operatingCompanyId, archive_reason: archiveReason },
  });
}

export function importMaintenanceVendors(operatingCompanyId: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  return apiRequest<{ inserted_rows: number; invalid_rows: number; errors: Array<{ row: number; message: string }> }>(
    `/api/v1/maintenance/vendors/import?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body: form }
  );
}

export function getMaintenanceVendorsTemplateUrl(operatingCompanyId: string) {
  return resolveApiUrl(
    `/api/v1/maintenance/vendors/import-template?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function getMaintenanceReportRows(report: string, operatingCompanyId: string) {
  return apiRequest<{ report: string; rows: Array<Record<string, unknown>> }>(
    `/api/v1/maintenance/reports/${encodeURIComponent(report)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function getMaintenanceReportXlsxUrl(report: string, operatingCompanyId: string) {
  return resolveApiUrl(
    `/api/v1/maintenance/reports/${encodeURIComponent(report)}/export.xlsx?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function listMaintenanceCompliance425cLog(operatingCompanyId: string) {
  return apiRequest<{ rows: Array<Record<string, unknown>> }>(
    `/api/v1/maintenance/compliance/425c-log?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function createPartsInventoryPurchase(
  operatingCompanyId: string,
  body: {
    part_description: string;
    vendor_id?: string;
    vendor_invoice_number?: string;
    purchase_amount?: number;
    qty_received: number;
    location?: string;
  }
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<Record<string, unknown>>(`/api/v1/maintenance/parts-inventory/purchases?${q.toString()}`, {
    method: "POST",
    body,
  });
}

export function getIntransitTriageQueue(operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ issues: Array<Record<string, unknown>> }>(`/api/v1/maintenance/dashboard/intransit-triage-queue?${q.toString()}`);
}

export type MaintenanceVehicleRow = {
  id: string;
  unit_display_id: string;
  vehicle_type: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string;
  plate: string | null;
  mileage: number | null;
  status: string;
  notes: string | null;
  source: "Samsara" | "Manual" | "Voided" | string;
  voided_at: string | null;
  voided_reason: string | null;
};

export type MaintenanceDriverRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  cdl_number: string | null;
  cdl_state: string | null;
  status: string;
  notes: string | null;
  source: "Samsara" | "Manual" | "Voided" | string;
  voided_at: string | null;
  voided_reason: string | null;
};

export type MaintenancePartRow = {
  id: string;
  part_number: string;
  name: string;
  vendor_default: string | null;
  unit_cost: number | null;
  qty_on_hand: number;
  reorder_threshold: number;
  location: string | null;
  source: string;
  voided_at: string | null;
  voided_reason: string | null;
};

export type MaintenancePartsKpis = {
  total_parts: number;
  low_stock_count: number;
  total_inventory_value: number;
};

export function listMaintenanceVehicles(
  operatingCompanyId: string,
  params: { search?: string; include_voided?: boolean } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.search) q.set("search", params.search);
  if (params.include_voided != null) q.set("include_voided", String(params.include_voided));
  return apiRequest<{ rows: MaintenanceVehicleRow[]; csv_import_enabled: boolean }>(
    `/api/v1/maintenance/vehicles?${q.toString()}`
  );
}

export function createMaintenanceVehicle(
  operatingCompanyId: string,
  body: {
    unit_display_id: string;
    vehicle_type?: string;
    make?: string;
    model?: string;
    year?: number;
    vin: string;
    plate?: string;
    mileage?: number;
    status: "InService" | "OutOfService" | "InMaintenance" | "Sold" | "Totaled";
    notes?: string;
  }
) {
  return apiRequest<MaintenanceVehicleRow>(
    `/api/v1/maintenance/vehicles?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body }
  );
}

export function updateMaintenanceVehicle(
  id: string,
  operatingCompanyId: string,
  body: Partial<Omit<MaintenanceVehicleRow, "id" | "source" | "voided_at" | "voided_reason">>
) {
  return apiRequest<MaintenanceVehicleRow>(
    `/api/v1/maintenance/vehicles/${encodeURIComponent(id)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "PATCH", body }
  );
}

export function voidMaintenanceVehicle(id: string, operatingCompanyId: string, voidReason: string) {
  return apiRequest<{ ok: boolean }>(
    `/api/v1/maintenance/vehicles/${encodeURIComponent(id)}/void?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "PATCH", body: { void_reason: voidReason } }
  );
}

export function importMaintenanceVehicles(operatingCompanyId: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  return apiRequest<{ inserted_rows: number; invalid_rows: number; errors: Array<{ row: number; message: string }> }>(
    `/api/v1/maintenance/vehicles/import?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body: form }
  );
}

export function listMaintenanceDrivers(
  operatingCompanyId: string,
  params: { search?: string; include_voided?: boolean } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.search) q.set("search", params.search);
  if (params.include_voided != null) q.set("include_voided", String(params.include_voided));
  return apiRequest<{ rows: MaintenanceDriverRow[]; csv_import_enabled: boolean }>(
    `/api/v1/maintenance/drivers?${q.toString()}`
  );
}

export function createMaintenanceDriver(
  operatingCompanyId: string,
  body: {
    first_name: string;
    last_name: string;
    phone: string;
    email?: string;
    cdl_number?: string;
    cdl_state?: string;
    status: "Active" | "Probation" | "Inactive" | "Terminated" | "OnLeave";
    notes?: string;
  }
) {
  return apiRequest<MaintenanceDriverRow>(
    `/api/v1/maintenance/drivers?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body }
  );
}

export function updateMaintenanceDriver(
  id: string,
  operatingCompanyId: string,
  body: Partial<Omit<MaintenanceDriverRow, "id" | "source" | "voided_at" | "voided_reason">>
) {
  return apiRequest<MaintenanceDriverRow>(
    `/api/v1/maintenance/drivers/${encodeURIComponent(id)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "PATCH", body }
  );
}

export function voidMaintenanceDriver(id: string, operatingCompanyId: string, voidReason: string) {
  return apiRequest<{ ok: boolean }>(
    `/api/v1/maintenance/drivers/${encodeURIComponent(id)}/void?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "PATCH", body: { void_reason: voidReason } }
  );
}

export function importMaintenanceDrivers(operatingCompanyId: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  return apiRequest<{ inserted_rows: number; invalid_rows: number; errors: Array<{ row: number; message: string }> }>(
    `/api/v1/maintenance/drivers/import?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body: form }
  );
}

export function listMaintenanceParts(
  operatingCompanyId: string,
  params: { search?: string; include_voided?: boolean } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.search) q.set("search", params.search);
  if (params.include_voided != null) q.set("include_voided", String(params.include_voided));
  return apiRequest<{ rows: MaintenancePartRow[] }>(`/api/v1/maintenance/parts?${q.toString()}`);
}

export function getMaintenancePartsKpis(operatingCompanyId: string) {
  return apiRequest<MaintenancePartsKpis>(
    `/api/v1/maintenance/parts/kpis?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function createMaintenancePart(
  operatingCompanyId: string,
  body: {
    part_number: string;
    name: string;
    vendor_default?: string;
    unit_cost?: number;
    qty_on_hand: number;
    reorder_threshold: number;
    location?: string;
  }
) {
  return apiRequest<MaintenancePartRow>(
    `/api/v1/maintenance/parts?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body }
  );
}

export function updateMaintenancePart(
  id: string,
  operatingCompanyId: string,
  body: Partial<Omit<MaintenancePartRow, "id" | "source" | "voided_at" | "voided_reason">>
) {
  return apiRequest<MaintenancePartRow>(
    `/api/v1/maintenance/parts/${encodeURIComponent(id)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "PATCH", body }
  );
}

export function voidMaintenancePart(id: string, operatingCompanyId: string, voidReason: string) {
  return apiRequest<{ ok: boolean }>(
    `/api/v1/maintenance/parts/${encodeURIComponent(id)}/void?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "PATCH", body: { void_reason: voidReason } }
  );
}

export function importMaintenanceParts(operatingCompanyId: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  return apiRequest<{ inserted_rows: number; invalid_rows: number; rolled_back: boolean; errors: Array<{ row: number; message: string }> }>(
    `/api/v1/maintenance/parts/import?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body: form }
  );
}

export function getMaintenancePartsTemplateUrl(operatingCompanyId: string) {
  return resolveApiUrl(
    `/api/v1/maintenance/parts/import-template?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export type DvirDefectTriageStatus = "pending" | "assigned" | "escalated" | "converted" | "closed";

export type DvirDefectInboxRow = {
  id: string;
  dvir_submission_id: string;
  unit_id: string;
  item_key: string;
  severity: string;
  notes: string;
  photo_keys?: string[];
  follow_up_wo_id?: string | null;
  created_at: string;
  dvir_type?: string;
  submitted_at?: string;
  driver_id?: string | null;
  load_id?: string | null;
  driver_name?: string | null;
  unit_number?: string | null;
  triage_status: DvirDefectTriageStatus;
};

export function listMaintenanceDvirDefects(
  operatingCompanyId: string,
  params: { status?: DvirDefectTriageStatus | "all" } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.status) q.set("status", params.status);
  return apiRequest<{ defects: DvirDefectInboxRow[] }>(`/api/v1/maintenance/dvir-defects?${q.toString()}`);
}

export function getMaintenanceDvirDefect(id: string, operatingCompanyId: string) {
  return apiRequest<{
    defect: DvirDefectInboxRow & { odometer?: number; location?: string; load_id?: string | null };
    triage_history: Array<{ event_class: string; created_at: string; payload: Record<string, unknown> }>;
  }>(`/api/v1/maintenance/dvir-defects/${encodeURIComponent(id)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}

export function triageMaintenanceDvirDefect(
  id: string,
  body: {
    operating_company_id: string;
    action: "assign" | "escalate" | "close_no_action" | "convert_to_wo";
    assignee_note?: string;
    mechanic_notes?: string;
    wo_type?: WorkOrderType;
  }
) {
  return apiRequest<{
    triage_status: DvirDefectTriageStatus;
    work_order_id?: string;
    display_id?: string | null;
    alreadyConverted?: boolean;
  }>(`/api/v1/maintenance/dvir-defects/${encodeURIComponent(id)}/triage`, { method: "POST", body });
}

export type PmAutoEngineRunRow = {
  id: string;
  started_at: string | null;
  finished_at: string | null;
  status: string;
  schedules_evaluated: number;
  work_orders_created: number;
  alerts_created: number;
  trigger_source?: string;
  error_message?: string | null;
};

export type PmAutoEngineLogRow = {
  id: string;
  run_id?: string | null;
  pm_schedule_id: string;
  unit_id: string;
  action: string;
  work_order_id?: string | null;
  schedule_label?: string | null;
  unit_number?: string | null;
  created_at?: string;
};

export function getMaintenancePmAutoEngineDashboard(operatingCompanyId: string, limit = 25) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId, limit: String(limit) });
  return apiRequest<{
    runs: PmAutoEngineRunRow[];
    recent_log: PmAutoEngineLogRow[];
    settings: { is_paused: boolean; paused_at?: string | null };
    lookahead_miles: number;
  }>(`/api/v1/maintenance/pm-auto-engine/runs?${q.toString()}`);
}

export function updateMaintenancePmAutoEngineSettings(body: { operating_company_id: string; is_paused: boolean }) {
  return apiRequest<{ is_paused: boolean }>("/api/v1/maintenance/pm-auto-engine/settings", { method: "POST", body });
}

export function runMaintenancePmAutoEngineNow(operatingCompanyId: string) {
  return apiRequest<{ schedules_evaluated: number; work_orders_created: number; alerts_created: number }>(
    "/api/v1/maintenance/pm-auto-engine/run-now",
    { method: "POST", body: { operating_company_id: operatingCompanyId } }
  );
}

export type DvirSeverityLevel = "major" | "minor" | "observation";

export type PreFlightDvirQueueRow = {
  id: string;
  unit_id: string;
  unit_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  item_key: string;
  item_label: string | null;
  severity: DvirSeverityLevel;
  cfr_code?: string;
  major_defect_code?: string | null;
  notes: string | null;
  submitted_at: string;
  work_order_id: string | null;
  work_order_display_id: string | null;
  auto_wo_id?: string | null;
  status: "open" | "routed" | "closed";
  routed?: boolean;
};

export function listPreFlightDvirQueue(
  operatingCompanyId: string,
  params: { severity?: DvirSeverityLevel; status?: "open" | "routed" | "closed" } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.severity) q.set("severity", params.severity);
  if (params.status) q.set("status", params.status);
  return apiRequest<{ defects: PreFlightDvirQueueRow[] }>(
    `/api/v1/maintenance/pre-flight-dvir/queue?${q.toString()}`
  );
}

export function routePreFlightDvirDefect(defectId: string, operatingCompanyId: string) {
  return apiRequest<{
    action: "work_order_created" | "queued_next_pm" | "logged_observation" | "already_routed";
    work_order_id?: string;
    display_id?: string | null;
  }>(`/api/v1/maintenance/pre-flight-dvir/${encodeURIComponent(defectId)}/route`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export function setPreFlightDvirSeverity(
  defectId: string,
  body: { operating_company_id: string; severity: DvirSeverityLevel }
) {
  return apiRequest<{ id: string; severity: DvirSeverityLevel }>(
    `/api/v1/maintenance/pre-flight-dvir/${encodeURIComponent(defectId)}/severity`,
    { method: "PATCH", body }
  );
}
