import { apiRequest } from "./client";

function withCompany(path: string, companyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(companyId)}`;
}

function num(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export type VendorMappingIntegrityIssue = {
  status: "green" | "yellow" | "red";
  totals: {
    unmapped_drivers: number;
    duplicate_mapping: number;
    name_mismatch: number;
    major_drift: number;
    total_issues: number;
  };
  unmapped_drivers: Array<{
    samsara_driver_id: string;
    local_driver_id: string | null;
    driver_name: string;
    reason: string;
  }>;
  duplicate_mapping: Array<{
    samsara_driver_id: string;
    vendor_count: number;
    qbo_vendor_ids: string[];
  }>;
  name_mismatch: Array<{
    samsara_driver_id: string;
    driver_id: string;
    qbo_vendor_id: string;
    samsara_name: string;
    qbo_vendor_name: string;
    similarity_score: number;
  }>;
};

export async function fetchVendorMappingIntegrity(companyId: string): Promise<VendorMappingIntegrityIssue> {
  const raw = await apiRequest<Record<string, unknown>>(withCompany("/api/v1/samsara/vendor-mapping-integrity", companyId));
  const statusRaw = String(raw.status ?? "green").toLowerCase();
  const status = statusRaw === "red" || statusRaw === "yellow" ? statusRaw : "green";
  const totalsRaw = raw.totals && typeof raw.totals === "object" ? (raw.totals as Record<string, unknown>) : {};
  return {
    status,
    totals: {
      unmapped_drivers: num(totalsRaw.unmapped_drivers),
      duplicate_mapping: num(totalsRaw.duplicate_mapping),
      name_mismatch: num(totalsRaw.name_mismatch),
      major_drift: num(totalsRaw.major_drift),
      total_issues: num(totalsRaw.total_issues),
    },
    unmapped_drivers: Array.isArray(raw.unmapped_drivers)
      ? (raw.unmapped_drivers as VendorMappingIntegrityIssue["unmapped_drivers"])
      : [],
    duplicate_mapping: Array.isArray(raw.duplicate_mapping)
      ? (raw.duplicate_mapping as VendorMappingIntegrityIssue["duplicate_mapping"])
      : [],
    name_mismatch: Array.isArray(raw.name_mismatch) ? (raw.name_mismatch as VendorMappingIntegrityIssue["name_mismatch"]) : [],
  };
}

export async function linkVendorMapping(payload: {
  operating_company_id: string;
  samsara_driver_id: string;
  qbo_vendor_id: string;
}) {
  return apiRequest("/api/v1/samsara/vendor-mapping/link", { method: "POST", body: payload });
}

export async function dedupeVendorMapping(payload: {
  operating_company_id: string;
  samsara_driver_id: string;
  canonical_qbo_vendor_id: string;
  deprecated_qbo_vendor_ids: string[];
}) {
  return apiRequest("/api/v1/samsara/vendor-mapping/dedupe", { method: "POST", body: payload });
}

export async function confirmVendorNameMismatch(payload: {
  operating_company_id: string;
  samsara_driver_id: string;
  qbo_vendor_id: string;
}) {
  return apiRequest("/api/v1/samsara/vendor-mapping/confirm-mismatch", { method: "POST", body: payload });
}
