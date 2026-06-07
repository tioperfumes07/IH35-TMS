import { apiRequest } from "./client";

export type DriverHubRequestRow = Record<string, unknown>;

function withCompanyQuery(path: string, operatingCompanyId: string, params: Record<string, string> = {}) {
  const search = new URLSearchParams({ operating_company_id: operatingCompanyId, ...params });
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${search.toString()}`;
}

export const driverHubRequestsApi = {
  listPending(operatingCompanyId: string) {
    return apiRequest<{ requests: DriverHubRequestRow[] }>(
      withCompanyQuery("/api/v1/cash-advances/hub/requests/pending", operatingCompanyId)
    );
  },

  approve(operatingCompanyId: string, id: string, body: { approval_notes?: string }) {
    return apiRequest<{ request: DriverHubRequestRow; deduction: Record<string, unknown> }>(
      withCompanyQuery(`/api/v1/cash-advances/hub/requests/${encodeURIComponent(id)}/approve`, operatingCompanyId),
      { method: "POST", body }
    );
  },

  deny(operatingCompanyId: string, id: string, body: { denial_reason: string }) {
    return apiRequest<{ request: DriverHubRequestRow }>(
      withCompanyQuery(`/api/v1/cash-advances/hub/requests/${encodeURIComponent(id)}/deny`, operatingCompanyId),
      { method: "POST", body }
    );
  },
};
