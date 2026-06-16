import { apiRequest } from "./client";

export const FINANCE_HUB_AMORTIZATION_FLAG = "FINANCE_HUB_AMORTIZATION_ENABLED";

export type AmortLoan = {
  id: string;
  name: string;
  lender: string | null;
  original_principal_cents: number;
  interest_rate_bps: number;
  term_months: number;
  first_payment_date: string;
  loan_type: "note_payable" | "loan_payable";
  status: string;
};

export type AmortRow = {
  payment_number: number;
  due_date: string;
  payment_cents: number;
  principal_cents: number;
  interest_cents: number;
  remaining_balance_cents: number;
  posted: boolean;
};

export type CreateLoanPayload = {
  operating_company_id: string;
  name: string;
  lender?: string | null;
  original_principal_cents: number;
  interest_rate_bps: number;
  term_months: number;
  first_payment_date: string;
};

export function listLoans(operatingCompanyId: string) {
  return apiRequest<{ loans: AmortLoan[] }>(`/api/v1/finance/loans?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}

export function createLoan(payload: CreateLoanPayload) {
  return apiRequest<{ loan: AmortLoan; rows: AmortRow[] }>("/api/v1/finance/loans", { method: "POST", body: payload });
}

export function getLoanSchedule(loanId: string, operatingCompanyId: string) {
  return apiRequest<{ schedule: AmortRow[] }>(
    `/api/v1/finance/loans/${loanId}/schedule?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}
