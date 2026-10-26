/**
 * ROUND 443.3 / 443.7 / 443.16 — how the Settlement Creator delivers a load: every stop stamped from the truck's
 * tracked stop events (date only when none matches), then dispatch's ONE transition engine (dispatched -> in_transit -> delivered_pending_docs). Shared by the
 * seeder (each load is delivered right after it is booked, so the same truck can take the next load of the tour —
 * bookLoad refuses a unit still active on an undelivered load) and the post.
 */
import { notVoided } from "../accounting/live-document-predicates.sql.js";
import type { DbClient } from "../dispatch/presettlement-link.service.js";
import { transitionDispatchLoadInClientTx } from "../dispatch/load-transition.service.js";
import { fromMdataStatus } from "../dispatch/load-state-machine.js";
import { SettlementCreatorError } from "./settlement-creator-error.js";
import { DEFAULT_DEPART_RADIUS_M } from "../integrations/samsara/geofences/state-machine/states.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { assertCanonicalSubset, DELIVERED_OR_LATER_STATUSES } from "../dispatch/canonical-active-load-set.js";
import { STOP_MATCH_RADIUS_M, STOP_DAY_TIMEZONE } from "./stop-evidence-from-tracking.js";
export { STOP_MATCH_RADIUS_M, STOP_DAY_TIMEZONE, settleStampedStopStatuses, stampStopsFromTracking } from "./stop-evidence-from-tracking.js";
export type { StopStamp } from "./stop-evidence-from-tracking.js";

/**
 * ROUND 443.16 — STOP ARRIVAL / DEPARTURE COME FROM THE TRACKING DATA (owner 2026-10-10: "we also already have the
 * tracking data, geofences, locations"). For every stop of the load: the load's truck's stop event
 * (telematics.unit_stop_events) at the stop's coordinates (within STOP_MATCH_RADIUS_M) on the stop's date. Found ->
 * actual_arrival_at = started_at, actual_departure_at = ended_at, source eld_geofence, precision 'tracked', linked by
 * actual_stop_event_id (the event carries odometer, geofence, load_id_at_time). Several -> the nearest, and the result
 * says so. None -> the document date, precision 'date_only', source manual — never an invented clock time presented as
 * measured. A stamp already on the stop is never overwritten. No GPS row is created, edited or deleted.
 */
/**
 * The start of a calendar day in USMCA's operating timezone, as an ISO instant (DST-correct). A settlement gives a date,
 * not a clock time: this is the honest date-only instant — never an invented hour.
 */
export function localDayStartIso(day: string, timeZone = STOP_DAY_TIMEZONE): string {
  const probe = new Date(`${day}T12:00:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(probe)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(parts.timeZoneName ?? "");
  const offset = m ? `${m[1]}${m[2]}:${m[3]}` : "+00:00";
  return new Date(`${day}T00:00:00${offset}`).toISOString();
}

/** The forward path from a dispatched load to delivered in dispatch's state machine (load-state-machine.ts forwardTransitions). */
const CREATOR_DELIVERY_PATH = ["dispatched", "in_transit", "delivered_pending_docs"] as const;
assertCanonicalSubset("CREATOR_DELIVERY_PATH", CREATOR_DELIVERY_PATH);
const ALREADY_DELIVERED = new Set<string>(DELIVERED_OR_LATER_STATUSES);

export async function deliverLoadThroughDispatch(
  client: DbClient,
  actorUserId: string,
  operatingCompanyId: string,
  loadId: string,
  deliveryDate: string | null | undefined,
  transition: typeof transitionDispatchLoadInClientTx = transitionDispatchLoadInClientTx,
): Promise<void> {
  // ROUND 443.16 — the delivery time is the delivery stop's stamped departure (tracked, or the date-only instant).
  const stamped = (
    await client.query<{ at: Date | string | null }>(
      `SELECT max(actual_departure_at) AS at FROM mdata.load_stops WHERE load_id = $1::uuid AND stop_type = 'delivery' AND soft_deleted_at IS NULL`,
      [loadId],
    )
  ).rows[0]?.at;
  const deliveredAt = stamped ? new Date(stamped).toISOString() : deliveryDate ? localDayStartIso(deliveryDate) : null;
  for (let guard = 0; guard < CREATOR_DELIVERY_PATH.length; guard++) {
    const cur = String(
      (await client.query<{ status: string }>(
        `SELECT status::text AS status FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [loadId, operatingCompanyId],
      )).rows[0]?.status ?? "",
    );
    if (ALREADY_DELIVERED.has(cur)) return;
    const bucket = fromMdataStatus(cur);
    if (bucket === "delivered_pending_docs" || bucket === "completed_docs_received") return;
    const at = CREATOR_DELIVERY_PATH.indexOf(bucket as (typeof CREATOR_DELIVERY_PATH)[number]);
    if (at < 0) {
      throw new SettlementCreatorError("load_not_deliverable", `Load ${loadId}: status '${cur}' cannot be moved to delivered.`);
    }
    const next = CREATOR_DELIVERY_PATH[at + 1]!;
    const result = (await transition(client as never, actorUserId, operatingCompanyId, loadId, {
      new_status: next as never,
      reason: "Settlement Creator: delivered per the signed settlement",
      delivered_at: next === "delivered_pending_docs" ? deliveredAt : null,
    })) as { error?: string } | null | undefined;
    if (!result || result.error) {
      throw new SettlementCreatorError("load_delivery_refused", `Load ${loadId}: dispatch refused ${cur} -> ${next}: ${result?.error ?? "load not found"}`);
    }
  }
}
