/**
 * GO-19-2b Section 6 (owner 2026-09-03): mileage.service.ts is the ONLY entry point for a
 * coordinate-to-coordinate distance. Checks catalogs.point_mileage first (computed once, reused
 * forever); calls the configured MileageProvider on a miss and writes the row.
 *
 * Coordinates are ROUNDED TO 4 DECIMAL PLACES before lookup/storage (~11m precision at the
 * equator) -- matches point_mileage's own column precision (uq_point_mileage_coords is a unique
 * index on the rounded values), so two bookings a few meters apart share one cached row instead of
 * silently fragmenting the cache.
 *
 * LAW: a miss with no configured provider (or a provider error) returns NULL WITH A REASON. NEVER
 * 0. Same law chain-deadhead.service.ts's header already states.
 */
import type { MileagePoint, MileageProvider } from "./mileage-provider.js";

export type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type MileageResolution =
  | { practical_miles: number; shortest_miles: number | null; source: "cache" | "provider"; engine: string; reason?: undefined }
  | { practical_miles: null; shortest_miles: null; source: "blank"; engine?: undefined; reason: string };

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export async function resolvePointMileage(
  client: Queryable,
  provider: MileageProvider,
  from: MileagePoint,
  to: MileagePoint
): Promise<MileageResolution> {
  const originLat = round4(from.lat);
  const originLng = round4(from.lng);
  const destLat = round4(to.lat);
  const destLng = round4(to.lng);

  const cached = await client.query<{ practical_miles: string; shortest_miles: string | null; engine: string }>(
    `SELECT practical_miles::text, shortest_miles::text, engine
       FROM catalogs.point_mileage
      WHERE origin_lat = $1::numeric AND origin_lng = $2::numeric
        AND dest_lat = $3::numeric AND dest_lng = $4::numeric
      LIMIT 1`,
    [originLat, originLng, destLat, destLng]
  );
  const hit = cached.rows[0];
  if (hit) {
    return {
      practical_miles: Number(hit.practical_miles),
      shortest_miles: hit.shortest_miles == null ? null : Number(hit.shortest_miles),
      source: "cache",
      engine: hit.engine,
    };
  }

  const routed = await provider.route({ lat: originLat, lng: originLng }, { lat: destLat, lng: destLng });
  if (routed.practical_miles == null) {
    return { practical_miles: null, shortest_miles: null, source: "blank", reason: routed.reason };
  }

  await client.query(
    `INSERT INTO catalogs.point_mileage (
       origin_lat, origin_lng, dest_lat, dest_lng, practical_miles, shortest_miles, engine, engine_version
     ) VALUES ($1::numeric, $2::numeric, $3::numeric, $4::numeric, $5::numeric, $6::numeric, $7, $8)
     ON CONFLICT (origin_lat, origin_lng, dest_lat, dest_lng) DO NOTHING`,
    [originLat, originLng, destLat, destLng, routed.practical_miles, routed.shortest_miles, provider.name, provider.version]
  );

  return {
    practical_miles: routed.practical_miles,
    shortest_miles: routed.shortest_miles,
    source: "provider",
    engine: provider.name,
  };
}
