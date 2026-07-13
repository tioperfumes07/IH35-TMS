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

// B6: dry-run of the B5 cascade for a pending request (what "Approve & post" will do).
export type CashAdvanceCascadePreview = {
  branch: "load_bill" | "open_bill" | "loan";
  active_load_id: string | null;
  linked_driver_bill_id: string | null;
  amount_cents: number;
  resolved_account: { id: string; account_number: string | null; account_name: string | null; posting_side: string } | null;
};

// B6: the B4 accountability timeline row (5 steps + actor/role + elapsed seconds).
export type CashAdvanceRequestTimeline = Record<string, unknown> | null;

// Phase 3 Settlement Pay-Run — office-side (Owner/Admin/Manager/Accountant/Dispatcher) create.
// Maker<>checker (I4, migration 202607380000): the created request stamps submitted_by_user_id =
// the office user who created it. Owner/Administrator MAY self-approve immediately (auto_approve:
// true — role IS the authority, no checker needed, reviewed_by stays NULL). Any other role's
// request is left pending and requires a DIFFERENT Owner/Administrator/Accountant approver — the
// backend CHECK constraint (cash_advance_requests_maker_ne_checker) rejects submitted_by ===
// reviewed_by when both are set; the frontend additionally disables the Approve action for the
// submitter (see CashAdvanceRequestsPage) so the maker never even sees an enabled Approve button.
export type CashAdvanceOfficeCreatePayload = {
  driver_id: string;
  requested_amount_cents: number;
  reason: string;
  proposed_recovery_per_settlement_cents?: number;
  load_id?: string | null;
  /** Owner/Administrator only — self-approve at create time (no separate checker needed). */
  auto_approve?: boolean;
};

export const cashAdvanceRequestsOfficeApi = {
  listPending(operatingCompanyId: string) {
    return apiRequest<{ requests: CashAdvanceRequestRow[] }>(
      withCompanyQuery("/api/v1/driver-finance/cash-advance-requests/pending", operatingCompanyId)
    );
  },

  create(operatingCompanyId: string, body: CashAdvanceOfficeCreatePayload) {
    return apiRequest<{ request: CashAdvanceRequestRow }>(
      withCompanyQuery("/api/v1/driver-finance/cash-advance-requests", operatingCompanyId),
      { method: "POST", body: { ...body, submitted_via: "office" } }
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

  // B6/B5: "Approve & post". credit_account_id (pay-from) feeds B5's optional CREDIT account;
  // posting_date back-dating is role-gated server-side (Owner/Administrator).
  approve(
    operatingCompanyId: string,
    id: string,
    body: { approval_notes?: string; credit_account_id?: string; posting_date?: string }
  ) {
    return apiRequest<{
      request: CashAdvanceRequestRow;
      advance?: Record<string, unknown>;
      cascade_branch?: string;
      linked_driver_bill_id?: string | null;
      disbursement?: Record<string, unknown>;
    }>(
      withCompanyQuery(`/api/v1/driver-finance/cash-advance-requests/${encodeURIComponent(id)}/approve`, operatingCompanyId),
      { method: "POST", body }
    );
  },

  cascadePreview(operatingCompanyId: string, id: string) {
    return apiRequest<CashAdvanceCascadePreview>(
      withCompanyQuery(`/api/v1/driver-finance/cash-advance-requests/${encodeURIComponent(id)}/cascade-preview`, operatingCompanyId)
    );
  },

  timeline(operatingCompanyId: string, id: string) {
    return apiRequest<{ timeline: CashAdvanceRequestTimeline }>(
      withCompanyQuery(`/api/v1/driver-finance/cash-advance-requests/${encodeURIComponent(id)}/timeline`, operatingCompanyId)
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
