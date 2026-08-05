import { apiRequest } from "../../../api/client";
import type { EntityScope, ScenarioTrackerResponse } from "./types";

/** Locked path (CC-1 matches): GET /api/v1/home/scenario-tracker */
export function scenarioTrackerUrl(entity: EntityScope): string {
  const q = new URLSearchParams();
  if (entity && entity !== "ALL") q.set("entity", entity);
  const qs = q.toString();
  return `/api/v1/home/scenario-tracker${qs ? `?${qs}` : ""}`;
}

export async function fetchScenarioTracker(
  entity: EntityScope,
  signal?: AbortSignal,
): Promise<ScenarioTrackerResponse> {
  return apiRequest<ScenarioTrackerResponse>(scenarioTrackerUrl(entity), { method: "GET", signal });
}
