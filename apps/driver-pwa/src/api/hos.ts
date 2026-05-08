import type { HosSnapshot } from "@ih35/shared-types";
import { apiRequest } from "./client";
export type { DriverHosStatus, DutyStatus, HosClock, HosSnapshot } from "@ih35/shared-types";

export async function getMyHosClocks(): Promise<HosSnapshot> {
  return apiRequest<HosSnapshot>("/api/v1/driver/hos");
}
