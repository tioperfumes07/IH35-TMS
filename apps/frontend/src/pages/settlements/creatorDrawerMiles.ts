/**
 * LEAD 443.192 (14:05Z) — OWNER LAW: "pay miles (Short) are NEVER filled from Google or historical (Google/historical are for
 * estimates, not pay miles); preview shows short only; refuse without short = CONFIRMED correct."
 *
 * The Settlement Creator drawer's two miles rules, kept here so they are one pure, tested place:
 *   1. fillEstimateMilesFromRecommendations — an EMPTY Practical ("Loaded mi (co)") / Empty field may take the mileage
 *      engine's recommended estimate (Historical / Google). The Short (pay) field is NEVER written by it: Short miles come
 *      only from the settlement document or the operator's typing.
 *   2. creatorDrawerPayMiles — the live preview / totals price loaded pay on SHORT miles only, never loaded / practical
 *      miles. No short miles = null (the drawer shows "—" and the backend preview refuses: short_miles_required).
 * Mirrors the backend rule in apps/backend/src/driver-finance/settlement-creator-empty-pay.ts (creatorPayMiles).
 */
import type { MilesField, MilesRecommendations } from "../../api/milesRecommendations";

type MilesRow = {
  loaded_miles?: number | null;
  line_haul_miles?: number | null;
  miles_shortest?: number | null;
  empty_miles?: number | null;
};

/** The engine's recommended ESTIMATE for one field (Historical when its confidence allows, else Google), or null. */
function recommendedEstimate(rec: MilesRecommendations, f: MilesField): number | null {
  const r = rec.fields[f];
  if (!r) return null;
  if (r.default_source === "historical") return r.historical?.value ?? null;
  if (r.default_source === "google") return r.google?.value ?? null;
  return null;
}

/** Fill only EMPTY estimate fields (Practical, Empty) from the engine. Short (pay) miles are never filled. Same row when unchanged. */
export function fillEstimateMilesFromRecommendations<T extends MilesRow>(row: T, rec: MilesRecommendations | null | undefined): T {
  if (!rec) return row;
  let out = row;
  const practical = recommendedEstimate(rec, "practical");
  if (practical != null && !(out.loaded_miles != null && out.loaded_miles > 0)) {
    out = { ...out, loaded_miles: practical, line_haul_miles: practical };
  }
  const empty = recommendedEstimate(rec, "empty");
  if (empty != null && !(out.empty_miles != null && out.empty_miles > 0)) {
    out = { ...out, empty_miles: empty };
  }
  return out;
}

/** Driver pay miles for the Creator preview / totals: the load's SHORT miles only (> 0), else null. Never loaded / practical. */
export function creatorDrawerPayMiles(load: Pick<MilesRow, "miles_shortest">): number | null {
  const miles = Number(load.miles_shortest ?? Number.NaN);
  return Number.isFinite(miles) && miles > 0 ? miles : null;
}
