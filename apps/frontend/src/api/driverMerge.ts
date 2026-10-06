// Driver merge (owner 2026-10-06): one driver profile per person; many Samsara users may point at it.
import { apiRequest } from "./client";

function withCompany(path: string, operatingCompanyId: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

export type DuplicateDriver = { id: string; first_name: string | null; last_name: string | null; status: string; cdl_number: string | null; loads: number };
export type DuplicateCluster = { survivor: DuplicateDriver; merged: DuplicateDriver[]; why: string[] };
export type MergeReference = { ref: string; rows: number; status?: "moved" | "kept_on_survivor" | "history_kept"; reason?: string };
export type MergePreview = {
  survivor: { id: string; name: string; status: string; loads: number };
  merged: { id: string; name: string; status: string; loads: number };
  references: MergeReference[];
  escrow: { merged_balance_cents: number; survivor_has_account: boolean; merged_has_account: boolean };
  blockers: string[];
  needs_override_reason: boolean;
};

export const driverMergeApi = {
  candidates(companyId: string) {
    return apiRequest<{ pairs: DuplicateCluster[] }>(withCompany("/api/v1/drivers/duplicate-candidates", companyId));
  },
  preview(companyId: string, survivorId: string, mergedId: string) {
    return apiRequest<MergePreview>(withCompany(`/api/v1/drivers/${survivorId}/merge-preview?merged_id=${mergedId}`, companyId));
  },
  merge(companyId: string, survivorId: string, mergedId: string, overrideReason?: string | null) {
    return apiRequest<{ ok: true; repointed: Array<{ ref: string; rows: number }>; history_kept: MergeReference[]; kept_on_survivor: string[] }>(
      withCompany(`/api/v1/drivers/${survivorId}/merge`, companyId),
      { method: "POST", body: { merged_id: mergedId, override_reason: overrideReason ?? null } }
    );
  },
};
