import type { CycleEarnings } from "@ih35/shared-types";
import { apiRequest } from "./client";
export type { SettlementStatus, EarningsLoad, CycleEarnings } from "@ih35/shared-types";

export async function getMyCurrentCycle(): Promise<CycleEarnings> {
  return apiRequest<CycleEarnings>("/api/v1/driver/earnings/cycle");
}

export async function getMyPastCycles(): Promise<CycleEarnings[]> {
  return apiRequest<CycleEarnings[]>("/api/v1/driver/earnings/cycles?weeks=4");
}
