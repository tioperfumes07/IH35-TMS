/**
 * GAP-39 — Bind load stops to geofences for state-machine traceability (CAP-2).
 */

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type LoadStop = {
  stop_id: string;
  lat: number;
  lng: number;
  sequence: number;
};

export async function bindLoadToGeofences(
  client: QueryClient,
  operatingCompanyId: string,
  loadId: string
): Promise<{ bound: number; geofence_ids: string[] }> {
  const stops = await client.query<LoadStop>(
    `
      SELECT
        ls.id::text AS stop_id,
        ls.lat::double precision AS lat,
        ls.lng::double precision AS lng,
        ls.sequence
      FROM mdata.load_stops ls
      JOIN mdata.loads l ON l.id = ls.load_id
      WHERE l.id = $1::uuid
        AND l.operating_company_id = $2::uuid
        AND ls.lat IS NOT NULL
        AND ls.lng IS NOT NULL
      ORDER BY ls.sequence
    `,
    [loadId, operatingCompanyId]
  );

  const geofenceIds: string[] = [];
  for (const stop of stops.rows) {
    const existing = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM geo.geofences
        WHERE operating_company_id = $1::uuid
          AND location_kind = 'customer_site'
          AND is_active = true
          AND location_ref_id IS NULL
          AND label = $2
        LIMIT 1
      `,
      [operatingCompanyId, `load-${loadId}-stop-${stop.sequence}`]
    );
    if (existing.rows[0]?.id) {
      geofenceIds.push(existing.rows[0].id);
      continue;
    }

    const radiusDeg = 250 / 364000;
    const lat = stop.lat;
    const lng = stop.lng;
    const vertices = [
      { lat: lat + radiusDeg, lng },
      { lat, lng: lng + radiusDeg },
      { lat: lat - radiusDeg, lng },
      { lat, lng: lng - radiusDeg },
    ];
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO geo.geofences (
          operating_company_id, label, location_kind, vertices_json, is_active, source
        )
        VALUES ($1::uuid, $2, 'customer_site', $3::jsonb, true, 'auto_dispatch')
        RETURNING id::text
      `,
      [operatingCompanyId, `load-${loadId}-stop-${stop.sequence}`, JSON.stringify(vertices)]
    );
    if (inserted.rows[0]?.id) geofenceIds.push(inserted.rows[0].id);
  }

  return { bound: geofenceIds.length, geofence_ids: geofenceIds };
}
