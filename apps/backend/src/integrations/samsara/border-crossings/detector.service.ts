/**
 * ROUND 306 E-29 addition — border crossings are PROJECTED from the canonical fence events, not from a
 * second inside/outside engine. The old detector kept 5 hard-coded Laredo circles (one duplicated, with
 * coordinates up to ~30 km off the real bridges), wrote 'northbound' on every row, and matched no real load
 * status. Now:
 *  - source: geo.geofence_events ('entered' then the next 'exited') written by the ONE detector, on the
 *    international border_crossing fences (label names a Bridge, or the Champlain / Derby Line / Houlton
 *    Canada ports). State truck ports of entry (OK/KS/NM...) are not border crossings and are ignored.
 *  - a crossing is written ONLY when the country actually changes: the unit's last fix before entering and
 *    its first fix after leaving (telematics.vehicle_locations, within 6 h) are in different countries.
 *    Driving through a US-side customs lot is not a crossing. Direction from the destination country:
 *    into the US from Mexico = northbound, into Mexico = southbound; from Canada into the US = southbound,
 *    into Canada = northbound.
 *  - crossing_point from the fence: Laredo I (Gateway) laredo-i, Laredo II (Juárez–Lincoln) laredo-ii,
 *    Colombia Solidarity colombia, World Trade (Laredo IV) laredo-iv, every other crossing 'other'.
 *  - load = the load the unit was carrying at entry (shared loadAtTimeSql, joined on mdata.loads.assigned_unit_id);
 *    driver = the fence event's driver.
 *  - idempotent: a (vehicle, crossing point, entered time) already recorded is never written again.
 */
import type { PoolClient } from "pg";
import { loadAtTimeSql } from "../../../maintenance/driver-attribution.js";

type Db = Pick<PoolClient, "query">;
export type CrossingPoint = "laredo-i" | "laredo-ii" | "laredo-iii" | "laredo-iv" | "colombia" | "other";
type Country = "US" | "MX" | "CA";

const CANADA_PORT = /Champlain|Derby Line|Houlton/i;
export function isInternationalCrossing(label: string): boolean {
  return /Bridge/i.test(label) || CANADA_PORT.test(label);
}
export function crossingPointForFence(label: string): CrossingPoint {
  if (/\(Laredo I\)/.test(label)) return "laredo-i";
  if (/\(Laredo II\)/.test(label)) return "laredo-ii";
  if (/Columbia Bridge|Colombia Solidarity/i.test(label)) return "colombia";
  if (/World Trade Bridge|World Trade International Bridge/i.test(label)) return "laredo-iv";
  return "other";
}

const US_STATES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
const MX_HINT = /,\s*(TAM|TAMPS|N\.?\s?L\.?|COAH|CHIH|SON|B\.?\s?C\.?|Tamaulipas|Nuevo Le[oó]n|Coahuila|Chihuahua|Sonora|Baja California)\b|M[eé]xico\b/i;
const CA_HINT = /,\s*(ON|QC|NB|NS|BC|AB|MB|SK|PE|NL)\b(?!\w)|Canada\b/;

/** Pure: the country of one GPS fix from its reverse-geocoded state / formatted location; null when unknown. */
export function countryOfFix(state: string | null, formatted: string | null): Country | null {
  if (formatted && MX_HINT.test(formatted)) return "MX";
  if (state && US_STATES.has(state.toUpperCase())) return "US";
  if (formatted && CA_HINT.test(formatted)) return "CA";
  return null;
}

/** Pure: direction for a country change; null when the country did not change or is unknown. */
export function directionOf(before: Country | null, after: Country | null): "northbound" | "southbound" | null {
  if (!before || !after || before === after) return null;
  if (before === "MX" && after === "US") return "northbound";
  if (before === "US" && after === "MX") return "southbound";
  if (before === "CA" && after === "US") return "southbound";
  if (before === "US" && after === "CA") return "northbound";
  return null;
}


export type CrossingProjection = {
  visits: number;
  written: number;
  skipped: Record<"still_inside" | "no_country_change" | "country_unknown" | "already_recorded", number>;
};

