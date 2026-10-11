import { apiRequest } from "./client";

/**
 * 443.55 / 443.57 — CC-2's ONE mileage engine (backend apps/backend/src/dispatch/mileage/miles-recommendations.*): per miles
 * field, the HISTORICAL lane average and GOOGLE driving distance, each with its evidence. The Load screen and the Settlement
 * Creator both read it from here; neither computes miles on its own.
 */
export const MILES_FIELDS = ["practical", "short", "empty"] as const;
export type MilesField = (typeof MILES_FIELDS)[number];
export type MilesSource = "historical" | "google" | "manual" | "document";

export type MilesHistoricalRec = {
  value: number;
  n_loads: number;
  min: number | null;
  max: number | null;
  last_seen: string | null;
  confidence: string | null;
  autofill_allowed: boolean;
  untrustworthy_reason: string | null;
};
export type MilesFieldRec = {
  current: { value: number | null; source: MilesSource | null; chosen_by: string | null; chosen_at: string | null; reason: string | null } | null;
  historical: MilesHistoricalRec | null;
  historical_missing_reason: string | null;
  google: { value: number; fetched_at: string } | null;
  google_missing_reason: string | null;
  difference: number | null;
  default_source: "historical" | "google" | "document" | null;
};
export type MilesRecommendations = { load_id: string | null; fields: Record<MilesField, MilesFieldRec> };

export type MilesStopPoint = {
  latitude: number | null;
  longitude: number | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
};

/** Both recommendations for a stop sequence that is not booked yet (Book Load, Settlement Creator draft). Reads only. */
export function postMilesRecommendations(body: { operating_company_id: string; unit_id?: string | null; stops: MilesStopPoint[] }) {
  return apiRequest<MilesRecommendations>("/api/v1/mdata/miles-recommendations", { method: "POST", body });
}
