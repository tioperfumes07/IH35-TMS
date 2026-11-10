/**
 * CAPACITY ENGINE — where and when each in-service truck is free (owner 10-26: "showing the available trucks in which city
 * and the date it is free"; owner 11-10 accepted the Lead recommendation: ONE engine, two outputs — offer email + load board).
 *
 * Per unit passing THE in-service gate (UNIT_IN_SERVICE_SQL):
 *   • the LAST load in the unit's open dispatch chain (canonicalDispatchWorkWhereClause — a truck can carry loads booked in
 *     advance) decides it: available city/state = that load's final delivery stop; available_at = the final stop's actual
 *     departure ('actual') → appointment end ('appointment') → scheduled arrival ('scheduled');
 *   • no open load → available now at the truck's latest GPS position ('gps').
 * Unknown pieces stay NULL with a reason — never guessed, never zero. Recomputed on every read, so a booking, cancel or stop
 * stamp changes the next read automatically.
 */
import { canonicalDispatchWorkWhereClause, canonicalHappenedNotVoidedLoadClause, canonicalRealLoadRowClause } from "../canonical-active-load-set.js";
import { UNIT_IN_SERVICE_SQL } from "../unit-in-service.js";
import { unitOpenVdaDriverLateralSql } from "../unit-current-driver.js";

export type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type CapacitySource = "actual" | "appointment" | "scheduled" | "gps";

export type CapacityRow = {
  unit_id: string;
  unit_number: string;
  driver_name: string | null;
  equipment: string | null;
  equipment_source: "next_load" | "last_load" | null;
  available_city: string | null;
  available_state: string | null;
  available_at: string | null;
  source: CapacitySource | null;
  /** Why something is unknown (NULL fields) — shown on screen; a unit with a reason is never offered. */
  reason: string | null;
  last_load_id: string | null;
  last_load_number: string | null;
  open_load_count: number;
  offer_enabled: boolean;
  off_reason_code: string | null;
  /** True only when every piece needed for an offer is known and the unit's offer is on. */
  offerable: boolean;
};

export type CapacityRawRow = {
  unit_id: string; unit_number: string;
  load_id: string | null; load_number: string | null; open_load_count: string | number | null;
  load_trailer_type: string | null; last_trailer_type: string | null;
  driver_name: string | null;
  stop_city: string | null; stop_state: string | null;
  stop_actual_departure_at: string | null; stop_appointment_end_at: string | null; stop_scheduled_arrival_at: string | null;
  gps_city: string | null; gps_state: string | null; gps_captured_at: string | null;
  offer_enabled: boolean | null; off_reason_code: string | null;
};

/** One row per in-service unit. $1 = operating company. */
export const CAPACITY_SQL = `
  SELECT u.id::text AS unit_id, u.unit_number,
         chain.load_id, chain.load_number, chain.open_load_count,
         chain.trailer_type AS load_trailer_type, prev.trailer_type AS last_trailer_type,
         NULLIF(initcap(lower(CONCAT_WS(' ', d.first_name, d.last_name))), '') AS driver_name,
         COALESCE(NULLIF(fs.city, ''), loc.city) AS stop_city, COALESCE(NULLIF(fs.state, ''), loc.state) AS stop_state,
         fs.actual_departure_at::text AS stop_actual_departure_at,
         fs.appointment_end_at::text AS stop_appointment_end_at,
         fs.scheduled_arrival_at::text AS stop_scheduled_arrival_at,
         vp.city AS gps_city, vp.state AS gps_state, vp.captured_at::text AS gps_captured_at,
         cuo.offer_enabled, cuo.off_reason_code
    FROM mdata.units u
    LEFT JOIN LATERAL (
      SELECT l.id AS load_uuid, l.id::text AS load_id, l.load_number, l.trailer_type, l.assigned_primary_driver_id,
             count(*) OVER () AS open_load_count
        FROM mdata.loads l
        LEFT JOIN LATERAL (
          SELECT s.appointment_end_at, s.scheduled_arrival_at
            FROM mdata.load_stops s
           WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL
           ORDER BY s.sequence_number DESC LIMIT 1
        ) last_stop ON true
       WHERE l.assigned_unit_id = u.id
         AND ${canonicalDispatchWorkWhereClause("l", "$1::uuid")}
         AND ${canonicalRealLoadRowClause("l")}
       ORDER BY COALESCE(last_stop.appointment_end_at, last_stop.scheduled_arrival_at) DESC NULLS LAST, l.created_at DESC
       LIMIT 1
    ) chain ON true
    LEFT JOIN LATERAL (
      SELECT s.* FROM mdata.load_stops s
       WHERE s.load_id = chain.load_uuid AND s.soft_deleted_at IS NULL
       ORDER BY s.sequence_number DESC LIMIT 1
    ) fs ON true
    LEFT JOIN mdata.locations loc ON loc.id = fs.location_id AND loc.operating_company_id = $1::uuid
    LEFT JOIN LATERAL (
      SELECT l.trailer_type FROM mdata.loads l
       WHERE l.assigned_unit_id = u.id AND l.operating_company_id = $1::uuid
         AND ${canonicalHappenedNotVoidedLoadClause("l")} AND ${canonicalRealLoadRowClause("l")}
         AND NULLIF(l.trailer_type, '') IS NOT NULL
       ORDER BY l.created_at DESC LIMIT 1
    ) prev ON true
    ${unitOpenVdaDriverLateralSql("u", "$1::uuid")}
    LEFT JOIN mdata.drivers d
      ON d.id = COALESCE(chain.assigned_primary_driver_id, unit_vda.driver_id, u.assigned_driver_id)
     AND d.operating_company_id = $1::uuid
    LEFT JOIN telematics.vehicle_latest_position vp ON vp.unit_id = u.id AND vp.operating_company_id = $1::uuid
    LEFT JOIN dispatch.capacity_unit_offers cuo ON cuo.unit_id = u.id AND cuo.operating_company_id = $1::uuid
   WHERE ${UNIT_IN_SERVICE_SQL}
   ORDER BY u.unit_number
`;

