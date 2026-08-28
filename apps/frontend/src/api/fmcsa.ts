import { apiRequest } from "./client";

export type FmcsaLookupType = "usdot" | "mc";

export type FmcsaLookupResult = {
  lookup_id: string;
  cached: boolean;
  lookup_type: FmcsaLookupType;
  lookup_value: string;
  legal_name: string | null;
  dba_name: string | null;
  usdot_number: string | null;
  mc_number: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  authority_status: "ACTIVE" | "INACTIVE" | "REVOKED" | "NONE";
  insurance_status: string | null;
  safety_rating: string | null;
  fetched_at: string;
  cached_until: string;
};

export function lookupFmcsa(body: { type: FmcsaLookupType; value: string; operating_company_id: string }) {
  return apiRequest<FmcsaLookupResult>("/api/v1/catalogs/fmcsa/lookup", { method: "POST", body });
}

export function linkFmcsaLookupToCustomer(customerId: string, lookupId: string, operatingCompanyId: string) {
  return apiRequest<{
    customer: {
      id: string;
      fmcsa_verified_at: string;
      fmcsa_lookup_id: string;
      fmcsa_authority_status_at_verification: string | null;
    };
  }>(`/api/v1/mdata/customers/${customerId}/fmcsa-link`, {
    method: "POST",
    body: { lookup_id: lookupId, operating_company_id: operatingCompanyId },
  });
}

export function listFmcsaLookups(operatingCompanyId: string, params?: { limit?: number; offset?: number }) {
  const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiRequest<{ lookups: FmcsaLookupResult[]; total: number; limit: number; offset: number; has_more: boolean }>(
    `/api/v1/catalogs/fmcsa/lookups${qs ? `?${qs}` : ""}`
  );
}

export async function listAllFmcsaLookups(operatingCompanyId: string) {
  const pageSize = 200;
  const lookups: FmcsaLookupResult[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let expectedTotal: number | null = null;

  for (;;) {
    const page = await listFmcsaLookups(operatingCompanyId, { limit: pageSize, offset });
    if (expectedTotal == null) expectedTotal = page.total;
    if (page.total !== expectedTotal) throw new Error("FMCSA verification history changed during pagination. Retry.");
    for (const lookup of page.lookups) {
      if (seen.has(lookup.lookup_id)) throw new Error("FMCSA verification pagination returned a duplicate row. Retry.");
      seen.add(lookup.lookup_id);
      lookups.push(lookup);
    }
    if (!page.has_more) break;
    if (page.lookups.length === 0) throw new Error("FMCSA verification pagination stopped before the reported total.");
    offset += page.lookups.length;
  }
  if (lookups.length !== (expectedTotal ?? 0)) {
    throw new Error(`FMCSA verification pagination returned ${lookups.length} of ${expectedTotal ?? 0} rows.`);
  }
  return { lookups, total: expectedTotal ?? 0 };
}
