/**
 * LEAD 443.238 (owner ruling 10-22 11:23 AM CT) — THE writer of dispatch.load_shuttle_legs: the local yard-shuttle leg of a load
 * (a local driver in a local truck took the load from the shipper to our yard; the line truck took it from the yard).
 *
 * Evidence, best first: the shuttle unit's own GPS stop event at the pickup stop (within STOP_MATCH_RADIUS_M, ±3 days of the
 * stop's date) → precision 'tracked'; else the owner's ruling → precision 'date_only' (the stop's day — never an invented clock
 * time). When the owner names several possible trucks, every candidate's stop events are searched; the leg records the unit that
 * was actually there, or the candidates when none was. Then the stop-evidence engine stamps the pickup from the leg.
 * Never a pay line (the local driver is salaried weekly — Rafael rule). Audited. One live leg per pickup stop.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { stampStopsFromTracking, STOP_MATCH_RADIUS_M, STOP_DAY_TIMEZONE } from "../driver-finance/settlement-creator-deliver.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export class LoadShuttleLegError extends Error {
  constructor(public code: string, message: string, public status = 409) {
    super(message);
  }
}

export type RecordShuttleLegInput = {
  operatingCompanyId: string;
  loadId: string;
  /** the pickup stop the shuttle served (defaults to the load's first pickup) */
  fromStopId?: string | null;
  /** candidate local units by unit number (owner: "T120, T122 or T124"); one when known */
  unitNumbers: readonly string[];
  driverId?: string | null;
  evidence: "owner_ruling" | "driver_report";
  note: string;
  actorUserId: string;
};

