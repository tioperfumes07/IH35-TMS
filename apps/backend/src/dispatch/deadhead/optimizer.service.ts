import { withCurrentUser } from "../../auth/db.js";

export const DEFAULT_DEADHEAD_RATE_PER_MILE_CENTS = 250;
export const DEFAULT_MAX_DEADHEAD_MILES = 200;

export type NextLoadSuggestion = {
  load_uuid: string;
  load_number: string | null;
  pickup_city: string;
  pickup_state: string;
  delivery_city: string;
  delivery_state: string;
  deadhead_miles: number;
  loaded_miles: number;
  total_miles: number;
  est_revenue_cents: number;
  est_margin_cents: number;
  score: number;
};

const STATE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  AL: { lat: 32.8, lng: -86.8 },
  AZ: { lat: 34.3, lng: -111.7 },
  AR: { lat: 34.8, lng: -92.2 },
  CA: { lat: 36.8, lng: -119.4 },
  CO: { lat: 39.0, lng: -105.3 },
  FL: { lat: 27.8, lng: -81.7 },
  GA: { lat: 33.0, lng: -83.5 },
  IL: { lat: 40.0, lng: -89.0 },
  IN: { lat: 40.2, lng: -86.1 },
  KS: { lat: 38.5, lng: -98.4 },
  KY: { lat: 37.8, lng: -84.9 },
  LA: { lat: 31.0, lng: -92.0 },
  MI: { lat: 44.3, lng: -85.4 },
  MN: { lat: 46.3, lng: -94.3 },
  MO: { lat: 38.4, lng: -92.5 },
  MS: { lat: 32.7, lng: -89.7 },
  NC: { lat: 35.5, lng: -79.4 },
  NE: { lat: 41.5, lng: -99.8 },
  NM: { lat: 34.5, lng: -106.1 },
  NV: { lat: 39.3, lng: -116.6 },
  NY: { lat: 43.0, lng: -75.5 },
  OH: { lat: 40.4, lng: -82.8 },
  OK: { lat: 35.5, lng: -97.5 },
  OR: { lat: 44.0, lng: -120.5 },
  PA: { lat: 40.9, lng: -77.8 },
  SC: { lat: 33.9, lng: -80.9 },
  TN: { lat: 35.8, lng: -86.3 },
  TX: { lat: 31.0, lng: -99.0 },
  UT: { lat: 39.3, lng: -111.7 },
  VA: { lat: 37.5, lng: -78.5 },
  WA: { lat: 47.4, lng: -120.5 },
  WI: { lat: 44.6, lng: -89.8 },
};

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMiles = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthMiles * c;
}

