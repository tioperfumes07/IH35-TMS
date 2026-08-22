import { apiRequest } from "./client";

export type AccountingScheduleRowKind = "prepaid_amortization_row" | "depreciation_schedule_row" | "loan_amortization_row";
export type AccountingScheduleRowDetail = {
  id: string; kind: AccountingScheduleRowKind; sequence: number; effective_date: string;
  amount_cents: string; balance_cents: string; posted: boolean; posted_journal_entry_id: string | null;
  parent_id: string; parent_kind: "prepaid_asset" | "fixed_asset" | "finance_loan"; parent_label: string;
};
export function getAccountingScheduleRow(kind: AccountingScheduleRowKind, id: string, operatingCompanyId: string) {
  return apiRequest<AccountingScheduleRowDetail>(`/api/v1/accounting/schedule-rows/${kind}/${encodeURIComponent(id)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}