export async function recordLoadShuttleLeg(client: DbClient, input: RecordShuttleLegInput) {
  if (!input.note.trim()) throw new LoadShuttleLegError("SHUTTLE_REASON_REQUIRED", "Say who reported the shuttle (owner ruling / driver report).", 400);
  if (!input.unitNumbers.length) throw new LoadShuttleLegError("SHUTTLE_UNIT_REQUIRED", "Name the local truck (or the possible trucks).", 400);
  const stop = (await client.query<{ id: string; latitude: string | null; longitude: string | null; day: string | null; load_number: string }>(
    `SELECT s.id::text, s.latitude::text, s.longitude::text, l.load_number,
            to_char((COALESCE(s.scheduled_arrival_at, s.appointment_start_at) AT TIME ZONE $4), 'YYYY-MM-DD') AS day
       FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
      WHERE s.load_id = $1::uuid AND l.operating_company_id = $2::uuid AND s.soft_deleted_at IS NULL AND l.voided_at IS NULL
        AND s.stop_type::text = 'pickup' AND ($3::uuid IS NULL OR s.id = $3::uuid)
      ORDER BY s.sequence_number LIMIT 1`,
    [input.loadId, input.operatingCompanyId, input.fromStopId ?? null, STOP_DAY_TIMEZONE]
  )).rows[0];
  if (!stop) throw new LoadShuttleLegError("SHUTTLE_PICKUP_NOT_FOUND", "That pickup stop is not on this load.", 404);
  const units = (await client.query<{ id: string; unit_number: string }>(
    `SELECT id::text, unit_number FROM mdata.units
      WHERE unit_number = ANY($1::text[]) AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid`, // a named candidate may be a since-deactivated truck
    [input.unitNumbers, input.operatingCompanyId]
  )).rows;
  if (units.length !== new Set(input.unitNumbers).size)
    throw new LoadShuttleLegError("SHUTTLE_UNIT_NOT_FOUND", `Unknown truck(s): ${input.unitNumbers.filter((n) => !units.some((u) => u.unit_number === n)).join(", ")}`, 400);

  // The shuttle unit's own GPS stop event at the shipper, ±3 days of the stop's date (nearest wins).
  let event: { id: string; unit_id: string; started_at: string; ended_at: string | null; metres: number } | null = null;
  if (stop.latitude != null && stop.longitude != null && stop.day) {
    event = (await client.query<{ id: string; unit_id: string; started_at: string; ended_at: string | null; metres: number }>(
      `SELECT e.id::text, e.unit_id::text, e.started_at::text, e.ended_at::text,
              2 * 6371000 * asin(sqrt(power(sin(radians((e.lat::float8 - $3::float8) / 2)), 2) +
                cos(radians($3::float8)) * cos(radians(e.lat::float8)) * power(sin(radians((e.lng::float8 - $4::float8) / 2)), 2))) AS metres
         FROM telematics.unit_stop_events e
        WHERE e.operating_company_id = $1::uuid AND e.unit_id = ANY($2::uuid[]) AND e.lat IS NOT NULL
          AND (e.started_at AT TIME ZONE $6)::date BETWEEN $5::date - 3 AND $5::date + 3
        ORDER BY metres, e.started_at LIMIT 1`,
      [input.operatingCompanyId, units.map((u) => u.id), Number(stop.latitude), Number(stop.longitude), stop.day, STOP_DAY_TIMEZONE]
    )).rows.find((r) => Number(r.metres) <= STOP_MATCH_RADIUS_M) ?? null;
  }
  const unitId = event?.unit_id ?? (units.length === 1 ? units[0]!.id : null);
  const leg = (await client.query<{ id: string }>(
    `INSERT INTO dispatch.load_shuttle_legs
       (operating_company_id, load_id, from_stop_id, unit_id, driver_id, candidate_unit_numbers, picked_up_at, dropped_at,
        evidence, stop_event_id, precision, note, created_by_user_id)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::text[], $7::timestamptz, $8::timestamptz, $9, $10::uuid, $11, $12, $13::uuid)
     RETURNING id::text`,
    [
      input.operatingCompanyId, input.loadId, stop.id, unitId, input.driverId ?? null,
      unitId ? null : [...input.unitNumbers],
      event ? event.started_at : stop.day ? `${stop.day}T12:00:00Z` : null,
      event ? event.ended_at ?? event.started_at : null,
      event ? "gps_stop_event" : input.evidence, event?.id ?? null, event ? "tracked" : "date_only", input.note.trim(), input.actorUserId,
    ]
  )).rows[0]!;
  await appendCrudAudit(client as never, input.actorUserId, "dispatch.load.shuttle_leg_recorded", {
    resource_type: "dispatch.load_shuttle_legs", resource_id: leg.id, operating_company_id: input.operatingCompanyId,
    load_id: input.loadId, load_number: stop.load_number, from_stop_id: stop.id, unit_id: unitId, candidates: input.unitNumbers,
    evidence: event ? "gps_stop_event" : input.evidence, precision: event ? "tracked" : "date_only",
    stop_event_metres: event ? Math.round(Number(event.metres)) : null, note: input.note.trim(),
  });
  const stamps = await stampStopsFromTracking(client as never, input.loadId, input.operatingCompanyId, {}, { trackedOnly: true });
  return { shuttle_leg_id: leg.id, precision: event ? "tracked" : "date_only", unit_id: unitId, stamps };
}

/** The load's live shuttle legs, for the load drawer / trip / driver history. */
export async function listLoadShuttleLegs(client: DbClient, operatingCompanyId: string, loadId: string) {
  return (await client.query(
    `SELECT sl.id::text, sl.from_stop_id::text, s.city AS from_city, s.state AS from_state, sl.dropped_at_place,
            u.unit_number, sl.candidate_unit_numbers, sl.driver_id::text,
            mdata.resolve_driver_label_same_company(sl.driver_id, sl.operating_company_id) AS driver_name,
            sl.picked_up_at, sl.dropped_at, sl.evidence, sl.precision, sl.note, sl.created_at
       FROM dispatch.load_shuttle_legs sl
       JOIN mdata.load_stops s ON s.id = sl.from_stop_id
       LEFT JOIN mdata.units u ON u.id = sl.unit_id
                             AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = sl.operating_company_id
      WHERE sl.operating_company_id = $1::uuid AND sl.load_id = $2::uuid AND sl.voided_at IS NULL
      ORDER BY sl.created_at`,
    [operatingCompanyId, loadId]
  )).rows;
}
