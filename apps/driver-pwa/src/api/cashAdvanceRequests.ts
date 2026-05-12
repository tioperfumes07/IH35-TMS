import { apiRequest } from "./client";

export type CashAdvanceRequestRow = Record<string, unknown>;

export function listMyCashAdvanceRequests() {
  return apiRequest<{ requests: CashAdvanceRequestRow[] }>("/api/v1/driver/cash-advance-requests");
}

export function createCashAdvanceRequest(body: {
  requested_amount_cents: number;
  reason: string;
  proposed_recovery_per_settlement_cents?: number;
  submitted_via?: "pwa" | "office" | "phone";
}) {
  return apiRequest<{ request: CashAdvanceRequestRow }>("/api/v1/driver/cash-advance-requests", { method: "POST", body });
}

export function cancelCashAdvanceRequest(id: string) {
  return apiRequest<{ request: CashAdvanceRequestRow }>(`/api/v1/driver/cash-advance-requests/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
}
