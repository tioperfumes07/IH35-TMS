import { apiRequest } from "./client";
// One definition of the list helpers (heavy CI peel; the copies pasted by 52699c6c2f are gone).
import { appendCompanyScopedQuery, listEnvelopeTotal, normalizeMdataListRows, type CompanyScopedListParams } from "./mdata-list";
import type { Customer } from "./mdata";

export function listCustomers(params: CompanyScopedListParams = {}) {
  const query = new URLSearchParams();
  appendCompanyScopedQuery(query, params);
  const qs = query.toString();
  return apiRequest<{ customers: Customer[]; total?: number } | Customer[]>(
    `/api/v1/mdata/customers${qs ? `?${qs}` : ""}`
  ).then((payload) => {
    const customers = normalizeMdataListRows<Customer>(
      Array.isArray(payload) ? payload : (payload as { customers?: unknown })?.customers ?? payload
    );
    return { customers, total: listEnvelopeTotal(payload, customers) };
  });
}

export async function listAllCustomers(params: Omit<CompanyScopedListParams, "limit" | "offset"> = {}) {
  const limit = 5000;
  const customers: Customer[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let expectedTotal: number | null = null;
  while (true) {
    const page = await listCustomers({ ...params, limit, offset });
    if (expectedTotal == null) expectedTotal = page.total;
    if (page.total !== expectedTotal) throw new Error("Customer roster changed during pagination. Retry.");
    for (const customer of page.customers) {
      if (!seen.has(customer.id)) { seen.add(customer.id); customers.push(customer); }
    }
    if (customers.length >= expectedTotal) return { customers, total: expectedTotal };
    if (page.customers.length === 0) throw new Error("Customer roster pagination stopped before the reported total.");
    offset += page.customers.length;
  }
}

export type CustomerAutocompleteRow = {
  id: string;
  qbo_id: string;
  display_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  mc_number: string | null;
  active: boolean;
};

export function searchCustomersAutocomplete(
  operatingCompanyId: string,
  term: string,
  opts: { activeOnly?: boolean; limit?: number } = {}
) {
  const query = new URLSearchParams({
    operating_company_id: operatingCompanyId,
    autocomplete: "true",
    limit: String(opts.limit ?? 2000),
  });
  if (term.trim()) query.set("search", term.trim());
  if (opts.activeOnly === false) query.set("active_only", "false");
  return apiRequest<{ results: CustomerAutocompleteRow[] }>(`/api/v1/mdata/customers?${query.toString()}`).then(
    (payload) => payload.results ?? []
  );
}

export function searchCustomersQboAutocomplete(
  operatingCompanyId: string,
  params: { q: string; active_only?: boolean }
): Promise<{ results: Array<{ id: string; qbo_id: string; display_name: string; active: boolean; primary_email?: string | null; primary_phone?: string | null; mc_number?: string | null }> }> {
  const s = new URLSearchParams({ autocomplete: "true", q: params.q, operating_company_id: operatingCompanyId });
  if (params.active_only === false) s.set("active_only", "false");
  return apiRequest(`/api/v1/mdata/customers?${s.toString()}`);
}