export function cityStateToLatLng(city: string, state: string): { lat: number; lng: number } | null {
  const st = state.trim().toUpperCase().slice(0, 2);
  const base = STATE_CENTROIDS[st];
  if (!base) return null;
  const seed = `${city.trim().toLowerCase()}|${st}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 10000;
  const latJitter = ((hash % 50) - 25) / 10;
  const lngJitter = (((hash / 7) % 50) - 25) / 10;
  return { lat: base.lat + latJitter, lng: base.lng + lngJitter };
}

export function computeDeadheadCostCents(deadheadMiles: number, ratePerMileCents = DEFAULT_DEADHEAD_RATE_PER_MILE_CENTS): number {
  return Math.round(Math.max(0, deadheadMiles) * Math.max(0, ratePerMileCents));
}

export function computeSuggestionScore(
  revenueCents: number,
  deadheadMiles: number,
  loadedMiles: number,
  ratePerMileCents = DEFAULT_DEADHEAD_RATE_PER_MILE_CENTS
): number {
  const deadheadCost = computeDeadheadCostCents(deadheadMiles, ratePerMileCents);
  const totalMiles = Math.max(0, deadheadMiles) + Math.max(0, loadedMiles);
  if (totalMiles <= 0) return 0;
  return Math.round(((revenueCents - deadheadCost) / totalMiles) * 100) / 100;
}

export function rankLoadSuggestions(rows: NextLoadSuggestion[], limit = 5): NextLoadSuggestion[] {
  return [...rows]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.deadhead_miles !== b.deadhead_miles) return a.deadhead_miles - b.deadhead_miles;
      return a.load_uuid.localeCompare(b.load_uuid);
    })
    .slice(0, limit);
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function resolveLoadedMiles(row: {
  miles_practical: number | null;
  miles_shortest: number | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
}): number {
  if (row.miles_practical != null && row.miles_practical > 0) return row.miles_practical;
  if (row.miles_shortest != null && row.miles_shortest > 0) return row.miles_shortest;
  if (
    row.pickup_lat != null &&
    row.pickup_lng != null &&
    row.delivery_lat != null &&
    row.delivery_lng != null
  ) {
    return Math.round(haversineMiles(row.pickup_lat, row.pickup_lng, row.delivery_lat, row.delivery_lng) * 10) / 10;
  }
  return 0;
}

type CandidateRow = {
  id: string;
  load_number: string | null;
  rate_total_cents: string | number | null;
  miles_practical: number | null;
  miles_shortest: number | null;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  first_pickup_at: string | null;
};

export type FindBestLoadForUnitInput = {
  operating_company_id: string;
  unit_uuid: string;
  after_delivery_at: string;
  max_deadhead_miles?: number;
  drop_latitude?: number | null;
  drop_longitude?: number | null;
  drop_city?: string | null;
  drop_state?: string | null;
};

async function resolveDropCoordinates(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  input: FindBestLoadForUnitInput
): Promise<{ lat: number; lng: number } | null> {
  if (input.drop_latitude != null && input.drop_longitude != null) {
    return { lat: Number(input.drop_latitude), lng: Number(input.drop_longitude) };
  }
  if (input.drop_city && input.drop_state) {
    const approx = cityStateToLatLng(input.drop_city, input.drop_state);
    if (approx) return approx;
  }

  const unitDrop = await client.query(
    `
      SELECT loc.latitude::float8 AS latitude, loc.longitude::float8 AS longitude
      FROM mdata.loads l
      JOIN LATERAL (
        SELECT s.latitude, s.longitude
        FROM mdata.load_stops s
        WHERE s.load_id = l.id AND s.stop_type = 'delivery'::mdata.stop_type_enum
        ORDER BY s.sequence_number DESC
        LIMIT 1
      ) loc ON true
      WHERE l.operating_company_id = $1::uuid
        AND l.assigned_unit_id = $2::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status IN (
          'dispatched'::mdata.load_status_enum,
          'in_transit'::mdata.load_status_enum,
          'delivered_pending_docs'::mdata.load_status_enum
        )
        AND loc.latitude IS NOT NULL
        AND loc.longitude IS NOT NULL
      ORDER BY COALESCE(
        (
          SELECT MAX(COALESCE(ds.scheduled_departure_at, ds.scheduled_arrival_at))
          FROM mdata.load_stops ds
          WHERE ds.load_id = l.id AND ds.stop_type = 'delivery'::mdata.stop_type_enum
        ),
        l.updated_at
      ) DESC
      LIMIT 1
    `,
    [input.operating_company_id, input.unit_uuid]
  );

  const row = unitDrop.rows[0];
  if (row?.latitude != null && row?.longitude != null) {
    return { lat: num(row.latitude), lng: num(row.longitude) };
  }
  return null;
}

export async function findBestLoadForUnit(userId: string, input: FindBestLoadForUnitInput): Promise<NextLoadSuggestion[]> {
  const maxDeadhead = input.max_deadhead_miles ?? DEFAULT_MAX_DEADHEAD_MILES;
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id]);

    const drop = await resolveDropCoordinates(client, input);
    if (!drop) return [];

    const candidates = await client.query<CandidateRow>(
      `
        SELECT
          l.id::text,
          l.load_number,
          l.rate_total_cents,
          l.miles_practical,
          l.miles_shortest,
          sp.city AS pickup_city,
          sp.state AS pickup_state,
          sd.city AS delivery_city,
          sd.state AS delivery_state,
          sp.latitude::float8 AS pickup_lat,
          sp.longitude::float8 AS pickup_lng,
          sd.latitude::float8 AS delivery_lat,
          sd.longitude::float8 AS delivery_lng,
          (
            SELECT MIN(COALESCE(ps.scheduled_arrival_at, ps.scheduled_departure_at))::text
            FROM mdata.load_stops ps
            WHERE ps.load_id = l.id AND ps.stop_type = 'pickup'::mdata.stop_type_enum
          ) AS first_pickup_at
        FROM mdata.loads l
        LEFT JOIN LATERAL (
          SELECT city, state, latitude, longitude
          FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'pickup'::mdata.stop_type_enum
          ORDER BY s.sequence_number ASC
          LIMIT 1
        ) sp ON true
        LEFT JOIN LATERAL (
          SELECT city, state, latitude, longitude
          FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'delivery'::mdata.stop_type_enum
          ORDER BY s.sequence_number DESC
          LIMIT 1
        ) sd ON true
        WHERE l.operating_company_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND l.status = 'assigned_not_dispatched'::mdata.load_status_enum
          AND (l.assigned_unit_id IS NULL OR l.assigned_unit_id <> $2::uuid)
          AND COALESCE(
            (
              SELECT MIN(COALESCE(ps.scheduled_arrival_at, ps.scheduled_departure_at))
              FROM mdata.load_stops ps
              WHERE ps.load_id = l.id AND ps.stop_type = 'pickup'::mdata.stop_type_enum
            ),
            l.created_at
          ) >= $3::timestamptz
      `,
      [input.operating_company_id, input.unit_uuid, input.after_delivery_at]
    );

    const suggestions: NextLoadSuggestion[] = [];

    for (const row of candidates.rows) {
      let pickupLat = row.pickup_lat != null ? num(row.pickup_lat) : null;
      let pickupLng = row.pickup_lng != null ? num(row.pickup_lng) : null;
      if ((pickupLat == null || pickupLng == null) && row.pickup_city && row.pickup_state) {
        const approx = cityStateToLatLng(row.pickup_city, row.pickup_state);
        if (approx) {
          pickupLat = approx.lat;
          pickupLng = approx.lng;
        }
      }
      if (pickupLat == null || pickupLng == null) continue;

      const deadheadMiles = Math.round(haversineMiles(drop.lat, drop.lng, pickupLat, pickupLng) * 10) / 10;
      if (deadheadMiles > maxDeadhead) continue;

      const loadedMiles = resolveLoadedMiles(row);
      const totalMiles = deadheadMiles + loadedMiles;
      const revenueCents = Math.max(0, Math.round(num(row.rate_total_cents)));
      const deadheadCost = computeDeadheadCostCents(deadheadMiles);
      const estMarginCents = revenueCents - deadheadCost;
      const score = computeSuggestionScore(revenueCents, deadheadMiles, loadedMiles);

      suggestions.push({
        load_uuid: row.id,
        load_number: row.load_number,
        pickup_city: row.pickup_city ?? "",
        pickup_state: row.pickup_state ?? "",
        delivery_city: row.delivery_city ?? "",
        delivery_state: row.delivery_state ?? "",
        deadhead_miles: deadheadMiles,
        loaded_miles: loadedMiles,
        total_miles: totalMiles,
        est_revenue_cents: revenueCents,
        est_margin_cents: estMarginCents,
        score,
      });
    }

    return rankLoadSuggestions(suggestions, 5);
  });
}
