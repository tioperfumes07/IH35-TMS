import { apiRequest } from "./client";

export type AbandonmentChargebackRow = Record<string, unknown>;

export async function listAbandonmentChargebacks(params: {
  operating_company_id: string;
  status?: "pending" | "approved" | "disputed" | "applied" | "reversed" | "all";
  driver_id?: string;
}) {
  const qs = new URLSearchParams({ operating_company_id: params.operating_company_id });
  if (params.status) qs.set("status", params.status);
  if (params.driver_id) qs.set("driver_id", params.driver_id);
  return apiRequest<{ abandonment_chargebacks: AbandonmentChargebackRow[] }>(`/api/v1/abandonment-chargebacks?${qs.toString()}`);
}

export async function approveAbandonmentChargeback(id: string, body: { operating_company_id: string; notes?: string | null }) {
  return apiRequest<{ abandonment_chargeback: AbandonmentChargebackRow }>(`/api/v1/abandonment-chargebacks/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body,
  });
}

export async function disputeAbandonmentChargeback(id: string, body: { operating_company_id: string; notes?: string | null }) {
  return apiRequest<{ abandonment_chargeback: AbandonmentChargebackRow }>(`/api/v1/abandonment-chargebacks/${encodeURIComponent(id)}/dispute`, {
    method: "POST",
    body,
  });
}

export async function reverseAbandonmentChargeback(id: string, body: { operating_company_id: string; reversal_reason: string }) {
  return apiRequest<{ abandonment_chargeback: AbandonmentChargebackRow }>(`/api/v1/abandonment-chargebacks/${encodeURIComponent(id)}/reverse`, {
    method: "POST",
    body,
  });
}

export async function getAbandonmentDefaults(operatingCompanyId: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{
    operating_company_id: string;
    default_towing_cost_cents: number;
    default_deadhead_rate_per_mile_cents: number;
    default_replacement_premium_pct: number;
    require_approval_above_cents: number;
  }>(`/api/v1/abandonment-defaults?${qs.toString()}`);
}

export async function putAbandonmentDefaults(body: {
  operating_company_id: string;
  default_towing_cost_cents: number;
  default_deadhead_rate_per_mile_cents: number;
  default_replacement_premium_pct: number;
  require_approval_above_cents: number;
}) {
  return apiRequest<typeof body>(`/api/v1/abandonment-defaults`, { method: "PUT", body });
}

export async function recordLoadAbandonment(
  loadId: string,
  operatingCompanyId: string,
  payload: {
    driver_id: string;
    abandonment_event_at: string;
    abandonment_location?: string | null;
    towing_cost_cents?: number | null;
    deadhead_miles?: number | string | null;
    deadhead_cost_cents?: number | null;
    replacement_driver_premium_cents?: number | null;
    other_recovery_cost_cents?: number | null;
    notes?: string | null;
  }
) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ abandonment_chargeback: AbandonmentChargebackRow; computed: Record<string, unknown> }>(
    `/api/v1/loads/${encodeURIComponent(loadId)}/abandonment?${qs.toString()}`,
    { method: "POST", body: payload }
  );
}
