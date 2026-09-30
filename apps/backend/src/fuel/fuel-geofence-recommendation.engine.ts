/**
 * B-25 — fuel geofence recommendation engine (Lead order, docs/bus/NOW-CC-2.md ROUND 294).
 *
 * Owner, verbatim: "if samsara fails, in purchases of fuel we should input manually and
 * recommendation from the engine you created based on geofencing, dates, etc." Owner law B
 * (2026-09-12, same law the banking link-suggestion engine follows): "it should never
 * automatch, it suggests and we accept it or change the transactions." This module NEVER
 * writes anything — it is a pure function, no DB, no side effects — called by
 * fuel-geofence-recommendations.routes.ts's read-only GET handler. It never produces the fuel
 * purchase itself; the human still types gallons/price/total into the existing
 * POST /api/v1/fuel/transactions path (fuel-transactions.routes.ts), using this only to answer
 * "where and when."
 *
 * Distinct from (not a replacement for) telematics/fuel-stop-planner.service.ts's
 * recommendFuelStopsForRecommendation() — that engine is FORWARD-looking (where should the
 * truck stop for fuel along a planned route, driven by low-fuel/HOS windows). This engine is
 * BACKWARD-looking: reconstructing which fuel-stop geofence a unit was actually inside on a
 * given past date, for a human filling in a manual entry after Samsara's card feed failed.
 *
 * Source of evidence: geo.geofence_events (684+ rows, location_kind='fuel_stop'), which the
 * Lead named as "current and never died" — unlike Samsara's obdOdometerMeters, which has
 * returned NULL since 2026-09-10 (the odometer blackout, see the 2026-09-30 LEAD RETRACTION in
 * NOW-CC-2.md). Odometer is offered ONLY when telematics.vehicle_locations.odometer_mi is
 * non-null for that unit near the entry time (same nearest-time-join pattern CC-3's T-21
 * real-driven-miles.service.ts already uses against the same column) — when absent this engine
 * says so honestly ("no odometer reading"), never interpolates a number into gallons or MPG.
 */

export type FuelGeofenceWindowInput = {
  geofence_id: string;
  geofence_label: string;
  /** ISO timestamp of the 'entered' geo.geofence_events row. */
  entered_at: string;
  /** ISO timestamp of the paired 'exited' row for the SAME geofence, or null if none was found
   * within the lookahead window the caller queried — the unit may still be inside, or Samsara
   * dropped the exit event. Never fabricated by the caller. */
  exited_at: string | null;
  /** The load mdata.loads.assigned_unit_id had the unit assigned to at entered_at, derived from
   * a time-window overlap against that load's own pickup/delivery stops — NOT from
   * geo.geofence_state_transitions.load_id, which is 0/7,610 populated live (measured
   * 2026-09-30) and cannot be used as an evidence source today. */
  load_id: string | null;
  load_number: string | null;
  odometer_reading_mi: number | null;
  /** Non-null only when odometer_reading_mi is non-null; names where the reading came from. */
  odometer_captured_at: string | null;
};

export type FuelGeofenceConfidence = "high" | "medium" | "low";

export type FuelGeofenceRecommendation = {
  geofence_id: string;
  geofence_label: string;
  entered_at: string;
  exited_at: string | null;
  dwell_minutes: number | null;
  load_id: string | null;
  load_number: string | null;
  confidence: FuelGeofenceConfidence;
  /** Plain-words reason. Never omitted — an unexplained recommendation is exactly what owner
   * law B says never to ship (see the banking link-suggestion engine's identical rule). */
  reason: string;
  evidence_source: "geo.geofence_events";
  odometer_reading_mi: number | null;
  /** Always populated. "no odometer reading" when odometer_reading_mi is null — stated, never
   * silently omitted, and never interpolated into a derived number. */
  odometer_note: string;
};

const TYPICAL_DWELL_MIN_MINUTES = 3;
const TYPICAL_DWELL_MAX_MINUTES = 120;

function dwellMinutes(enteredAt: string, exitedAt: string | null): number | null {
  if (!exitedAt) return null;
  const ms = new Date(exitedAt).getTime() - new Date(enteredAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 60_000);
}

/** Score ONE candidate fuel-stop window. Confidence reflects how complete and how
 * fuel-stop-shaped the geofence evidence itself is (paired enter/exit, plausible dwell) — it is
 * deliberately NOT influenced by odometer availability, per the Lead's instruction that odometer
 * is offered as a separate fact, not a confidence input (odometer has been NULL for every unit
 * since 2026-09-10; making confidence depend on it would silently zero out every recommendation
 * during the exact window this feature exists to cover). */
export function scoreFuelGeofenceWindow(input: FuelGeofenceWindowInput): FuelGeofenceRecommendation {
  const dwell = dwellMinutes(input.entered_at, input.exited_at);
  let confidence: FuelGeofenceConfidence;
  let reason: string;

  if (input.exited_at === null) {
    confidence = "low";
    reason = `entered ${input.geofence_label} at ${input.entered_at}, no matching exit event found — the unit may still be inside, or Samsara dropped the exit`;
  } else if (dwell !== null && dwell >= TYPICAL_DWELL_MIN_MINUTES && dwell <= TYPICAL_DWELL_MAX_MINUTES) {
    confidence = "high";
    reason = `entered and exited ${input.geofence_label}, ${dwell} min dwell — typical for a fuel stop`;
  } else {
    confidence = "medium";
    reason = `entered and exited ${input.geofence_label}, ${dwell ?? "an unknown"} min dwell — outside the typical 3-120 min fuel-stop window, still a real visit worth checking`;
  }

  const odometerNote =
    input.odometer_reading_mi === null
      ? "no odometer reading"
      : `odometer ${input.odometer_reading_mi} mi, captured ${input.odometer_captured_at}`;

  return {
    geofence_id: input.geofence_id,
    geofence_label: input.geofence_label,
    entered_at: input.entered_at,
    exited_at: input.exited_at,
    dwell_minutes: dwell,
    load_id: input.load_id,
    load_number: input.load_number,
    confidence,
    reason,
    evidence_source: "geo.geofence_events",
    odometer_reading_mi: input.odometer_reading_mi,
    odometer_note: odometerNote,
  };
}

const CONFIDENCE_RANK: Record<FuelGeofenceConfidence, number> = { high: 0, medium: 1, low: 2 };

/** Score and rank every candidate window for a unit+date. Highest confidence first, most recent
 * entry first within a confidence tier — never pre-filtered by odometer presence or dwell length,
 * the human sees every real geofence visit and decides. */
export function rankFuelGeofenceRecommendations(
  windows: FuelGeofenceWindowInput[]
): FuelGeofenceRecommendation[] {
  return windows
    .map(scoreFuelGeofenceWindow)
    .sort((a, b) => {
      const rankDiff = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.entered_at).getTime() - new Date(a.entered_at).getTime();
    });
}
