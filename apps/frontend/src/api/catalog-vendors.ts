import { apiRequest } from "./client";
import type { VendorOption } from "./mdata";

// Helpers copied inline — catalog files must not import values from mdata.ts (circular dep).
type CompanyScopedListParams = {
  status?: string;
  search?: string;
  operating_company_id?: string | null;
  limit?: number;
  offset?: number;
  active_company_only?: boolean;
  has_transactions?: boolean;
};

function appendCompanyScopedQuery(query: URLSearchParams, params: CompanyScopedListParams) {
  if (params.status && params.status !== "All") query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.operating_company_id) query.set("operating_company_id", params.operating_company_id);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  if (params.active_company_only) query.set("active_company_only", "true");
  if (params.has_transactions) query.set("has_transactions", "true");
}

function normalizeMdataRows<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    for (const key of ["vendors", "rows", "data", "results"] as const) {
      const nested = (raw as Record<string, unknown>)[key];
      if (Array.isArray(nested)) return nested as T[];
    }
  }
  return [];
}

function envelopeTotal(payload: unknown, rows: unknown[]): number {
  const total = payload && typeof payload === "object" ? (payload as { total?: unknown }).total : undefined;
  return typeof total === "number" && Number.isFinite(total) ? total : rows.length;
}

export function listVendors(params: CompanyScopedListParams = {}) {
  const query = new URLSearchParams();
  appendCompanyScopedQuery(query, params);
  const qs = query.toString();
  return apiRequest<{ vendors: VendorOption[]; total?: number } | VendorOption[]>(
    `/api/v1/mdata/vendors${qs ? `?${qs}` : ""}`
  ).then((payload) => {
    const vendors = normalizeMdataRows<VendorOption>(
      Array.isArray(payload) ? payload : (payload as { vendors?: unknown })?.vendors ?? payload
    );
    return { vendors, total: envelopeTotal(payload, vendors) };
  });
}

export async function listAllVendors(params: Omit<CompanyScopedListParams, "limit" | "offset"> = {}) {
  const limit = 5000;
  const vendors: VendorOption[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let expectedTotal: number | null = null;
  while (true) {
    const page = await listVendors({ ...params, limit, offset });
    if (expectedTotal == null) expectedTotal = page.total;
    if (page.total !== expectedTotal) throw new Error("Vendor roster changed during pagination. Retry.");
    for (const vendor of page.vendors) {
      if (!seen.has(vendor.id)) { seen.add(vendor.id); vendors.push(vendor); }
    }
    if (offset + page.vendors.length >= expectedTotal) return { vendors, total: expectedTotal };
    if (page.vendors.length === 0) throw new Error("Vendor roster pagination stopped before the reported total.");
    offset += page.vendors.length;
  }
}

export type MaintenanceVendorRow = {
  id: string;
  code: string;
  display_name: string;
  name?: string;
  description: string | null;
  type: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  payment_terms: string | null;
  notes: string | null;
  mdata_vendor_id: string | null;
  mdata_vendor_name: string | null;
  is_active: boolean;
  active?: boolean;
  archived_at?: string | null;
  archive_reason?: string | null;
};

export function listMaintenanceVendors(
  operatingCompanyId: string,
  params: { search?: string; include_archived?: boolean; mdata_vendor_id?: string } = {}
) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params.search) q.set("search", params.search);
  if (params.include_archived != null) q.set("include_archived", String(params.include_archived));
  if (params.mdata_vendor_id) q.set("mdata_vendor_id", params.mdata_vendor_id);
  return apiRequest<{ rows: MaintenanceVendorRow[]; csv_import_enabled: boolean }>(
    `/api/v1/maintenance/vendors?${q.toString()}`
  );
}

export function searchVendorsQboAutocomplete(
  operatingCompanyId: string,
  params: { q: string; active_only?: boolean }
): Promise<{ results: Array<{ id: string; qbo_id: string; display_name: string; active: boolean; primary_email?: string | null; primary_phone?: string | null; mc_number?: string | null }> }> {
  const s = new URLSearchParams({ autocomplete: "true", q: params.q, operating_company_id: operatingCompanyId });
  if (params.active_only === false) s.set("active_only", "false");
  return apiRequest(`/api/v1/mdata/vendors?${s.toString()}`);
}
