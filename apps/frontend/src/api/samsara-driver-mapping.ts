import { apiRequest } from "./client";

function withCompany(path: string, companyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(companyId)}`;
}

/**
 * Samsara Driver Mapping — five laws (owner 2026-10-05):
 * 1. Nothing is ever written to Samsara.
 * 2. A driver may hold several ACTIVE Samsara usernames at once (ordinary, not an error).
 * 3. Never deactivate a driver because one username went inactive.
 * 4. Saving is ADDITIVE — the second save adds; it never replaces or clears.
 * 5. Samsara names are never changed; the map is the answer.
 */

export type ResolverSuggestion =
  | { status: "unmatched" }
  | { status: "matched"; target_id: string }
  | { status: "ambiguous"; candidate_ids: string[] };

export type SamsaraProfile = {
  samsara_driver_id: string;
  samsara_name: string;
  mapped: boolean;
  local_driver_id: string | null;
  local_vendor_id: string | null;
  driver_name: string | null;
  vendor_name: string | null;
  driver_status: string | null;
  /** true when the mapped target has since gone inactive/deactivated -- a real, named state. */
  mapped_target_deactivated: boolean;
  last_seen_at: string | null;
  /** Samsara-side activation (read-only mirror). Never written back. */
  samsara_status?: string | null;
  resolver_suggestion: ResolverSuggestion;
};

export type ProfilesResponse = {
  status: "ok";
  profiles: SamsaraProfile[];
  next_cursor: number | null;
  total?: number;
  scope_total?: number;
};

export type ProfilesQuery = {
  status?: "unmapped" | "mapped" | "all";
  seen_since?: string;
  q?: string;
  limit?: number;
  cursor?: number;
};

export function listSamsaraProfiles(companyId: string, query: ProfilesQuery = {}) {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.seen_since) params.set("seen_since", query.seen_since);
  if (query.q) params.set("q", query.q);
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.cursor != null) params.set("cursor", String(query.cursor));
  const qs = params.toString();
  return apiRequest<ProfilesResponse>(withCompany(`/api/v1/samsara/profiles${qs ? `?${qs}` : ""}`, companyId));
}

export type MappingTarget = {
  id: string;
  name: string;
  kind: "driver" | "vendor";
  active: boolean;
  cdl_number?: string | null;
  mapped_samsara_count?: number;
};

export type MappingTargetsResponse = {
  status: "ok";
  targets: MappingTarget[];
};

export function listMappingTargets(
  companyId: string,
  query: { kind: "driver" | "vendor"; filter?: "active" | "past" | "all"; q?: string; limit?: number }
) {
  const params = new URLSearchParams({ kind: query.kind });
  if (query.filter) params.set("filter", query.filter);
  if (query.q) params.set("q", query.q);
  if (query.limit != null) params.set("limit", String(query.limit));
  return apiRequest<MappingTargetsResponse>(withCompany(`/api/v1/samsara/mapping-targets?${params.toString()}`, companyId));
}

export type MapResponse = {
  status: "ok";
  mapped_count: number;
  canonical_count?: number;
  retired_driver_ids?: string[];
  kept_live?: Array<{ driver_id: string; reason: string }>;
  missing_samsara_driver_ids: string[];
};

export function mapSamsaraDrivers(
  companyId: string,
  body: {
    samsara_driver_ids: string[];
    target_kind: "driver" | "vendor";
    target_id: string;
    /** Retire a duplicate driver record left with no Samsara user into the target profile. */
    retire_emptied_drivers?: boolean;
  }
) {
  return apiRequest<MapResponse>(withCompany("/api/v1/samsara/map", companyId), {
    method: "POST",
    body,
  });
}

export type UnmapResponse = {
  status: "ok";
  unmapped_count: number;
};

export function unmapSamsaraDrivers(companyId: string, body: { samsara_driver_ids: string[] }) {
  return apiRequest<UnmapResponse>(withCompany("/api/v1/samsara/unmap", companyId), {
    method: "POST",
    body,
  });
}
