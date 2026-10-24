/**
 * ENGINE: stops of a load BOOKED AFTER ITS TRIP, stamped from the truck's own replayed fence visits (LEAD 443.335)
 * SCHEDULE: cron/load-stop-geofence-sync.cron.ts (4,19,34,49 * * * * America/Chicago), before the 443.279 final departures
 * WRITES: mdata.load_stops actual_arrival_* / actual_departure_* and the load status — ONLY through dispatch/stop-stamp.service.ts
 *         (stampStopArrival / stampStopDeparture: status module, revenue latch, settlement ping, proforma mint, audit)
 * IDEMPOTENCY: the stop engine's compare-and-set on actual_arrival_at / actual_departure_at IS NULL; a stamped stop is never revisited
 *
 * 13700 (T152, Laredo local) was entered on 10/22 19:11Z after the truck had already run it (pickup fence 10/20 20:10–23:30Z,
 * delivery fence 10/21 15:34–17:49Z). The load's stop fences are minted when it is booked, so the live detector never saw
 * those visits; geofence-events-backfill replayed them into geo.geofence_events but — correctly for a replay — wrote no stamp.
 * The load sat at 'dispatched' forever with zero stop stamps (verify-dispatched-load-has-stop-stamps red for every seat).
 *
 * Evidence rule (never an invented time): a stop is stamped only from an 'entered' event on THAT stop's own fence
 * ('load-<id>-stop-<n>'), by the load's assigned unit, that occurred BEFORE the fence existed (a replayed visit the live
 * detector could never see), within ±72 h of the stop's schedule; stops are walked in sequence and each visit must follow
 * the previous stop's departure. The first stop takes the visit closest to its appointment. Departure = the first 'exited'
 * on the same fence after that entry. No qualifying visit = nothing written for that stop or any later one.
 */
import { stampStopArrival, stampStopDeparture, type LockedStopRow } from "../dispatch/stop-stamp.service.js";
import { GEOFENCE_AUTO_DELIVERY_ACTOR } from "../dispatch/geofence-auto-delivery.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Statuses a load can hold once a truck is dispatched on it and before its final delivery departure. */
export const BOOKED_AFTER_TRIP_LOAD_STATUSES = ["dispatched", "at_pickup", "in_transit", "at_delivery"] as const;
export const FENCE_HISTORY_WINDOW_HOURS = 72;

export type HistoryStop = {
  stop_id: string;
  sequence_number: number;
  scheduled_at: string | null;
  actual_arrival_at: string | null;
  actual_departure_at: string | null;
  fence_created_at: string | null;
};
export type FenceVisitEvent = { sequence_number: number; event_kind: "entered" | "exited"; occurred_at: string };
export type StopStampPlan = { stop_id: string; sequence_number: number; arrive_at: string; depart_at: string | null };

const ms = (t: string) => new Date(t).getTime();

/** Pure: which stops the replayed fence visits prove, in order, and at what observed times. */
export function planStampsFromFenceHistory(
  stops: HistoryStop[],
  events: FenceVisitEvent[],
  windowHours = FENCE_HISTORY_WINDOW_HOURS
): StopStampPlan[] {
  const plan: StopStampPlan[] = [];
  const windowMs = windowHours * 3600_000;
  let cursor: number | null = null;
  for (const stop of [...stops].sort((a, b) => a.sequence_number - b.sequence_number)) {
    if (stop.actual_arrival_at) {
      const done = stop.actual_departure_at ?? null;
      if (!done) break; // an open stop: the live path owns what comes next
      cursor = ms(done);
      continue;
    }
    if (!stop.fence_created_at || !stop.scheduled_at) break;
    const fenceBorn = ms(stop.fence_created_at);
    const sched = ms(stop.scheduled_at);
    const entries: number[] = events
      .filter((e) => e.sequence_number === stop.sequence_number && e.event_kind === "entered")
      .map((e) => ms(e.occurred_at))
      .filter((t) => t < fenceBorn && Math.abs(t - sched) <= windowMs && (cursor === null || t > cursor));
    if (entries.length === 0) break;
    const entered: number = cursor === null
      ? entries.reduce((best, t) => (Math.abs(t - sched) < Math.abs(best - sched) ? t : best))
      : Math.min(...entries);
    const exits: number[] = events
      .filter((e) => e.sequence_number === stop.sequence_number && e.event_kind === "exited")
      .map((e) => ms(e.occurred_at))
      .filter((t) => t > entered);
    const exited: number | null = exits.length ? Math.min(...exits) : null;
    plan.push({
      stop_id: stop.stop_id,
      sequence_number: stop.sequence_number,
      arrive_at: new Date(entered).toISOString(),
      depart_at: exited === null ? null : new Date(exited).toISOString(),
    });
    if (exited === null) break;
    cursor = exited;
  }
  return plan;
}

export type BookedAfterTripLoad = { load_id: string; load_number: string; unit_id: string };
export type BookedAfterTripOutcome =
  | { load_number: string; outcome: "stamped"; stops: StopStampPlan[] }
  | { load_number: string; outcome: "no_evidence" }
  | { load_number: string; outcome: "refused"; detail: string; stamped_before_refusal: number };

