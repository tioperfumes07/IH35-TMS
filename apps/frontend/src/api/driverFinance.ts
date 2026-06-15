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

export type EscrowPendingDeduction = {
  id: string;
  driver_id: string;
  driver_name: string | null;
  source_type: string;
  load_id: string | null;
  load_number: string | null;
  proposed_amount_cents: number;
  proposed_reason: string;
  proposed_breakdown_json: Record<string, unknown> | null;
  proposed_at: string;
  expires_at: string;
  status: "pending" | "approved" | "rejected" | "expired";
};

export type SettlementDisputeStatus =
  | "open"
  | "under_review"
  | "resolved_in_favor"
  | "resolved_rejected"
  | "partially_resolved"
  | "withdrawn";

export type SettlementDisputeCategory =
  | "missing_pay"
  | "wrong_deduction"
  | "miscalculated_mileage"
  | "wrong_rate"
  | "detention_not_paid"
  | "cash_advance_dispute"
  | "fine_dispute"
  | "escrow_dispute"
  | "other";

export type SettlementDisputeRow = {
  id: string;
  operating_company_id: string;
  settlement_id: string;
  settlement_display_id?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  gross_pay?: number;
  deductions_total?: number;
  net_pay?: number;
  driver_id: string;
  driver_name?: string | null;
  dispute_category: SettlementDisputeCategory;
  dispute_description: string;
  disputed_amount_cents: number | null;
  status: SettlementDisputeStatus;
  opened_at: string;
  reviewed_at?: string | null;
  closed_at?: string | null;
  resolution_notes?: string | null;
  resolution_amount_cents?: number | null;
  resolution_journal_entry_id?: string | null;
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

export type EscrowRecordRow = {
  id: string;
  driver_name: string;
  current_balance: number;
  pre_clause_total: number;
  post_clause_total: number;
  accumulation_rate_pct: number;
  forfeiture_history_count: number;
  has_signed_clause: boolean;
};

export type EscrowForfeitAttempt = {
  id: string;
  driver_name: string;
  amount: number;
  reason: string;
  linked_liability_id?: string;
  status: "success" | "blocked";
  created_at: string;
};

const ESCROW_TARGET_DEFAULT = 1000;

function isForfeitEntry(entryType: unknown) {
  return String(entryType ?? "")
    .toLowerCase()
    .includes("forfeit");
}

function timelineToAttempts(
  driverName: string,
  timeline: Array<Record<string, unknown>>
): EscrowForfeitAttempt[] {
  return timeline
    .filter((row) => isForfeitEntry(row.entry_type))
    .map((row) => ({
      id: String(row.id ?? `${driverName}-${row.created_at ?? ""}`),
      driver_name: driverName,
      amount: Math.abs(Number(row.amount ?? 0)),
      reason: String(row.memo ?? row.reason ?? "Escrow forfeiture"),
      linked_liability_id: row.linked_liability_id ? String(row.linked_liability_id) : undefined,
      status: String(row.status ?? "success").toLowerCase() === "blocked" ? "blocked" : "success",
      created_at: String(row.created_at ?? row.posted_at ?? new Date().toISOString()),
    }));
}

/** Company escrow roster for Safety Escrow Record tab (A23-8).
 *  Assembled from the existing /api/v1/banking/escrow-visualizer endpoint (+ debt + timeline).
 *  The old /api/v1/driver-finance/escrow primary call was removed — that endpoint was never built,
 *  so it 404'd on every page load and always fell through to this path anyway. */
export async function listEscrowRecords(companyId: string) {
  const { getEscrowDriverBalances, getEscrowDriverTimeline } = await import("./banking");
  const { drivers } = await getEscrowDriverBalances(companyId);
  const forfeitAttempts: EscrowForfeitAttempt[] = [];
  const records: EscrowRecordRow[] = [];

  for (const driver of drivers) {
    const driverId = String(driver.driver_id ?? "");
    const driverName = String(driver.driver_name ?? "Unknown driver");
    if (!driverId) continue;

    const [debt, timelinePayload] = await Promise.all([
      getDebtSummary(driverId, companyId).catch(() => null),
      getEscrowDriverTimeline(companyId, driverId).catch(() => ({ timeline: [] as Array<Record<string, unknown>> })),
    ]);
    const timeline = timelinePayload.timeline ?? [];
    forfeitAttempts.push(...timelineToAttempts(driverName, timeline));

    const preClause = Number(debt?.escrow_pre_clause ?? 0);
    const postClause = Number(debt?.escrow_post_clause ?? 0);
    const currentBalance = Number(driver.escrow_balance ?? preClause + postClause);
    const forfeitCount = timeline.filter((row) => isForfeitEntry(row.entry_type)).length;
    const hasSignedClause =
      postClause > 0 || timeline.some((row) => String(row.bucket ?? "").toLowerCase() === "post_clause");

    records.push({
      id: driverId,
      driver_name: driverName,
      current_balance: currentBalance,
      pre_clause_total: preClause,
      post_clause_total: postClause,
      accumulation_rate_pct: Math.max(0, Math.min(100, (currentBalance / ESCROW_TARGET_DEFAULT) * 100)),
      forfeiture_history_count: forfeitCount,
      has_signed_clause: hasSignedClause,
    });
  }

  forfeitAttempts.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { records, forfeit_attempts: forfeitAttempts };
}

export function forfeitEscrow(
  driverId: string,
  payload: {
    operating_company_id: string;
    amount: number;
    reason: string;
    linked_liability_id?: string;
  }
) {
  return apiRequest<{ ok: boolean; status?: "success" | "blocked"; audit_id?: string }>(
    `/api/v1/driver-finance/escrow/${encodeURIComponent(driverId)}/forfeit`,
    {
      method: "POST",
      body: {
        operating_company_id: payload.operating_company_id,
        driver_uuid: driverId,
        amount: payload.amount,
        reason: payload.reason,
        linked_liability_id: payload.linked_liability_id,
      },
    }
  );
}

export function listPendingEscrowDeductions(companyId: string) {
  return apiRequest<{ data: EscrowPendingDeduction[] }>(
    `/api/v1/driver-finance/escrow-deductions-pending?${q(companyId)}`
  );
}

export function approvePendingEscrowDeduction(
  id: string,
  payload: { operating_company_id: string; override_amount_cents?: number; review_notes?: string }
) {
  return apiRequest<{ data: { pending_id: string; deduction_id: string; amount_cents: number } }>(
    `/api/v1/driver-finance/escrow-deductions-pending/${id}/approve`,
    { method: "POST", body: payload }
  );
}

export function rejectPendingEscrowDeduction(id: string, payload: { operating_company_id: string; review_notes: string }) {
  return apiRequest<{ data: { pending_id: string } }>(
    `/api/v1/driver-finance/escrow-deductions-pending/${id}/reject`,
    { method: "POST", body: payload }
  );
}

export function listSettlementDisputes(
  companyId: string,
  options: { status?: "open" | "all"; driver_id?: string } = {}
) {
  const params = new URLSearchParams({ operating_company_id: companyId, status: options.status ?? "open" });
  if (options.driver_id) params.set("driver_id", options.driver_id);
  return apiRequest<{ disputes: SettlementDisputeRow[] }>(`/api/v1/driver-finance/settlement-disputes?${params.toString()}`);
}

export function getSettlementDispute(id: string, companyId: string) {
  return apiRequest<{ dispute: SettlementDisputeRow }>(`/api/v1/driver-finance/settlement-disputes/${id}?${q(companyId)}`);
}

export function openSettlementDispute(payload: {
  operating_company_id: string;
  settlement_id: string;
  driver_id: string;
  dispute_category: SettlementDisputeCategory;
  dispute_description: string;
  disputed_amount_cents?: number;
}) {
  return apiRequest<{ data: { id: string } }>("/api/v1/driver-finance/settlement-disputes", { method: "POST", body: payload });
}

export function markSettlementDisputeUnderReview(id: string, payload: { operating_company_id: string }) {
  return apiRequest<{ data: { id: string } }>(`/api/v1/driver-finance/settlement-disputes/${id}/review`, {
    method: "POST",
    body: payload,
  });
}

export function resolveSettlementDispute(
  id: string,
  payload: {
    operating_company_id: string;
    resolution: "in_favor" | "rejected" | "partial";
    resolution_notes: string;
    resolution_amount_cents?: number;
  }
) {
  return apiRequest<{ data: { id: string; status: SettlementDisputeStatus; resolution_journal_entry_id: string | null } }>(
    `/api/v1/driver-finance/settlement-disputes/${id}/resolve`,
    { method: "POST", body: payload }
  );
}

export function withdrawSettlementDispute(id: string, payload: { operating_company_id: string }) {
  return apiRequest<{ data: { id: string } }>(`/api/v1/driver-finance/settlement-disputes/${id}/withdraw`, {
    method: "POST",
    body: payload,
  });
}

// ── Pre-settlement NB→SB trip-linking (MUST 8a.0.5.12) ─────────────────────

export type OpenPreSettlement = {
  settlement_id: string;
  settlement_number: string | null;
  driver_id: string;
  first_load_id: string | null;
  first_load_number: string | null;
  last_load_id: string | null;
  last_load_number: string | null;
  status: string;
  gross_pay: number;
  deductions_total: number;
  net_pay: number;
  trip_started_at: string | null;
};

export type PreSettlementLine = {
  id: string;
  line_type: string;
  description: string;
  amount: number;
  created_at: string;
};

export type PreSettlementDetail = {
  settlement: {
    id: string;
    display_id: string | null;
    driver_id: string;
    status: string;
    gross_pay: number;
    deductions_total: number;
    reimbursements_total: number;
    net_pay: number;
    first_load_id: string | null;
    first_load_number: string | null;
    last_load_id: string | null;
    last_load_number: string | null;
    trip_started_at: string | null;
    trip_closed_at: string | null;
    period_start: string;
    period_end: string;
  };
  lines: PreSettlementLine[];
};

/** Board: bulk list of all open pre-settlements keyed by driver. */
export function listOpenPreSettlements(companyId: string) {
  return apiRequest<{ pre_settlements: OpenPreSettlement[] }>(
    `/api/v1/driver-finance/pre-settlements/open-by-driver?${q(companyId)}`
  );
}

/** Drawer: detail view (lines + totals) for a single driver's active pre-settlement. */
export function getPreSettlementForDriver(driverId: string, companyId: string) {
  return apiRequest<PreSettlementDetail>(
    `/api/v1/driver-finance/pre-settlements/by-driver/${encodeURIComponent(driverId)}?${q(companyId)}`
  );
}

/** Board: links the SB load to the driver's existing open pre-settlement. */
export function addLoadToPreSettlement(
  settlementId: string,
  payload: { operating_company_id: string; load_id: string }
) {
  return apiRequest<{ ok: boolean; settlement_id: string; totals: Record<string, number> }>(
    `/api/v1/driver-finance/pre-settlements/${encodeURIComponent(settlementId)}/add-load`,
    { method: "POST", body: payload }
  );
}

/** Drawer: finalises the closed pre-settlement — PDF, email, driver notification. */
export function settleAndPay(settlementId: string, operatingCompanyId: string) {
  return apiRequest<{ ok: boolean; settlement_id: string; net_pay: number }>(
    `/api/v1/driver-finance/pre-settlements/${encodeURIComponent(settlementId)}/settle`,
    { method: "POST", body: { operating_company_id: operatingCompanyId } }
  );
}
