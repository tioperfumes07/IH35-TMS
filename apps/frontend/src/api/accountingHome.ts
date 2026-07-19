import { apiRequest } from "./client";

function withCompany(path: string, companyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(companyId)}`;
}

export type AccountingAgingBuckets = {
  current_cents: number;
  d1_30_cents: number;
  d31_60_cents: number;
  d61_90_cents: number;
  d90_plus_cents: number;
  total_outstanding_cents: number;
};

export type AccountingHomeData = {
  as_of_date: string;
  ar_aging: AccountingAgingBuckets;
  ap_aging: AccountingAgingBuckets;
  period_close: {
    period_label: string | null;
    period_end: string | null;
    status: string | null;
    days_to_close: number | null;
  };
  /** Count of linked pending journal-approval items only (0280-15). 0 when control unavailable. */
  pending_journal_approvals: number;
  qbo: {
    outbox_depth: number;
    last_sync_at: string | null;
    failed_outbox_count: number;
  };
  early_pay_discounts_expiring_this_week: number;
};

export type PendingApprovalGovernedAccount = {
  account_id: string;
  account_number: string | null;
  account_name: string | null;
  coa_role: string | null;
  debit_cents: number;
  credit_cents: number;
};

export type PendingApprovalActor = {
  user_id: string | null;
  role: string | null;
};

export type PendingApprovalException = {
  code: "approval_control_unavailable" | "assignment_unresolved" | "required_structure_unavailable";
  message: string;
};

export type PendingApprovalItem = {
  kind: "journal_approval" | "approval_control_unavailable" | "excluded_voided_or_reversed";
  journal_entry_id: string | null;
  journal_display_id: string | null;
  status: string | null;
  risk: string | null;
  reason: string | null;
  amounts_balanced: boolean;
  debit_total_cents: number;
  credit_total_cents: number;
  governed_accounts: PendingApprovalGovernedAccount[];
  creator: PendingApprovalActor | null;
  required_approver: PendingApprovalActor | null;
  maker_checker_violation: boolean;
  assignment_exception: PendingApprovalException | null;
  forward_drill: {
    journal_entry_id: string | null;
    href: string | null;
  };
  reverse_drill: {
    journal_entry_id: string | null;
    href: string | null;
  };
  entry_date: string | null;
  created_at: string | null;
  voided: boolean;
  reversed: boolean;
  operating_company_id: string;
};

export type PendingApprovalsGlResponse = {
  items: PendingApprovalItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  pending_journal_approvals: number;
  control_available: boolean;
  exceptions: PendingApprovalException[];
};

export async function fetchAccountingRoleHome(companyId: string): Promise<AccountingHomeData> {
  return apiRequest<AccountingHomeData>(withCompany("/api/v1/accounting/role-home", companyId));
}

export async function fetchPendingApprovalsGl(
  companyId: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<PendingApprovalsGlResponse> {
  const params = new URLSearchParams({
    operating_company_id: companyId,
  });
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.offset != null) params.set("offset", String(opts.offset));
  return apiRequest<PendingApprovalsGlResponse>(
    `/api/v1/accounting/role-home/pending-approvals?${params.toString()}`
  );
}
