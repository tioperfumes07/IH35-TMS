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
  pending_journal_approvals: number;
  qbo: {
    outbox_depth: number;
    last_sync_at: string | null;
    failed_outbox_count: number;
  };
  early_pay_discounts_expiring_this_week: number;
};

export async function fetchAccountingRoleHome(companyId: string): Promise<AccountingHomeData> {
  return apiRequest<AccountingHomeData>(withCompany("/api/v1/accounting/role-home", companyId));
}
