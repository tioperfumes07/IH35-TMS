import type { DvirInspectionItem, DvirSubmission } from "@ih35/shared-types";
import { FMCSA_DVIR_ITEMS } from "@ih35/shared-types";
import { ApiError, apiRequest } from "./client";
export type { DvirStatus, DvirInspectionItemKey, DvirInspectionItem, DvirSubmission } from "@ih35/shared-types";
export { FMCSA_DVIR_ITEMS } from "@ih35/shared-types";

export function createEmptyInspectionItems(): DvirInspectionItem[] {
  return FMCSA_DVIR_ITEMS.map((key) => ({
    key,
    status: "pass",
    note: "",
    photo_keys: [],
  }));
}

export async function submitDvir(payload: DvirSubmission): Promise<{ success: boolean; oos_flag: boolean; dvir_submission_id: string }> {
  return apiRequest<{ success: boolean; oos_flag: boolean; dvir_submission_id: string }>("/api/v1/driver/dvir", {
    method: "POST",
    body: payload,
  });
}

export async function getLatestDvir(loadId: string, type: "pre_trip" | "post_trip"): Promise<(DvirSubmission & { id: string }) | null> {
  try {
    return await apiRequest<DvirSubmission & { id: string }>(`/api/v1/driver/dvir/${encodeURIComponent(loadId)}?type=${type}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
