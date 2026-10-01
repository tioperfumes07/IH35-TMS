/**
 * ROUND 306 E-20 — the Relay daily tick's date window, gap-aware.
 *
 * Measured 2026-10-01: the TRANSPORTATION entity's RELAY_FUEL_INGEST_ENABLED override was switched
 * OFF on 2026-09-28 04:32 UTC; every USMCA truck fill on that Relay account stopped arriving the
 * same day. The tick only ever asked for "yesterday", so turning the flag back on would recover
 * nothing between the outage and the day before — those fills would be lost for good. And Relay
 * publishes some fills a day or more after the pump, which a yesterday-only window also misses.
 *
 * The window now resumes from the last day this company's tick actually covered, re-reads a short
 * overlap for late-published fills, and never reaches back further than a cap. Re-reading is safe:
 * the ingest upserts on (operating_company_id, transaction_id).
 */

export const RELAY_INGEST_OVERLAP_DAYS = 3;
export const RELAY_INGEST_MAX_CATCHUP_DAYS = 30;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type IngestWindow = { startDate: string; endDate: string; reason: string };

/** Pure. `lastCoveredEnd` = the end_date of this company's last SUCCESSFUL tick, or null. */
export function computeRelayIngestWindow(
  lastCoveredEnd: string | null,
  yesterday: string,
  opts: { overlapDays?: number; maxCatchupDays?: number } = {}
): IngestWindow {
  const overlap = opts.overlapDays ?? RELAY_INGEST_OVERLAP_DAYS;
  const cap = opts.maxCatchupDays ?? RELAY_INGEST_MAX_CATCHUP_DAYS;
  const overlapStart = addDays(yesterday, -(overlap - 1));
  const floor = addDays(yesterday, -(cap - 1));
  if (lastCoveredEnd === null) {
    return { startDate: overlapStart, endDate: yesterday, reason: `no prior successful tick — last ${overlap} days` };
  }
  const resume = addDays(lastCoveredEnd, 1);
  let start = resume < overlapStart ? resume : overlapStart;
  let reason = resume < overlapStart ? `catching up from ${resume} (last covered ${lastCoveredEnd})` : `last ${overlap} days (late-published fills)`;
  if (start < floor) {
    start = floor;
    reason = `gap since ${lastCoveredEnd} exceeds ${cap} days — capped at ${floor}; older days need the explicit backfill`;
  }
  return { startDate: start, endDate: yesterday, reason };
}
