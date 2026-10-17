/**
 * LEAD 443.192 (14:05Z) — OWNER LAW: "pay miles (Short) are NEVER filled from Google or historical (Google/historical are for
 * estimates, not pay miles); preview shows short only; refuse without short = CONFIRMED correct."
 *
 * LEAD RULING 15:10Z #2 — "Empty (deadhead) miles: Settlement Creator = the signed document's empty miles ONLY (document
 * decides pay); never auto-filled from the engine; blank when the document has none." (Book Load's own Google estimate at
 * booking stays allowed — that is the live-booking path, not the Creator.)
 *
 * The Settlement Creator drawer's two miles rules, kept here so they are one pure, tested place:
 *   1. fillEstimateMilesFromRecommendations — an EMPTY Practical ("Loaded mi (co)") field may take the mileage engine's
 *      recommended estimate (Historical / Google). It NEVER writes Short (pay) miles nor Empty (deadhead) miles: both are
 *      pay figures and come only from the signed settlement document or the operator's typing (Empty stays blank when the
 *      document prints none).
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

/** Fill only an EMPTY Practical estimate from the engine. Short (pay) and Empty (deadhead pay) miles are never filled. Same row when unchanged. */
export function fillEstimateMilesFromRecommendations<T extends MilesRow>(row: T, rec: MilesRecommendations | null | undefined): T {
  if (!rec) return row;
  let out = row;
  const practical = recommendedEstimate(rec, "practical");
  if (practical != null && !(out.loaded_miles != null && out.loaded_miles > 0)) {
    out = { ...out, loaded_miles: practical, line_haul_miles: practical };
  }
  return out;
}

/** Driver pay miles for the Creator preview / totals: the load's SHORT miles only (> 0), else null. Never loaded / practical. */
export function creatorDrawerPayMiles(load: Pick<MilesRow, "miles_shortest">): number | null {
  const miles = Number(load.miles_shortest ?? Number.NaN);
  return Number.isFinite(miles) && miles > 0 ? miles : null;
}