/** Dispatched loads with an unstamped stop whose own fence holds a visit by the assigned unit from before the fence existed. */
export async function listLoadsBookedAfterTrip(client: DbClient, operatingCompanyId: string): Promise<BookedAfterTripLoad[]> {
  const r = await client.query<BookedAfterTripLoad>(
    `SELECT l.id::text AS load_id, l.load_number, l.assigned_unit_id::text AS unit_id
       FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL AND COALESCE(l.is_sample_data, false) = false
        AND l.status::text = ANY($2::text[])
        AND l.assigned_unit_id IS NOT NULL
        AND EXISTS (
              SELECT 1 FROM mdata.load_stops s
                JOIN geo.geofences g ON g.operating_company_id = l.operating_company_id
                                    AND g.label = 'load-' || l.id::text || '-stop-' || s.sequence_number::text
                JOIN geo.geofence_events e ON e.geofence_id = g.id AND e.operating_company_id = l.operating_company_id
                                          AND e.unit_id = l.assigned_unit_id AND e.event_kind = 'entered'
                                          AND e.occurred_at < g.created_at
               WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.actual_arrival_at IS NULL
                 AND COALESCE(s.status::text, '') <> 'cancelled')
      ORDER BY l.load_number`,
    [operatingCompanyId, [...BOOKED_AFTER_TRIP_LOAD_STATUSES]]
  );
  return r.rows;
}

async function lockStop(client: DbClient, operatingCompanyId: string, loadId: string, stopId: string) {
  return (
    await client.query<LockedStopRow & { status: string }>(
      `SELECT s.id::text, s.stop_type::text, COALESCE(s.status::text, 'pending') AS status, l.status::text AS load_status,
              l.operating_company_id::text AS operating_company_id
         FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
        WHERE s.id = $1::uuid AND s.load_id = $2::uuid AND l.operating_company_id = $3::uuid
          AND s.soft_deleted_at IS NULL AND l.soft_deleted_at IS NULL
        LIMIT 1
        FOR UPDATE OF s, l`,
      [stopId, loadId, operatingCompanyId]
    )
  ).rows[0];
}

/** Stamp one booked-after-trip load's proven stops through the stop engine (caller owns the transaction). */
export async function completeStopsFromFenceHistory(
  client: DbClient,
  operatingCompanyId: string,
  load: BookedAfterTripLoad
): Promise<BookedAfterTripOutcome> {
  const stops = (
    await client.query<HistoryStop>(
      `SELECT s.id::text AS stop_id, s.sequence_number,
              COALESCE(s.appointment_start_at, s.scheduled_arrival_at)::text AS scheduled_at,
              s.actual_arrival_at::text, s.actual_departure_at::text,
              (SELECT min(g.created_at) FROM geo.geofences g
                WHERE g.operating_company_id = $2::uuid AND g.label = 'load-' || s.load_id::text || '-stop-' || s.sequence_number::text)::text
                AS fence_created_at
         FROM mdata.load_stops s
        WHERE s.load_id = $1::uuid AND s.soft_deleted_at IS NULL AND COALESCE(s.status::text, '') <> 'cancelled'
        ORDER BY s.sequence_number`,
      [load.load_id, operatingCompanyId]
    )
  ).rows;
  const events = (
    await client.query<FenceVisitEvent>(
      `SELECT split_part(g.label, '-stop-', 2)::int AS sequence_number, e.event_kind, e.occurred_at::text
         FROM geo.geofence_events e
         JOIN geo.geofences g ON g.id = e.geofence_id
        WHERE e.operating_company_id = $2::uuid AND e.unit_id = $3::uuid
          AND g.operating_company_id = $2::uuid AND g.label LIKE 'load-' || $1::text || '-stop-%'
          AND e.event_kind IN ('entered', 'exited')
        ORDER BY e.occurred_at`,
      [load.load_id, operatingCompanyId, load.unit_id]
    )
  ).rows;
  const plan = planStampsFromFenceHistory(stops, events);
  if (plan.length === 0) return { load_number: load.load_number, outcome: "no_evidence" };
  let stamped = 0;
  for (const p of plan) {
    const arriveStop = await lockStop(client, operatingCompanyId, load.load_id, p.stop_id);
    if (!arriveStop) return { load_number: load.load_number, outcome: "refused", detail: `stop ${p.sequence_number} not found`, stamped_before_refusal: stamped };
    const arrived = await stampStopArrival(client as never, arriveStop, {
      loadId: load.load_id,
      actorUserId: GEOFENCE_AUTO_DELIVERY_ACTOR,
      source: "eld_geofence",
      auditEvent: "dispatch.stop.arrival_from_fence_history",
      at: p.arrive_at,
    });
    if (!arrived.ok) return { load_number: load.load_number, outcome: "refused", detail: `arrival ${p.sequence_number}: ${arrived.error}`, stamped_before_refusal: stamped };
    stamped += 1;
    if (!p.depart_at) break;
    const departStop = await lockStop(client, operatingCompanyId, load.load_id, p.stop_id);
    if (!departStop) return { load_number: load.load_number, outcome: "refused", detail: `stop ${p.sequence_number} vanished`, stamped_before_refusal: stamped };
    const departed = await stampStopDeparture(client as never, departStop, {
      loadId: load.load_id,
      actorUserId: GEOFENCE_AUTO_DELIVERY_ACTOR,
      source: "eld_geofence",
      auditEvent: "dispatch.stop.departure_from_fence_history",
      at: p.depart_at,
    });
    if (!departed.ok) return { load_number: load.load_number, outcome: "refused", detail: `departure ${p.sequence_number}: ${departed.error}`, stamped_before_refusal: stamped };
    stamped += 1;
  }
  return { load_number: load.load_number, outcome: "stamped", stops: plan };
}
