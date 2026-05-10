import { apiRequest } from "./client";
import type { SettlementStatus } from "@ih35/shared-types";

export type { SettlementStatus } from "@ih35/shared-types";

export type SettlementListRow = {
  id: string;
  driver_id: string;
  driver_full_name: string;
  driver_display_id: string;
  period_start: string;
  period_end: string;
  status: SettlementStatus;
  gross_pay: number;
  deductions_total: number;
  net_pay: number;
  has_pending_acks: boolean;
  live_debt_flag: number | null;
  debt_computed_at: string | null;
  payment_state?: "unpaid" | "queued" | "sent_to_bank" | "cleared" | "bounced" | "manual_paid";
  payment_bank_reference?: string | null;
  payment_bounced_reason?: string | null;
  payment_method?: string | null;
};

export type DebtSummary = {
  driver_id: string;
  total_active_debt: number;
  pending_ack_count: number;
  pending_ack_total: number;
  escrow_pre_clause: number;
  escrow_post_clause: number;
  computed_at: string;
  source_liabilities: Array<Record<string, unknown>>;
};

export type SettlementPaymentEvent = {
  id: string;
  settlement_id: string;
  operating_company_id: string;
  event_type: "queued" | "sent" | "cleared" | "bounced" | "retried" | "marked_paid_manually";
  payload: Record<string, unknown> | null;
  user_id: string | null;
  created_at: string;
};

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export function listSettlements(
  companyId: string,
  options: { payment_state?: "unpaid" | "queued" | "sent_to_bank" | "cleared" | "bounced" | "manual_paid" } = {}
) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  if (options.payment_state) params.set("payment_state", options.payment_state);
  return apiRequest<{ settlements: SettlementListRow[]; total_count: number }>(`/api/v1/driver-finance/settlements?${params.toString()}`);
}

export function getSettlement(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/driver-finance/settlements/${id}?${q(companyId)}`);
}

export function createSettlement(payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/api/v1/driver-finance/settlements", { method: "POST", body: payload });
}

export function acknowledgeSettlement(id: string, companyId: string, etag?: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/driver-finance/settlements/${id}/acknowledge?${q(companyId)}`, {
    method: "PATCH",
    headers: etag ? { "If-Match": etag } : undefined,
  });
}

export function finalizeSettlement(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/driver-finance/settlements/${id}/finalize?${q(companyId)}`, {
    method: "PATCH",
  });
}

export function queueSettlementPayment(id: string) {
  return apiRequest<{ settlement: Record<string, unknown> }>(`/api/v1/driver-pay/settlements/${id}/queue-payment`, {
    method: "POST",
  });
}

export function markSettlementSent(id: string, bankReference: string) {
  return apiRequest<{ settlement: Record<string, unknown> }>(`/api/v1/driver-pay/settlements/${id}/mark-sent`, {
    method: "POST",
    body: { bank_reference: bankReference },
  });
}

export function markSettlementCleared(id: string) {
  return apiRequest<{ settlement: Record<string, unknown> }>(`/api/v1/driver-pay/settlements/${id}/mark-cleared`, {
    method: "POST",
  });
}

export function markSettlementBounced(id: string, reason: string) {
  return apiRequest<{ settlement: Record<string, unknown> }>(`/api/v1/driver-pay/settlements/${id}/mark-bounced`, {
    method: "POST",
    body: { reason },
  });
}

export function markSettlementPaidManually(id: string, payload: { payment_method: string; reference?: string }) {
  return apiRequest<{ settlement: Record<string, unknown> }>(`/api/v1/driver-pay/settlements/${id}/mark-paid-manually`, {
    method: "POST",
    body: payload,
  });
}

export function getSettlementPaymentEvents(id: string, companyId: string) {
  return apiRequest<{ events: SettlementPaymentEvent[] }>(`/api/v1/driver-pay/settlements/${id}/payment-events?${q(companyId)}`);
}

export function getDebtSummary(driverId: string, companyId: string) {
  return apiRequest<DebtSummary>(`/api/v1/driver-finance/drivers/${driverId}/debt-summary?${q(companyId)}`);
}

export function holdDeduction(
  id: string,
  companyId: string,
  payload: { hold_until_period: string; reason: string }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/driver-finance/deduction-schedules/${id}/hold?${q(companyId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function resumeDeduction(id: string, companyId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/driver-finance/deduction-schedules/${id}/resume?${q(companyId)}`, {
    method: "PATCH",
  });
}

export function getEscrowTimeline(driverId: string, companyId: string) {
  return apiRequest<{ timeline: Array<Record<string, unknown>> }>(
    `/api/v1/driver-finance/drivers/${driverId}/escrow-timeline?${q(companyId)}`
  );
}
