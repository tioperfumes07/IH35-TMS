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
  params: { source_type?: string; external_vendor_id?: string; status?: string } = {}
) {
  const qs = new URLSearchParams({ operating_company_id: companyId });
  if (params.source_type) qs.set("source_type", params.source_type);
  if (params.external_vendor_id) qs.set("external_vendor_id", params.external_vendor_id);
  if (params.status) qs.set("status", params.status);
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

export function listMaintenanceInspections(operatingCompanyId: string) {
  return apiRequest<{ rows: Array<Record<string, unknown>> }>(
    `/api/v1/maintenance/inspections?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function createMaintenanceInspection(body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/maintenance/inspections`, { method: "POST", body });
}

export function listMaintenanceVendors(operatingCompanyId: string) {
  return apiRequest<{ rows: Array<Record<string, unknown>> }>(
    `/api/v1/maintenance/vendors?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function createMaintenanceVendor(body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(`/api/v1/maintenance/vendors`, { method: "POST", body });
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
