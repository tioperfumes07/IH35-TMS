// LEASE-05 — frontend client for the lease-contract surface.
//
// Backs the Legal lease-contract creator and the Fleet lease views. Read-only for now: creating a
// contract is the next slice, and posting rent / rental income needs a per-deal ASC 842 election plus
// owner-designated accounts, so neither is exposed here.
import { apiRequest } from "./client";

function withCompany(path: string, operatingCompanyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

export type LeaseContract = {
  id: string;
  lessor_code: string | null;
  lessee_code: string | null;
  /** The LEGAL format picked in Legal — not the accounting election. */
  contract_format: "lease" | "lease_to_own";
  /** Deliberately separate from contract_format: a lease_to_own contract does NOT auto-elect
   *  sales-type, because that would derecognize the truck on Trucking and stop its depreciation. */
  asc842_classification: "operating" | "sales_type" | "direct_financing";
  status: "draft" | "active" | "ended" | "void";
  commenced_on: string | null;
  ended_on: string | null;
  contract_instance_id: string | null;
  line_count: number;
  /** Summed from the STORED per-line amounts, never recomputed from a group total. */
  monthly_total_cents: string;
};

export type LeaseContractLine = {
  group_id: string | null;
  asset_group_label: string | null;
  allocation_method: "per_unit" | "even_split" | null;
  group_total_cents: string | null;
  line_id: string;
  unit_id: string | null;
  equipment_id: string | null;
  asset_number: string | null;
  monthly_amount_cents: string;
};

/** One asset -> EVERY lessee it is leased to. Two rows for a truck leased to both entities is CORRECT. */
export type AssetLeaseParty = {
  lessee_code: string | null;
  lessor_code: string | null;
  commenced_on: string | null;
  ended_on: string | null;
  monthly_amount_cents: string | null;
  contract_format: string | null;
  asc842_classification: string | null;
};

export type LeasePickerTrailer = {
  id: string;
  equipment_number: string | null;
  vin: string | null;
  /** Raw from mdata.equipment — the owner re-categorises trailers in Fleet, so this is never mapped
   *  to a hardcoded list here. NULL means uncategorised, and those are still selectable. */
  equipment_type: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string | null;
  owner_company_id: string | null;
  owner_label: string | null;
};

export type LeaseTrailerType = { equipment_type: string | null; trailer_count: number };

export function listLeaseContracts(operatingCompanyId: string) {
  return apiRequest<{ rows: LeaseContract[] }>(
    withCompany("/api/v1/fleet/lease-contracts", operatingCompanyId)
  );
}

export function getLeaseContractLines(operatingCompanyId: string, contractId: string) {
  return apiRequest<{ rows: LeaseContractLine[] }>(
    withCompany(`/api/v1/fleet/lease-contracts/${contractId}/lines`, operatingCompanyId)
  );
}

export function getAssetLeaseParties(operatingCompanyId: string, assetId: string) {
  return apiRequest<{ rows: AssetLeaseParty[] }>(
    withCompany(`/api/v1/fleet/assets/${assetId}/lease-parties`, operatingCompanyId)
  );
}

/** Trailers for the contract picker. mdata.units holds tractors only, so this is a separate call. */
export function listLeasePickerTrailers(operatingCompanyId: string, ownerCompanyId?: string | null) {
  const base = ownerCompanyId
    ? `/api/v1/fleet/lease-picker/trailers?owner_company_id=${encodeURIComponent(ownerCompanyId)}`
    : "/api/v1/fleet/lease-picker/trailers";
  return apiRequest<{ rows: LeasePickerTrailer[] }>(withCompany(base, operatingCompanyId));
}

/** Trailer types with live counts — drives the "flatbeds - 10 selected, total 8,000" grouping. */
export function listLeaseTrailerTypes(operatingCompanyId: string, ownerCompanyId?: string | null) {
  const base = ownerCompanyId
    ? `/api/v1/fleet/lease-picker/trailer-types?owner_company_id=${encodeURIComponent(ownerCompanyId)}`
    : "/api/v1/fleet/lease-picker/trailer-types";
  return apiRequest<{ rows: LeaseTrailerType[] }>(withCompany(base, operatingCompanyId));
}

/**
 * Even-split preview, mirroring mdata.allocate_lease_group_evenly exactly — LARGEST-REMAINDER.
 * base = total / n to every line, then one extra cent to the first (total mod n).
 *
 * The examples the owner gave divide evenly (8,000/10 = 800; 15,000/20 = 750), but 60,000 across 7
 * does not: 6,000,000 / 7 = 857,142.857. Showing a rounded 857,142.86 x 7 would display a total of
 * 6,000,000.02 — money that does not exist. This returns whole cents that sum EXACTLY to the total,
 * so the preview and the stored allocation can never disagree.
 */
export function previewEvenSplitCents(totalCents: number, lineCount: number): number[] {
  if (lineCount <= 0) return [];
  const base = Math.floor(totalCents / lineCount);
  const remainder = totalCents - base * lineCount;
  return Array.from({ length: lineCount }, (_, i) => base + (i < remainder ? 1 : 0));
}
