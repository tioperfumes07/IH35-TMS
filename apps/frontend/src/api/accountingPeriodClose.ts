import { apiRequest } from "./client";

export type PeriodCloseEntry = {
  journal_entry_id: string;
  entry_date: string;
  memo: string | null;
  status: string;
  debit_cents: string;
  credit_cents: string;
  linked_at: string;
};

export type PeriodCloseDetail = { fiscal_year_id: string; fiscal_year: number; entries: PeriodCloseEntry[] };

export function getAccountingPeriodClose(fiscalYearId: string, operatingCompanyId: string) {
  return apiRequest<PeriodCloseDetail>(
    `/api/v1/accounting/period-closes/${encodeURIComponent(fiscalYearId)}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
  );
}
