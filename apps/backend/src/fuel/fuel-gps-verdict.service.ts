/**
 * ROUND 306 E-22 (fixed) — which truck was at the pump, decided by two independent signals.
 *
 * WHAT WAS WRONG. safety/fuel-gps-match.service.ts matched fuel-merchant BANK LINES to "the company
 * truck whose GPS fix is closest in time to bt.created_at" — created_at being when the row was
 * inserted into our database, not the pump time — and never compared the truck's position with the
 * station. With ~15 trucks reporting every two minutes some truck is always within 10 minutes, so
 * its 75 "high" USMCA matches on 2026-10-01 were clock coincidences. Bank lines carry no station
 * coordinates and no pump time; they cannot be matched to a truck by GPS at all.
 *
 * WHAT IT DOES NOW. Only purchases that carry a station location AND a pump time can be placed: the
 * Relay fills (integrations.relay_fuel_transactions — real relay_created_at, station lat/lng). For
 * each, two independent signals:
 *   card   — the unit Relay itself recorded (the driver's "Truck #" prompt -> matched_unit_id)
 *   gps    — every company truck STOPPED within GPS_RADIUS_M of the station inside +/-GPS_WINDOW_MIN
 * Verdict (the registry's own rule):
 *   match         both signals name the same truck
 *   held          they name different trucks — a person must look
 *   proposal      only one signal names a truck (no card unit, exactly one truck at the pump)
 *   unverifiable  the card names a truck but GPS has no fix for it in the window — say so, no verdict
 *   no_candidate  GPS shows no truck stopped at the station and the card names none
 * Computed on read. Writes nothing.
 */
import { relayLineIsGallonsSql } from "./relay-product-kind.js";
type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export const GPS_RADIUS_M = 500;
export const GPS_WINDOW_MIN = 60;

export type GpsVerdict = "match" | "held" | "proposal" | "unverifiable" | "no_candidate";

export type GpsCandidate = { unit_id: string; unit_number: string | null; metres: number; at: string };

/** Pure. */
export function classifyGpsVerdict(input: {
  cardUnitId: string | null;
  /** What the driver typed in Relay's "Truck #" prompt, even when it resolves to no unit. */
  cardUnitNumber?: string | null;
  cardUnitHasFixes: boolean;
  candidates: GpsCandidate[];
}): { verdict: GpsVerdict; why: string } {
  const ids = [...new Set(input.candidates.map((c) => c.unit_id))];
  if (input.cardUnitId && ids.includes(input.cardUnitId)) {
    return { verdict: "match", why: "the truck on the card was stopped at the station at pump time — two signals agree" };
  }
  if (input.cardUnitId && ids.length > 0) {
    return { verdict: "held", why: `the card names one truck, GPS puts a different truck at the pump (${ids.length} candidate(s)) — held for review` };
  }
  if (input.cardUnitId && !input.cardUnitHasFixes) {
    return { verdict: "unverifiable", why: "the card names a truck but its GPS has no fix within the window — no verdict either way" };
  }
  if (input.cardUnitId) {
    return { verdict: "held", why: "the card's truck has GPS fixes in the window but was not stopped at this station — held for review" };
  }
  const typed = input.cardUnitNumber ? `the card says "${input.cardUnitNumber}", which is not a truck in this company's fleet` : "no truck on the card";
  if (ids.length === 1) {
    return { verdict: "proposal", why: `${typed}; exactly one truck was stopped at the station — one signal, a proposal only` };
  }
  if (ids.length > 1) {
    return { verdict: "held", why: `${typed} and ${ids.length} trucks stopped at the station — cannot choose` };
  }
  return { verdict: "no_candidate", why: `${typed} and no truck stopped at the station in the window` };
}

export type RelayFillGpsVerdict = {
  relay_fuel_transaction_id: string;
  transaction_id: string;
  pump_time: string;
  station: string;
  gallons: number | null;
  card_unit_id: string | null;
  card_unit_number: string | null;
  candidates: GpsCandidate[];
  verdict: GpsVerdict;
  why: string;
};

