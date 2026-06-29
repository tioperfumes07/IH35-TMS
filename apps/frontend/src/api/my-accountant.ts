import { apiRequest, resolveApiUrl } from "./client";

export type AccountingPeriod = {
  id: string;
  period_label: string | null;
  period_start: string;
  period_end: string;
  fiscal_year: number;
  status: string;
  closed_at: string | null;
};

export type AccountingPeriodsResponse = { periods: AccountingPeriod[] };

/** Read-only period status (open/closed) for the books-at-a-glance panel. */
export function getAccountingPeriods(operating_company_id: string) {
  const q = new URLSearchParams({ operating_company_id });
  return apiRequest<AccountingPeriodsResponse>(`/api/v1/accounting/periods?${q}`);
}

/** Internal report routes (read-only views) the accountant can open, scoped per-entity. */
export type ReportLink = { label: string; to: string; description: string };

export const ACCOUNTANT_REPORT_LINKS: readonly ReportLink[] = [
  { label: "Profit & Loss", to: "/reports/profit-loss", description: "Income statement for the entity" },
  { label: "Balance Sheet", to: "/reports/balance-sheet", description: "Assets, liabilities, and equity" },
  { label: "Cash Flow", to: "/reports/cash-flow-statement", description: "ASC 230 statement of cash flows" },
  { label: "Trial Balance", to: "/reports/trial-balance", description: "All accounts with debit/credit balances" },
  { label: "A/R Aging", to: "/reports/ar-aging", description: "Receivables by aging bucket" },
  { label: "A/P Aging", to: "/reports/ap-aging", description: "Payables by aging bucket" },
  { label: "Period-close history", to: "/reports/audit/period-close-history", description: "Audit log of period closes" },
] as const;

/** CPA export bundle — read-only file downloads (PDF / XLSX). Cookie-authed anchor hrefs. */
export type ExportStatement = { key: string; label: string };

export const ACCOUNTANT_EXPORT_STATEMENTS: readonly ExportStatement[] = [
  { key: "trial-balance", label: "Trial Balance" },
  { key: "profit-loss", label: "Profit & Loss" },
  { key: "balance-sheet", label: "Balance Sheet" },
  { key: "cash-flow", label: "Cash Flow" },
  { key: "ar-aging", label: "A/R Aging" },
  { key: "ap-aging", label: "A/P Aging" },
] as const;

/** Build the read-only export download URL for a statement + format, scoped to the entity. */
export function buildStatementExportUrl(
  statementKey: string,
  format: "pdf" | "xlsx",
  operating_company_id: string
): string {
  const q = new URLSearchParams({ operating_company_id });
  return resolveApiUrl(`/api/v1/accounting/${statementKey}/export/${format}?${q}`);
}
