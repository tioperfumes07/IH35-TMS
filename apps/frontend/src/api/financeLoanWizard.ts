import { apiRequest } from "./client";

export const FINANCE_HUB_LOAN_WIZARD_FLAG = "FINANCE_HUB_LOAN_WIZARD_ENABLED";

export type LoanWizardPreviewInput = {
  operating_company_id: string;
  purchase_price_cents: number;
  down_payment_cents: number;
  funding_account_id?: string | null;
  loan_amount_cents: number;
  annual_rate_pct: number;
  term_months: number;
  first_payment_date: string;
  lender: string;
  assets: Array<{ name: string; vin_serial?: string }>;
  useful_life_months?: number;
  salvage_value_cents?: number;
  depreciation_start_date?: string;
};

export type AmortizationRow = {
  period: number;
  date: string;
  payment_cents: number;
  principal_cents: number;
  interest_cents: number;
  balance_cents: number;
};

export type DepreciationRow = {
  period: number;
  date: string;
  depreciation_cents: number;
  accumulated_cents: number;
  book_value_cents: number;
};

export type JournalLine = {
  account_role: string;
  account_id: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string;
};

export type LoanWizardPreview = {
  balanced: boolean;
  loan_record: {
    loan_type: "note_payable" | "loan_payable";
    principal_cents: number;
    annual_rate_pct: number;
    term_months: number;
    first_payment_date: string;
    lender: string;
  };
  fixed_asset: {
    assets: Array<{ name: string; vin_serial?: string }>;
    capitalized_cost_cents: number;
    depreciation_method: "straight_line";
    useful_life_months: number;
    salvage_value_cents: number;
    depreciation_start_date: string;
  };
  down_payment: { amount_cents: number; funding_account_id: string | null };
  amortization_schedule: AmortizationRow[];
  depreciation_schedule: DepreciationRow[];
  opening_journal_entry: { lines: JournalLine[]; debit_total_cents: number; credit_total_cents: number };
  summary: {
    monthly_payment_cents: number;
    total_payments_cents: number;
    total_interest_cents: number;
    number_of_payments: number;
  };
};

/** Preview-first: compute the full draft set without posting anything (Tier-3, gated). */
export function previewLoanWizard(input: LoanWizardPreviewInput) {
  return apiRequest<{ preview: LoanWizardPreview }>("/api/v1/finance/loan-wizard/preview", {
    method: "POST",
    body: input,
  });
}
