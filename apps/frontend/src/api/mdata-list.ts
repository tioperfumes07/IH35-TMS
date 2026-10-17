/**
 * Shared list-envelope helpers for the mdata catalog API clients (customers, vendors, mdata.ts).
 *
 * Heavy CI peel (Lead 13:45Z): 52699c6c2f (#26871, 443.182-A catalog one-source consolidation) moved listCustomers /
 * listVendors into catalog-customers.ts / catalog-vendors.ts and, because those files must not import values from
 * mdata.ts (circular dependency), pasted private copies of these helpers into each — two copies of the
 * LV-CUSTOMERS-FULL-EDIT normalizer and of the CUST-1 server-total rule. This leaf module (no imports) is the one
 * definition; mdata.ts and both catalog files import it.
 */

export type CompanyScopedListParams = {
  status?: string;
  search?: string;
  customer_type?: "broker" | "direct_shipper";
  operating_company_id?: string | null;
  limit?: number;
  offset?: number;
  active_company_only?: boolean;
  has_transactions?: boolean;
};

export function appendCompanyScopedQuery(query: URLSearchParams, params: CompanyScopedListParams) {
  if (params.status && params.status !== "All") query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.customer_type) query.set("customer_type", params.customer_type);
  if (params.operating_company_id) query.set("operating_company_id", params.operating_company_id);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  if (params.active_company_only) query.set("active_company_only", "true");
  if (params.has_transactions) query.set("has_transactions", "true");
}

/**
 * LV-CUSTOMERS-FULL-EDIT-LIST-RESPONSE-NOT-ARRAY — live Full Edit crashed with
 * `(o ?? []).map is not a function` because `listCustomers().customers` was sometimes a non-array
 * envelope (nested rows / bare array / missing key). Normalize at the API client boundary so every
 * consumer always receives `T[]`.
 */
export function normalizeMdataListRows<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const key of ["rows", "customers", "vendors", "data", "results", "payment_terms"] as const) {
      const nested = o[key];
      if (Array.isArray(nested)) return nested as T[];
    }
  }
  return [];
}

/** CUST-1: the server's `total` (real count for the same filters); falls back to the returned page length. */
export function listEnvelopeTotal(payload: unknown, rows: unknown[]): number {
  if (payload && typeof payload === "object") {
    const total = (payload as { total?: unknown }).total;
    if (typeof total === "number" && Number.isFinite(total)) return total;
  }
  return rows.length;
}
