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

export function lookupFmcsa(body: { type: FmcsaLookupType; value: string }) {
  return apiRequest<FmcsaLookupResult>("/api/v1/catalogs/fmcsa/lookup", { method: "POST", body });
}

export function linkFmcsaLookupToCustomer(customerId: string, lookupId: string) {
  return apiRequest<{
    customer: {
      id: string;
      fmcsa_verified_at: string;
      fmcsa_lookup_id: string;
      fmcsa_authority_status_at_verification: string | null;
    };
  }>(`/api/v1/mdata/customers/${customerId}/fmcsa-link`, { method: "POST", body: { lookup_id: lookupId } });
}

export function listFmcsaLookups(params?: { limit?: number; offset?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiRequest<{ lookups: FmcsaLookupResult[] }>(`/api/v1/catalogs/fmcsa/lookups${qs ? `?${qs}` : ""}`);
}
