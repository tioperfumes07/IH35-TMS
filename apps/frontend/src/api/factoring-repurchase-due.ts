// Lead ROUND 296 / 297 — the day-95 Repurchase Deadline decision queue. Day 95 asks the owner; it never recourses.
import { apiRequest } from "./client";

export type RepurchaseDueDecision = "extend" | "confirm_repurchase" | "mark_collected";

export type RepurchaseDueRow = {
  id: string;
  state: string;
  purchase_id: string;
  purchase_display_id: string | null;
  purchase_line_id: string;
  invoice_id: string;
  invoice_display_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  factor_vendor_id: string | null;
  factor_name: string | null;
  purchase_date: string;
  due_date: string;
  days_since_purchase: number;
  gross_cents: number;
  extended_to: string | null;
  decided_by_user_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

export async function getRepurchaseDue(companyId: string) {
  const r = await apiRequest<{ as_of: string; rows: RepurchaseDueRow[] }>(
    `/api/v1/factoring/repurchase-due?${new URLSearchParams({ operating_company_id: companyId })}`
  );
  if (!r || !Array.isArray(r.rows)) throw new Error("Malformed repurchase-due response");
  return r;
}

export async function decideRepurchaseDue(
  companyId: string,
  eventId: string,
  decision: RepurchaseDueDecision,
  extras: { extended_to?: string; note?: string } = {}
) {
  return apiRequest<{ id: string; state: string }>(`/api/v1/factoring/repurchase-due/${eventId}/decide`, {
    method: "POST",
    body: { operating_company_id: companyId, decision, ...extras },
  });
}
