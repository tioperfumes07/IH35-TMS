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
  severity?: string | null;
  opened_at?: string | null;
  updated_at?: string | null;
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

export type CreateWorkOrderPayload = {
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

export function getWorkOrder(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/maintenance/work-orders/${id}?${query(companyId)}`);
}

export function createWorkOrder(payload: CreateWorkOrderPayload) {
  return apiRequest<WorkOrder>("/api/v1/maintenance/work-orders", { method: "POST", body: payload });
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
