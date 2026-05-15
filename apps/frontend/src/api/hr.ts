import { apiRequest } from "./client";

export type TimeOffRequestRow = {
  id: string;
  driver_id: string;
  driver_name: string;
  start_date: string;
  end_date: string;
  type: string;
  status: string;
  notes: string | null;
  created_at: string;
  decided_at: string | null;
  decision_notes: string | null;
};

export function listHrTimeOffRequests(operatingCompanyId: string, status?: "pending" | "approved" | "denied") {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (status) q.set("status", status);
  return apiRequest<{ requests: TimeOffRequestRow[] }>(`/api/v1/hr/time-off-requests?${q}`);
}

export function decideTimeOffRequest(
  id: string,
  body: { operating_company_id: string; status: "approved" | "denied"; decision_notes?: string }
) {
  return apiRequest<{ ok: true }>(`/api/v1/hr/time-off-requests/${encodeURIComponent(id)}/decide`, { method: "POST", body });
}
