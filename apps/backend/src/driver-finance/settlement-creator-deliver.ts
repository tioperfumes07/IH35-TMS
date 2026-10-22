/**
 * ROUND 443.3 / 443.7 / 443.16 — how the Settlement Creator delivers a load: every stop stamped from the truck's
 * tracked stop events (date only when none matches), then dispatch's ONE transition engine (dispatched -> in_transit -> delivered_pending_docs). Shared by the
 * seeder (each load is delivered right after it is booked, so the same truck can take the next load of the tour —
 * bookLoad refuses a unit still active on an undelivered load) and the post.
 */
import type { DbClient } from "../dispatch/presettlement-link.service.js";
import { transitionDispatchLoadInClientTx } from "../dispatch/load-transition.service.js";
import { fromMdataStatus } from "../dispatch/load-state-machine.js";
import { SettlementCreatorError } from "./settlement-creator-error.js";
import { DEFAULT_DEPART_RADIUS_M } from "../integrations/samsara/geofences/state-machine/states.js";
import { assertCanonicalSubset, DELIVERED_OR_LATER_STATUSES } from "../dispatch/canonical-active-load-set.js";

/** ROUND 443.16 — how one stop of a load was stamped (listed in the post result). */
export type StopStamp = {
  load_number: string;
  stop_id: string;
  sequence: number;
  stop_type: string;
  precision: "tracked" | "date_only" | "already_stamped";
  stop_event_id: string | null;
  arrival_at: string | null;
  departure_at: string | null;
  note: string;
};

/** The tracked stop must sit within the "still at the stop" radius the geofence engine uses (0.5 mile). */
export const STOP_MATCH_RADIUS_M = DEFAULT_DEPART_RADIUS_M;
/** USMCA's operating day (Laredo, Central time) — a stop "on the date" is judged in local time, not UTC. */
export const STOP_DAY_TIMEZONE = "America/Chicago";

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

/**
 * Lead 443.51 #3 — a stop the truck has left is 'departed' (mdata.stop_status_enum: pending, arrived, departed, cancelled),
 * exactly as the live engine writes it with the stamp (dispatch/stop-stamp.service.ts stampStopArrival 'arrived',
 * stampStopDeparture 'departed'). Every stop of the load that carries a departure stamp and still reads 'pending' or
 * 'arrived' moves to 'departed'; a stop with no departure stamp is left as it is (never a status without its evidence).
 */
export async function settleStampedStopStatuses(client: DbClient, loadId: string): Promise<number> {
  const r = await client.query<{ id: string }>(
    `UPDATE mdata.load_stops
        SET status = 'departed'::mdata.stop_status_enum, updated_at = now()
      WHERE load_id = $1::uuid AND soft_deleted_at IS NULL
        AND actual_departure_at IS NOT NULL
        AND status::text IN ('pending', 'arrived')
      RETURNING id::text`,
    [loadId],
  );
  return r.rows.length;
}

