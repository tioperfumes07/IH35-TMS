import { apiRequest } from "./client";

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export type FactoringSummary = {
  operating_company_id: string;
  active_factor_id: string | null;
  active_factor_name: string;
  recourse_days: number;
  reserve_balance: number;
  chargeback_balance: number;
  last_advance_at: string | null;
  active_factor_count: number;
  single_factor_invariant_ok: boolean;
  mtd_advances_count: number;
  mtd_advanced_total: number;
};

export type FactoringRecourseInvoice = {
  factoring_advance_id: string;
  operating_company_id: string;
  active_factor_name: string | null;
  invoice_reference: string;
  customer_name: string;
  invoice_amount: number;
  advance_amount: number;
  reserve_amount: number;
  factored_at: string;
  recourse_expiry_date: string;
  days_until_recourse_expiry: number;
};

export type FactoringChargebackFeeRow = {
  factoring_advance_id: string;
  operating_company_id: string;
  created_at: string;
  statement_month: string | null;
  chargeback_amount: number;
  factor_fee_amount: number;
  statement_reference: string | null;
};

export type FactoringMonthlyFeeSummary = {
  statement_month: string | null;
  chargeback_total: number;
  factor_fee_total: number;
};

export type FactoringSettingsRow = {
  operating_company_id: string;
  active_factor_id: string | null;
  active_factor_name: string;
  recourse_days: number;
  active_factor_count: number;
  single_factor_invariant_ok: boolean;
  statement_month?: string | null;
  month_chargebacks_total?: number;
  month_factor_fees_total?: number;
};

export function getFactoringSummary(companyId: string) {
  return apiRequest<FactoringSummary>(`/api/v1/factoring/summary?${q(companyId)}`);
}

export function getFactoringRecoursePipeline(companyId: string, limit = 200) {
  return apiRequest<{ invoices: FactoringRecourseInvoice[] }>(`/api/v1/factoring/recourse-pipeline?${q(companyId)}&limit=${limit}`);
}

export function getFactoringChargebacksFees(companyId: string) {
  return apiRequest<{ history: FactoringChargebackFeeRow[]; monthly_summary: FactoringMonthlyFeeSummary[] }>(
    `/api/v1/factoring/chargebacks-fees?${q(companyId)}`
  );
}

export function getFactoringStatementsSettings(companyId: string) {
  return apiRequest<{ current: FactoringSettingsRow; statements: FactoringSettingsRow[] }>(
    `/api/v1/factoring/statements-settings?${q(companyId)}`
  );
}

export function deactivateFactoring(companyId: string) {
  return apiRequest<{ ok: boolean }>(`/api/v1/factoring/deactivate`, {
    method: "POST",
    body: { operating_company_id: companyId },
  });
}