const EQUIPMENT_LABELS: Readonly<Record<string, string>> = {
  dry_van: "Dry Van", refrigerated_van: "Reefer", reefer: "Reefer", flatbed: "Flatbed", step_deck: "Step Deck",
  stepdeck: "Step Deck", lowboy: "Lowboy", power_only_no_trailer: "Power Only", power_only_customer_trailer: "Power Only",
};

export function equipmentLabel(code: string | null | undefined): string | null {
  const c = String(code ?? "").trim().toLowerCase();
  if (!c) return null;
  return EQUIPMENT_LABELS[c] ?? c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Pure: one raw SQL row → the capacity row. Exported for tests and the guard. */
/** A GPS fix older than this cannot say where a truck is "now" — the truck is shown but not offered. */
export const GPS_STALE_HOURS = 48;

export function toCapacityRow(r: CapacityRawRow, now: Date = new Date()): CapacityRow {
  const reasons: string[] = [];
  let city: string | null = null;
  let state: string | null = null;
  let at: string | null = null;
  let source: CapacitySource | null = null;

  if (r.load_id) {
    city = r.stop_city?.trim() || null;
    state = r.stop_state?.trim() || null;
    if (r.stop_actual_departure_at) { at = r.stop_actual_departure_at; source = "actual"; }
    else if (r.stop_appointment_end_at) { at = r.stop_appointment_end_at; source = "appointment"; }
    else if (r.stop_scheduled_arrival_at) { at = r.stop_scheduled_arrival_at; source = "scheduled"; }
    else reasons.push(`load ${r.load_number ?? r.load_id}: final delivery stop has no appointment or scheduled time`);
    if (!city || !state) reasons.push(`load ${r.load_number ?? r.load_id}: final delivery stop has no city/state`);
  } else {
    city = r.gps_city?.trim() || null;
    state = r.gps_state?.trim() || null;
    if (r.gps_captured_at) { at = r.gps_captured_at; source = "gps"; }
    if (!r.gps_captured_at) reasons.push("no open load and no GPS position");
    else if (!city || !state) reasons.push("no open load and the GPS position has no city/state");
    else {
      const ageHours = (now.getTime() - new Date(r.gps_captured_at).getTime()) / 3_600_000;
      if (ageHours > GPS_STALE_HOURS) reasons.push(`last GPS position is ${Math.floor(ageHours / 24)} days old`);
    }
  }

  const nextEquip = equipmentLabel(r.load_trailer_type);
  const lastEquip = equipmentLabel(r.last_trailer_type);
  const equipment = nextEquip ?? lastEquip;
  const equipmentSource = nextEquip ? "next_load" : lastEquip ? "last_load" : null;
  if (!equipment) reasons.push("no trailer type on any load of this truck");

  const offerEnabled = r.offer_enabled ?? true;
  const reason = reasons.length ? reasons.join("; ") : null;
  return {
    unit_id: r.unit_id,
    unit_number: r.unit_number,
    driver_name: r.driver_name,
    equipment,
    equipment_source: equipmentSource,
    available_city: city,
    available_state: state,
    available_at: at,
    source,
    reason,
    last_load_id: r.load_id,
    last_load_number: r.load_number,
    open_load_count: Number(r.open_load_count ?? 0),
    offer_enabled: offerEnabled,
    off_reason_code: offerEnabled ? null : r.off_reason_code,
    offerable: offerEnabled && reason === null,
  };
}

/** Read the capacity list for one company. Caller sets the company scope on `client`. */
export async function computeCapacity(client: Queryable, operatingCompanyId: string): Promise<CapacityRow[]> {
  const res = await client.query<CapacityRawRow>(CAPACITY_SQL, [operatingCompanyId]);
  const now = new Date();
  return res.rows.map((r) => toCapacityRow(r, now));
}