export async function stampStopsFromTracking(
  client: DbClient,
  loadId: string,
  operatingCompanyId: string,
  dates: { pickupDate?: string | null; deliveryDate?: string | null; stopDates?: Record<string, string> },
  /** LEAD 443.234 — LIVE loads (not a settled document): stamp ONLY a tracked stop event, never the date-only fallback, and never
   *  a stop whose day has not come (a date-only stamp on a live load would assert an arrival that may not have happened). */
  opts: { trackedOnly?: boolean } = {},
): Promise<StopStamp[]> {
  const load = (
    await client.query<{ load_number: string; unit_id: string | null; company_id: string }>(
      `SELECT load_number, assigned_unit_id::text AS unit_id, operating_company_id::text AS company_id
         FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [loadId, operatingCompanyId],
    )
  ).rows[0];
  if (!load) return [];
  const stops = (
    await client.query<{ id: string; sequence_number: number; stop_type: string; latitude: string | null; longitude: string | null; sched_day: string | null; stamped: boolean }>(
      `SELECT id::text, sequence_number, stop_type::text, latitude::text, longitude::text,
              -- LEAD 443.230: a stop booked with an appointment but no scheduled arrival (Book Load) is dated by its appointment.
              to_char((COALESCE(scheduled_arrival_at, appointment_start_at) AT TIME ZONE $2), 'YYYY-MM-DD') AS sched_day,
              (actual_arrival_at IS NOT NULL OR actual_departure_at IS NOT NULL) AS stamped
         FROM mdata.load_stops WHERE load_id = $1::uuid AND soft_deleted_at IS NULL ORDER BY sequence_number`,
      [loadId, STOP_DAY_TIMEZONE],
    )
  ).rows;
  const out: StopStamp[] = [];
  for (const st of stops) {
    // Lead 443.51 #4: a stop's own document date (e.g. the workbook date of a stop added to a multi-stop load) wins.
    const day =
      dates.stopDates?.[st.id] ? dates.stopDates[st.id]!
      : st.stop_type === "pickup" ? dates.pickupDate || st.sched_day
      : st.stop_type === "delivery" ? dates.deliveryDate || st.sched_day
      : st.sched_day || dates.deliveryDate || null;
    const base = { load_number: load.load_number, stop_id: st.id, sequence: st.sequence_number, stop_type: st.stop_type };
    if (st.stamped) {
      out.push({ ...base, precision: "already_stamped", stop_event_id: null, arrival_at: null, departure_at: null, note: "stop already carried an actual time — not overwritten" });
      continue;
    }
    // LEAD 443.238 (owner 10-22) — a stop served by the local YARD SHUTTLE (dispatch.load_shuttle_legs): the evidence is the
    // shuttle leg, not the line truck (which was never at the shipper). A leg tied to the shuttle unit's GPS stop event stamps
    // that event's times (tracked); a leg resting on the owner's ruling stamps the leg's date (date_only, source manual) — the
    // event is attested, its clock time is not invented. Applies in trackedOnly mode too: the leg IS the evidence.
    const shuttle = (
      await client.query<{ id: string; picked_up_at: string | null; dropped_at: string | null; stop_event_id: string | null; precision: string; evidence: string; started_at: string | null; ended_at: string | null }>(
        `SELECT sl.id::text, sl.picked_up_at::text, sl.dropped_at::text, sl.stop_event_id::text, sl.precision, sl.evidence,
                e.started_at::text, e.ended_at::text
           FROM dispatch.load_shuttle_legs sl
           LEFT JOIN telematics.unit_stop_events e ON e.id = sl.stop_event_id
          WHERE sl.load_id = $1::uuid AND sl.from_stop_id = $2::uuid AND sl.voided_at IS NULL
          LIMIT 1`,
        [loadId, st.id],
      )
    ).rows[0];
    if (shuttle) {
      const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
      if (shuttle.precision === "tracked" && shuttle.started_at) {
        const departed = shuttle.ended_at ?? shuttle.started_at;
        await client.query(
          `UPDATE mdata.load_stops
              SET actual_arrival_at = $2::timestamptz, actual_departure_at = $3::timestamptz,
                  actual_arrival_source = 'eld_geofence', actual_departure_source = 'eld_geofence',
                  actual_stop_event_id = $4::uuid, actual_stamp_precision = 'tracked', updated_at = now()
            WHERE id = $1::uuid AND actual_arrival_at IS NULL AND actual_departure_at IS NULL`,
          [st.id, shuttle.started_at, departed, shuttle.stop_event_id],
        );
        out.push({ ...base, precision: "tracked", stop_event_id: shuttle.stop_event_id, arrival_at: iso(shuttle.started_at), departure_at: iso(departed), note: `local yard shuttle (leg ${shuttle.id}) GPS stop event` });
      } else {
        const legDay = (shuttle.picked_up_at ?? "").slice(0, 10) || day;
        if (!legDay) {
          out.push({ ...base, precision: "date_only", stop_event_id: null, arrival_at: null, departure_at: null, note: `local yard shuttle (leg ${shuttle.id}) has no date — left unstamped` });
          continue;
        }
        await client.query(
          `UPDATE mdata.load_stops
              SET actual_arrival_at = ($2::date)::timestamp AT TIME ZONE $3, actual_departure_at = ($2::date)::timestamp AT TIME ZONE $3,
                  actual_arrival_source = 'manual', actual_departure_source = 'manual',
                  actual_stop_event_id = NULL, actual_stamp_precision = 'date_only', updated_at = now()
            WHERE id = $1::uuid AND actual_arrival_at IS NULL AND actual_departure_at IS NULL`,
          [st.id, legDay, STOP_DAY_TIMEZONE],
        );
        out.push({ ...base, precision: "date_only", stop_event_id: null, arrival_at: legDay, departure_at: legDay, note: `local yard shuttle (leg ${shuttle.id}, ${shuttle.evidence}) — date only` });
      }
      continue;
    }
    if (!day) {
      out.push({ ...base, precision: "date_only", stop_event_id: null, arrival_at: null, departure_at: null, note: "no date for this stop on the settlement — left unstamped" });
      continue;
    }
    if (opts.trackedOnly && day > new Date().toISOString().slice(0, 10)) {
      out.push({ ...base, precision: "date_only", stop_event_id: null, arrival_at: null, departure_at: null, note: `stop day ${day} has not come — left unstamped` });
      continue;
    }
    let reason = "";
    let pick: { id: string; started_at: string; ended_at: string | null; metres: number; candidates: number } | null = null;
    if (!load.unit_id) reason = "the load has no truck";
    else if (st.latitude == null || st.longitude == null) reason = "the stop has no coordinates";
    else {
      const cands = (
        await client.query<{ id: string; started_at: string; ended_at: string | null; metres: string }>(
          `WITH c AS (
             SELECT e.id::text, e.started_at, e.ended_at,
                    2 * 6371000 * asin(sqrt(
                      power(sin(radians((e.lat::float8 - $3::float8) / 2)), 2) +
                      cos(radians($3::float8)) * cos(radians(e.lat::float8)) * power(sin(radians((e.lng::float8 - $4::float8) / 2)), 2)
                    )) AS metres
               FROM telematics.unit_stop_events e
              WHERE e.operating_company_id = $1::uuid AND e.unit_id = $2::uuid
                AND e.lat IS NOT NULL AND e.lng IS NOT NULL
                AND (e.started_at AT TIME ZONE $6)::date <= $5::date
                AND (coalesce(e.ended_at, e.started_at) AT TIME ZONE $6)::date >= $5::date)
           SELECT id, started_at, ended_at, metres::text FROM c WHERE metres <= $7 ORDER BY metres, started_at`,
          [load.company_id, load.unit_id, Number(st.latitude), Number(st.longitude), day, STOP_DAY_TIMEZONE, STOP_MATCH_RADIUS_M],
        )
      ).rows;
      if (cands.length) pick = { ...cands[0]!, metres: Number(cands[0]!.metres), candidates: cands.length };
      else reason = `no stop event of the truck within ${STOP_MATCH_RADIUS_M} m on ${day}`;
    }
    if (pick) {
      const departed = pick.ended_at ?? pick.started_at;
      const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
      await client.query(
        `UPDATE mdata.load_stops
            SET actual_arrival_at = $2::timestamptz, actual_departure_at = $3::timestamptz,
                actual_arrival_source = 'eld_geofence', actual_departure_source = 'eld_geofence',
                actual_stop_event_id = $4::uuid, actual_stamp_precision = 'tracked', updated_at = now()
          WHERE id = $1::uuid AND actual_arrival_at IS NULL AND actual_departure_at IS NULL`,
        [st.id, pick.started_at, departed, pick.id],
      );
      out.push({
        ...base, precision: "tracked", stop_event_id: pick.id, arrival_at: iso(pick.started_at), departure_at: iso(departed),
        note: pick.candidates > 1 ? `nearest of ${pick.candidates} stop events (${Math.round(pick.metres)} m)` : `stop event ${Math.round(pick.metres)} m from the stop`,
      });
    } else if (opts.trackedOnly) {
      out.push({ ...base, precision: "date_only", stop_event_id: null, arrival_at: null, departure_at: null, note: `no tracked evidence — ${reason}; left unstamped (live load)` });
    } else {
      await client.query(
        `UPDATE mdata.load_stops
            SET actual_arrival_at = ($2::date)::timestamp AT TIME ZONE $3, actual_departure_at = ($2::date)::timestamp AT TIME ZONE $3,
                actual_arrival_source = 'manual', actual_departure_source = 'manual',
                actual_stop_event_id = NULL, actual_stamp_precision = 'date_only', updated_at = now()
          WHERE id = $1::uuid AND actual_arrival_at IS NULL AND actual_departure_at IS NULL`,
        [st.id, day, STOP_DAY_TIMEZONE],
      );
      out.push({ ...base, precision: "date_only", stop_event_id: null, arrival_at: day, departure_at: day, note: `date only — ${reason}` });
    }
  }
  await settleStampedStopStatuses(client, loadId);
  return out;
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
