import { apiRequest } from "./client";

export type CashAdvanceRequestRow = Record<string, unknown>;

function withCompanyQuery(path: string, operatingCompanyId: string, params: Record<string, string> = {}) {
  const search = new URLSearchParams({ operating_company_id: operatingCompanyId, ...params });
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${search.toString()}`;
}

export type CashAdvanceRequestDetail = {
  request: CashAdvanceRequestRow;
  audit_log: Record<string, unknown>[];
};

export const cashAdvanceRequestsOfficeApi = {
  listPending(operatingCompanyId: string) {
    return apiRequest<{ requests: CashAdvanceRequestRow[] }>(
      withCompanyQuery("/api/v1/driver-finance/cash-advance-requests/pending", operatingCompanyId)
    );
  },

  list(operatingCompanyId: string, status?: string) {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    return apiRequest<{ requests: CashAdvanceRequestRow[] }>(
      withCompanyQuery("/api/v1/driver-finance/cash-advance-requests", operatingCompanyId, params)
    );
  },

  get(operatingCompanyId: string, id: string) {
    return apiRequest<CashAdvanceRequestDetail>(
      withCompanyQuery(`/api/v1/driver-finance/cash-advance-requests/${encodeURIComponent(id)}`, operatingCompanyId)
    );
  },

  approve(operatingCompanyId: string, id: string, body: { approval_notes?: string }) {
    return apiRequest<{ request: CashAdvanceRequestRow; advance?: Record<string, unknown> }>(
      withCompanyQuery(`/api/v1/driver-finance/cash-advance-requests/${encodeURIComponent(id)}/approve`, operatingCompanyId),
      { method: "POST", body }
    );
  },

  deny(operatingCompanyId: string, id: string, body: { denial_reason: string }) {
    return apiRequest<{ request: CashAdvanceRequestRow }>(
      withCompanyQuery(`/api/v1/driver-finance/cash-advance-requests/${encodeURIComponent(id)}/deny`, operatingCompanyId),
      { method: "POST", body }
    );
  },

  escalate(operatingCompanyId: string, id: string) {
    return apiRequest<{ owner_approval_url: string; request: CashAdvanceRequestRow }>(
      withCompanyQuery(`/api/v1/driver-finance/cash-advance-requests/${encodeURIComponent(id)}/escalate`, operatingCompanyId),
      { method: "POST", body: {} }
    );
  },

  listPendingOwnerApproval(operatingCompanyId: string) {
    return apiRequest<{ requests: CashAdvanceRequestRow[] }>(
      withCompanyQuery("/api/v1/driver-finance/cash-advance-requests/pending-owner-approval", operatingCompanyId)
    );
  },
};