export async function computeRelayFillGpsVerdicts(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<RelayFillGpsVerdict[]> {
  const fills = await client.query<{
    id: string;
    transaction_id: string;
    pump_time: Date;
    lat: string | null;
    lng: string | null;
    station: string;
    gallons: string | null;
    card_unit_id: string | null;
    card_unit_number: string | null;
  }>(
    `SELECT r.id::text, r.transaction_id, r.relay_created_at AS pump_time,
            r.location_latitude::text AS lat, r.location_longitude::text AS lng,
            concat_ws(', ', r.merchant_name, r.location_city, r.location_state) AS station,
            (SELECT sum(l.volume)::text FROM integrations.relay_fuel_transaction_lines l
              WHERE l.relay_fuel_transaction_id = r.id AND l.is_active AND ${relayLineIsGallonsSql("l")}) AS gallons,
            -- The card's own "Truck #": the ingest's resolved id, else that number resolved inside THIS
            -- company's fleet (the same rule the ingest uses), never across entities.
            COALESCE(r.matched_unit_id, (
              SELECT u.id FROM mdata.units u
               WHERE u.unit_number = r.matched_unit_number
                 AND (u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid)
               LIMIT 1))::text AS card_unit_id,
            r.matched_unit_number AS card_unit_number
       FROM integrations.relay_fuel_transactions r
      WHERE r.operating_company_id = $1::uuid AND r.voided_at IS NULL
        AND r.relay_created_at >= $2::timestamptz AND r.relay_created_at < $3::timestamptz
      ORDER BY r.relay_created_at DESC`,
    [operatingCompanyId, periodStart, periodEnd]
  );

  const fleet = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.units WHERE owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid`,
    [operatingCompanyId]
  );
  const fleetIds = fleet.rows.map((r) => r.id);

  const out: RelayFillGpsVerdict[] = [];
  for (const f of fills.rows) {
    const pump = new Date(f.pump_time);
    let candidates: GpsCandidate[] = [];
    if (f.lat !== null && f.lng !== null) {
      const c = await client.query<{ unit_id: string; unit_number: string | null; metres: string; at: Date }>(
        `SELECT DISTINCT ON (v.unit_id) v.unit_id::text, u.unit_number,
                (6371000 * 2 * asin(sqrt(power(sin(radians(v.lat - $2::float8) / 2), 2)
                  + cos(radians($2::float8)) * cos(radians(v.lat)) * power(sin(radians(v.lng - $3::float8) / 2), 2))))::text AS metres,
                v.captured_at AS at
           FROM telematics.vehicle_locations v
           JOIN mdata.units u ON u.id = v.unit_id
          WHERE v.unit_id = ANY($1::uuid[])
            AND v.captured_at BETWEEN $4::timestamptz - make_interval(mins => $5) AND $4::timestamptz + make_interval(mins => $5)
            AND coalesce(v.speed_mph, CASE WHEN v.engine_state = 'off' THEN 0 END) <= 1
            AND v.lat BETWEEN $2::float8 - 0.01 AND $2::float8 + 0.01
            AND v.lng BETWEEN $3::float8 - 0.01 AND $3::float8 + 0.01
          ORDER BY v.unit_id, abs(extract(epoch FROM v.captured_at - $4::timestamptz))`,
        [fleetIds, Number(f.lat), Number(f.lng), pump.toISOString(), GPS_WINDOW_MIN]
      );
      candidates = c.rows
        .map((r) => ({ unit_id: r.unit_id, unit_number: r.unit_number, metres: Math.round(Number(r.metres)), at: new Date(r.at).toISOString() }))
        .filter((r) => r.metres <= GPS_RADIUS_M);
    }
    let cardUnitHasFixes = false;
    if (f.card_unit_id) {
      const h = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM telematics.vehicle_locations
          WHERE unit_id = $1::uuid
            AND captured_at BETWEEN $2::timestamptz - make_interval(mins => $3) AND $2::timestamptz + make_interval(mins => $3)`,
        [f.card_unit_id, pump.toISOString(), GPS_WINDOW_MIN]
      );
      cardUnitHasFixes = (h.rows[0]?.n ?? 0) > 0;
    }
    out.push({
      relay_fuel_transaction_id: f.id,
      transaction_id: f.transaction_id,
      pump_time: pump.toISOString(),
      station: f.station,
      gallons: f.gallons === null ? null : Number(f.gallons),
      card_unit_id: f.card_unit_id,
      card_unit_number: f.card_unit_number,
      candidates,
      ...classifyGpsVerdict({ cardUnitId: f.card_unit_id, cardUnitNumber: f.card_unit_number, cardUnitHasFixes, candidates }),
    });
  }
  return out;
}
