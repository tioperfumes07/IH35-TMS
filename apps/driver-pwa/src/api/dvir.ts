import type { DvirInspectionItem, DvirSubmission } from "@ih35/shared-types";
import { FMCSA_DVIR_ITEMS } from "@ih35/shared-types";
import { apiRequest } from "./client";
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
