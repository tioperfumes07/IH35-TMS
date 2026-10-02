// Lead ROUND 296 §3 — per-customer Faro reserve (one query on the server, tied to GL 1230 + 1235) and its invoice drill.
import { apiRequest } from "./client";

export type ReserveByCustomerRow = {
  customer_id: string | null;
  customer_name: string;
  invoices_purchased: number;
  face_cents: number;
  advanced_cents: number;
  held_cents: number;
  released_cents: number;
  fees_cents: number;
  recourse_cents: number;
  reserve_now_cents: number;
};

export type ReserveByCustomerResponse = {
  as_of: string;
  rows: ReserveByCustomerRow[];
  total_reserve_now_cents: number;
  gl_balance_cents: number;
  ties_to_gl: boolean;
  empty_reason: string | null;
};

export type ReserveByInvoiceRow = ReserveByCustomerRow & { invoice_id: string | null; invoice_display_id: string | null };

const qs = (companyId: string, extra: Record<string, string | undefined> = {}) => {
  const p = new URLSearchParams({ operating_company_id: companyId });
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return p.toString();
};

export async function getReserveByCustomer(companyId: string, asOf?: string) {
  const r = await apiRequest<ReserveByCustomerResponse>(`/api/v1/factoring/reserves/by-customer?${qs(companyId, { as_of: asOf })}`);
  if (!r || !Array.isArray(r.rows)) throw new Error("Malformed reserve-by-customer response");
  return r;
}

export async function getReserveByInvoice(companyId: string, customerId: string | null, asOf?: string) {
  const r = await apiRequest<{ as_of: string; rows: ReserveByInvoiceRow[] }>(
    `/api/v1/factoring/reserves/by-invoice?${qs(companyId, { as_of: asOf, customer_id: customerId ?? undefined })}`
  );
  if (!r || !Array.isArray(r.rows)) throw new Error("Malformed reserve-by-invoice response");
  return r;
}
