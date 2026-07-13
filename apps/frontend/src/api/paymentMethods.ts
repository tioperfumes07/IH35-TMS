import { apiRequest } from "./client";

// Phase 3 Settlement Pay-Run — owner-editable payment-method CATALOG client.
// Backend: apps/backend/src/driver-finance/payment-methods-catalog.routes.ts (LIVE).
// catalogs.payment_methods is DISTINCT from driver_finance.driver_payment_methods (the
// per-driver method row, which FKs into this catalog) — this is the master list of methods
// a company can pay by (ACH/Wire/Check/Cash/…), each optionally pinned to a GL cash/bank
// account. void-not-delete (is_active + voided_at), Owner/Administrator write-gated.

export type PaymentMethod = {
  id: string;
  operating_company_id: string;
  name: string;
  gl_account_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function q(companyId: string, extra: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) params.set(k, v);
  }
  return params.toString();
}

export function listPaymentMethods(companyId: string, includeInactive = false) {
  return apiRequest<PaymentMethod[]>(
    `/api/v1/catalogs/payment-methods?${q(companyId, { include_inactive: includeInactive ? "true" : undefined })}`
  );
}

export function createPaymentMethod(
  companyId: string,
  body: { name: string; gl_account_id?: string | null; sort_order?: number }
) {
  return apiRequest<PaymentMethod>(`/api/v1/catalogs/payment-methods?${q(companyId)}`, {
    method: "POST",
    body: { operating_company_id: companyId, ...body },
  });
}

export function updatePaymentMethod(
  id: string,
  companyId: string,
  body: { name?: string; gl_account_id?: string | null; sort_order?: number; is_active?: boolean }
) {
  return apiRequest<PaymentMethod>(`/api/v1/catalogs/payment-methods/${encodeURIComponent(id)}?${q(companyId)}`, {
    method: "PATCH",
    body: { operating_company_id: companyId, ...body },
  });
}

export function voidPaymentMethod(id: string, companyId: string, reason: string) {
  return apiRequest<PaymentMethod>(`/api/v1/catalogs/payment-methods/${encodeURIComponent(id)}/void?${q(companyId)}`, {
    method: "POST",
    body: { operating_company_id: companyId, reason },
  });
}
