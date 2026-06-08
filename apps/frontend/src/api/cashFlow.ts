import { apiRequest } from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type IncomeLineItem = {
  load_id: string;
  load_number: string;
  customer_name: string;
  delivery_time: string | null;
  amount_cents: number;
  basis: "Confirmed" | "Predicted" | "Adjustment";
};

export type ExpenseLineItem = {
  label: string;
  amount_cents: number;
  kind: "driver_pay" | "bill_due" | "adjustment";
  load_id?: string;
  adjustment_id?: string;
};

export type SevenDayEntry = {
  date: string;
  predicted_net_cents: number;
};

export type DailyPredictionResult = {
  date: string;
  income_items: IncomeLineItem[];
  income_subtotal_cents: number;
  expense_items: ExpenseLineItem[];
  expense_subtotal_cents: number;
  predicted_net_cents: number;
  opening_cash_cents: number | null;
  projected_closing_cash_cents: number | null;
  seven_day_strip: SevenDayEntry[];
};

export type AvpLineItem = {
  date: string;
  category: "income" | "expenses" | "net";
  projected_cents: number;
  actual_cents: number;
  variance_cents: number;
  variance_pct: number | null;
};

export type ActualVsProjectedResult = {
  from: string;
  to: string;
  lines: AvpLineItem[];
  accuracy_summary: {
    total_projected_income_cents: number;
    total_actual_income_cents: number;
    income_variance_pct: number | null;
    total_projected_expense_cents: number;
    total_actual_expense_cents: number;
    expense_variance_pct: number | null;
  };
};

export type CashFlowAdjustment = {
  id: string;
  operating_company_id: string;
  entry_date: string;
  label: string;
  amount_cents: number;
  created_by_user_id: string;
  archived_at: string | null;
  created_at: string;
};

// ─── API Functions ────────────────────────────────────────────────────────────

export function getDailyPrediction(
  operatingCompanyId: string,
  date: string
): Promise<DailyPredictionResult> {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId, date });
  return apiRequest<DailyPredictionResult>(`/api/v1/cash-flow/daily-prediction?${params}`);
}

export function getActualVsProjected(
  operatingCompanyId: string,
  from: string,
  to: string
): Promise<ActualVsProjectedResult> {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId, from, to });
  return apiRequest<ActualVsProjectedResult>(`/api/v1/cash-flow/actual-vs-projected?${params}`);
}

export function addCashFlowAdjustment(payload: {
  operating_company_id: string;
  entry_date: string;
  label: string;
  amount_cents: number;
}): Promise<CashFlowAdjustment> {
  return apiRequest<CashFlowAdjustment>("/api/v1/cash-flow/adjustments", {
    method: "POST",
    body: payload,
  });
}
