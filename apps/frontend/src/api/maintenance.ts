import { apiRequest } from "./client";

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
  description?: string | null;
  source_type?: "IS" | "ES" | "AC" | "ET" | "RT" | "IT" | "RS" | null;
  external_vendor_id?: string | null;
  external_vendor_wo_number?: string | null;
  external_vendor_invoice_number?: string | null;
  severity?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  duration_seconds?: number | null;
  updated_at?: string | null;
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
    vendor_id?: string;
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
