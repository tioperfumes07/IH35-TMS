import { apiRequest } from "./client";

export type SettlementDisputeStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "denied"
  | "withdrawn";

export type SettlementDisputeQueueRow = {
  id: string;
  operating_company_id: string;
  settlement_id: string;
  settlement_line_id: string | null;
  driver_id: string;
  driver_name: string | null;
  settlement_display_id: string | null;
  reason_code: string;
  reason_text: string;
  claimed_adjustment_cents: number | null;
  submitted_at: string;
  status: SettlementDisputeStatus | string;
  reviewer_user_id: string | null;
  reviewed_at: string | null;
  resolution_text: string | null;
  adjustment_cents: number | null;
  adjustment_journal_id: string | null;
};

export type DisputeQueueResponse = {
  disputes: SettlementDisputeQueueRow[];
  total: number;
  limit: number;
  offset: number;
};

export type DecideDisputeBody = {
  operating_company_id: string;
  decision: "approved" | "denied";
  resolution_text: string;
  adjustment_cents?: number;
};

export function listDisputeQueue(
  operatingCompanyId: string,
  opts: { status?: string; driver_id?: string; limit?: number; offset?: number } = {},
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (opts.status && opts.status !== "all") q.set("status", opts.status);
  if (opts.driver_id) q.set("driver_id", opts.driver_id);
  if (opts.limit != null) q.set("limit", String(opts.limit));
  if (opts.offset != null) q.set("offset", String(opts.offset));
  return apiRequest<DisputeQueueResponse>(`/api/v1/disputes?${q.toString()}`);
}

export function startDisputeReview(disputeId: string, operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ id: string }>(`/api/v1/disputes/${disputeId}/start-review?${q.toString()}`, {
    method: "POST",
  });
}

export function decideDispute(disputeId: string, body: DecideDisputeBody) {
  return apiRequest<{ id: string; decision: string }>(`/api/v1/disputes/${disputeId}/decide`, {
    method: "POST",
    body,
  });
}