export async function projectBorderCrossingsFromFenceEvents(client: Db, operatingCompanyId: string, sinceIso: string): Promise<CrossingProjection> {
  const visits = await client.query<{
    entered_id: string; unit_id: string; driver_id: string | null; label: string; geofence_id: string;
    entered_at: string; exited_at: string | null;
  }>(
    `SELECT ge.id::text AS entered_id, ge.unit_id::text, ge.driver_id::text, g.label, g.id::text AS geofence_id,
            ge.occurred_at AS entered_at,
            (SELECT min(x.occurred_at) FROM geo.geofence_events x
              WHERE x.geofence_id = ge.geofence_id AND x.unit_id = ge.unit_id
                AND x.event_kind = 'exited' AND x.occurred_at > ge.occurred_at) AS exited_at
       FROM geo.geofence_events ge
       JOIN geo.geofences g ON g.id = ge.geofence_id AND g.location_kind = 'border_crossing'
      WHERE ge.operating_company_id = $1::uuid AND ge.event_kind = 'entered' AND ge.occurred_at >= $2::timestamptz
      ORDER BY ge.occurred_at`,
    [operatingCompanyId, sinceIso]
  );
  const out: CrossingProjection = { visits: 0, written: 0, skipped: { still_inside: 0, no_country_change: 0, country_unknown: 0, already_recorded: 0 } };
  for (const v of visits.rows) {
    if (!isInternationalCrossing(v.label)) continue;
    out.visits += 1;
    if (!v.exited_at) { out.skipped.still_inside += 1; continue; }
    const point = crossingPointForFence(v.label);
    const dup = await client.query(
      `SELECT 1 FROM dispatch.border_crossing_events
        WHERE operating_company_id = $1::uuid AND vehicle_id = $2 AND crossing_point = $3 AND entered_geofence_at = $4::timestamptz LIMIT 1`,
      [operatingCompanyId, v.unit_id, point, v.entered_at]
    );
    if (dup.rows.length) { out.skipped.already_recorded += 1; continue; }
    const fix = async (cmp: "before" | "after") => {
      const r = await client.query<{ state: string | null; formatted_location: string | null }>(
        cmp === "before"
          ? `SELECT state, formatted_location FROM telematics.vehicle_locations
              WHERE unit_id = $1::uuid AND captured_at < $2::timestamptz AND captured_at >= $2::timestamptz - interval '6 hours'
                AND (state IS NOT NULL OR formatted_location IS NOT NULL)
              ORDER BY captured_at DESC LIMIT 1`
          : `SELECT state, formatted_location FROM telematics.vehicle_locations
              WHERE unit_id = $1::uuid AND captured_at > $2::timestamptz AND captured_at <= $2::timestamptz + interval '6 hours'
                AND (state IS NOT NULL OR formatted_location IS NOT NULL)
              ORDER BY captured_at ASC LIMIT 1`,
        [v.unit_id, cmp === "before" ? v.entered_at : v.exited_at]
      );
      const f = r.rows[0];
      return f ? countryOfFix(f.state, f.formatted_location) : null;
    };
    const before = await fix("before");
    const after = await fix("after");
    if (!before || !after) { out.skipped.country_unknown += 1; continue; }
    const direction = directionOf(before, after);
    if (!direction) { out.skipped.no_country_change += 1; continue; }
    // The load the truck was carrying at the crossing (shared loadAtTimeSql; NB vs booked return by time).
    const load = await client.query<{ id: string | null }>(
      `SELECT load_at_time.load_id::text AS id FROM (SELECT 1) _one ${loadAtTimeSql("$2::uuid", "$3::timestamptz")}`,
      [operatingCompanyId, v.unit_id, v.entered_at]
    );
    await client.query(
      `INSERT INTO dispatch.border_crossing_events
         (operating_company_id, vehicle_id, driver_uuid, load_uuid, crossing_point, direction, entered_geofence_at, exited_geofence_at)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7::timestamptz, $8::timestamptz)`,
      [operatingCompanyId, v.unit_id, v.driver_id, load.rows[0]?.id ?? null, point, direction, v.entered_at, v.exited_at]
    );
    out.written += 1;
  }
  return out;
}
