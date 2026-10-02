// Lead ROUND 296 — month-end Faro Default Interest accrual (DR 6830 / CR 2155), proposed by one user, approved by another.
import { apiRequest } from "./client";

export type InterestAccrualLine = {
  purchase_id: string;
  purchase_display_id: string | null;
  purchase_line_id: string;
  invoice_id: string;
  invoice_display_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  purchase_date: string;
  net_cents: number;
  days_charged: number;
  cumulative_interest_cents: number;
  previously_accrued_cents: number;
  accrual_cents: number;
};

export type InterestAccrualPreview = {
  period: string;
  period_start: string;
  period_end: string;
  lines: InterestAccrualLine[];
  total_cents: number;
};

export type InterestAccrualRun = {
  id: string;
  period_start: string;
  period_end: string;
  state: "proposed" | "posted" | "rejected";
  line_count: number;
  total_cents: number;
  proposed_by_user_id: string;
  proposed_at: string;
  decided_by_user_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
  journal_entry_id: string | null;
  run_kind?: "period_close" | "event";
  event_purchase_line_id?: string | null;
  event_invoice_id?: string | null;
  event_invoice_display_id?: string | null;
  event_faro_invoice_number?: string | null;
};

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

export async function getInterestAccrualPreview(companyId: string, period: string) {
  const r = await apiRequest<InterestAccrualPreview>(`/api/v1/factoring/interest-accrual/preview?${q({ operating_company_id: companyId, period })}`);
  if (!r || !Array.isArray(r.lines)) throw new Error("Malformed interest-accrual preview");
  return r;
}

export async function getInterestAccrualRuns(companyId: string) {
  const r = await apiRequest<{ rows: InterestAccrualRun[] }>(`/api/v1/factoring/interest-accrual/runs?${q({ operating_company_id: companyId })}`);
  if (!r || !Array.isArray(r.rows)) throw new Error("Malformed interest-accrual runs");
  return r.rows;
}

export function proposeInterestAccrual(companyId: string, period: string) {
  return apiRequest<{ run_id: string; line_count: number; total_cents: number }>(`/api/v1/factoring/interest-accrual/propose`, {
    method: "POST",
    body: { operating_company_id: companyId, period },
  });
}

export function decideInterestAccrual(companyId: string, runId: string, decision: "approve" | "reject", note?: string) {
  return apiRequest<{ run_id: string; state: string; journal_entry_id: string | null }>(
    `/api/v1/factoring/interest-accrual/runs/${runId}/decide`,
    { method: "POST", body: { operating_company_id: companyId, decision, ...(note ? { note } : {}) } }
  );
}
