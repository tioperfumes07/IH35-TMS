import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./client";

/**
 * 443.55 / 443.57 — CC-2's ONE mileage engine (backend apps/backend/src/dispatch/mileage/miles-recommendations.*): per miles
 * field, the HISTORICAL lane average and GOOGLE driving distance, each with its evidence. The Load screen and the Settlement
 * Creator both read it from here; neither computes miles on its own. Nothing is written to a load until a field is chosen.
 */
export const MILES_FIELDS = ["practical", "short", "empty"] as const;
export type MilesField = (typeof MILES_FIELDS)[number];
export type MilesSource = "historical" | "google" | "manual" | "document";

/** Display labels for the Load screen rows, in MILES_FIELDS order. */
export const MILES_FIELD_LABELS: ReadonlyArray<{ field: MilesField; label: string }> = [
  { field: "practical", label: "Practical" },
  { field: "short", label: "Short" },
  { field: "empty", label: "Empty / Deadhead" },
];

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

export type MilesChoiceInput = { field: MilesField; source: MilesSource; manual_value?: number; reason?: string };

/** What Book Load sends in its payload (`miles_choice`), one entry per field the dispatcher chose. */
export type MilesChoicePayload = Partial<Record<MilesField, { source: MilesSource; value: number; reason?: string }>>;

/** Both recommendations for a stop sequence that is not booked yet (Book Load, Settlement Creator draft). Reads only. */
export function postMilesRecommendations(body: { operating_company_id: string; unit_id?: string | null; stops: MilesStopPoint[] }) {
  return apiRequest<MilesRecommendations>("/api/v1/mdata/miles-recommendations", { method: "POST", body });
}

/** Book Load preview — same call as postMilesRecommendations. */
export const previewMilesRecommendations = postMilesRecommendations;

export function getLoadMilesRecommendations(loadId: string, operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<MilesRecommendations>(`/api/v1/mdata/loads/${loadId}/miles-recommendations?${q.toString()}`);
}

export function chooseLoadMiles(loadId: string, operatingCompanyId: string, body: MilesChoiceInput) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<MilesRecommendations>(`/api/v1/mdata/loads/${loadId}/miles-choice?${q.toString()}`, { method: "POST", body });
}

export function useLoadMilesRecommendations(loadId: string | null, operatingCompanyId: string | null | undefined) {
  return useQuery({
    queryKey: ["loads", "miles-recommendations", operatingCompanyId, loadId],
    queryFn: () => getLoadMilesRecommendations(loadId as string, operatingCompanyId as string),
    enabled: Boolean(loadId && operatingCompanyId),
  });
}

export function useChooseLoadMiles(loadId: string | null, operatingCompanyId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MilesChoiceInput) => chooseLoadMiles(loadId as string, operatingCompanyId as string, body),
    onSuccess: (data) => {
      qc.setQueryData(["loads", "miles-recommendations", operatingCompanyId, loadId], data);
      void qc.invalidateQueries({ queryKey: ["loads", "detail", operatingCompanyId, loadId] });
      void qc.invalidateQueries({ queryKey: ["loads", "audit"] });
    },
  });
}

/** The value a source stands for on one field (manual carries its own typed value). */
export function valueForSource(rec: MilesFieldRec, source: MilesSource): number | null {
  if (source === "historical") return rec.historical?.value ?? null;
  if (source === "google") return rec.google?.value ?? null;
  if (source === "document") return rec.current?.source === "document" ? rec.current.value : null;
  return null;
}
