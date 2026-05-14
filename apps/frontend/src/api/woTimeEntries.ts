import { apiRequest } from "./client";

export type WoTimeEntryRow = Record<string, unknown>;

export async function listWoTimeEntries(workOrderId: string, operatingCompanyId: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ time_entries: WoTimeEntryRow[] }>(
    `/api/v1/work-orders/${encodeURIComponent(workOrderId)}/time-entries?${qs.toString()}`
  );
}

export async function startWoTimeEntry(
  workOrderId: string,
  body: {
    operating_company_id: string;
    actor_kind: "vendor" | "internal_mechanic" | "driver" | "admin";
    actor_vendor_id?: string | null;
    actor_user_id?: string | null;
    actor_employee_id?: string | null;
    wo_task_id?: string | null;
    labor_rate_cents_per_hour?: number | null;
    notes?: string | null;
  }
) {
  return apiRequest<{ time_entry: WoTimeEntryRow }>(`/api/v1/work-orders/${encodeURIComponent(workOrderId)}/time-entries/start`, {
    method: "POST",
    body,
  });
}

export async function stopWoTimeEntry(entryId: string, operatingCompanyId: string) {
  return apiRequest<{ time_entry: WoTimeEntryRow }>(`/api/v1/time-entries/${encodeURIComponent(entryId)}/stop`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export async function createWoTimeEntryManual(body: {
  operating_company_id: string;
  work_order_id: string;
  actor_kind: "vendor" | "internal_mechanic" | "driver" | "admin";
  actor_vendor_id?: string | null;
  actor_user_id?: string | null;
  actor_employee_id?: string | null;
  wo_task_id?: string | null;
  labor_rate_cents_per_hour?: number | null;
  notes?: string | null;
  started_at: string;
  ended_at: string;
}) {
  return apiRequest<{ time_entry: WoTimeEntryRow }>(`/api/v1/time-entries`, { method: "POST", body });
}

export async function patchWoTimeEntry(
  entryId: string,
  body: { operating_company_id: string; labor_rate_cents_per_hour?: number | null; notes?: string | null }
) {
  return apiRequest<{ time_entry: WoTimeEntryRow }>(`/api/v1/time-entries/${encodeURIComponent(entryId)}`, { method: "PATCH", body });
}

export async function deleteWoTimeEntry(entryId: string, operatingCompanyId: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ ok: boolean }>(`/api/v1/time-entries/${encodeURIComponent(entryId)}?${qs.toString()}`, { method: "DELETE" });
}
