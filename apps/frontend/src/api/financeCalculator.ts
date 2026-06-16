import { apiRequest } from "./client";

export const FINANCE_HUB_CALCULATOR_FLAG = "FINANCE_HUB_CALCULATOR_ENABLED";

export type CalcPreviewRow = {
  period: number;
  date: string;
  payment_cents: number;
  principal_cents: number;
  interest_cents: number;
  balance_cents: number;
};

export type CalcScenario = {
  annual_rate_pct: number;
  term_months: number;
  financed_principal_cents: number;
  monthly_payment_cents: number;
  total_payments_cents: number;
  total_interest_cents: number;
  payoff_date: string;
  number_of_payments: number;
  amortization_preview: CalcPreviewRow[];
};

export type CalculatorPayload = {
  operating_company_id: string;
  price_cents: number;
  down_payment_cents: number;
  first_payment_date: string;
  scenarios: Array<{ annual_rate_pct: number; term_months: number }>;
};

export function computeCalculator(payload: CalculatorPayload) {
  return apiRequest<{ financed_principal_cents: number; scenarios: CalcScenario[] }>(
    "/api/v1/finance/calculator/compute",
    { method: "POST", body: payload }
  );
}
