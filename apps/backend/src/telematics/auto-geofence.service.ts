import { appendCrudAudit } from "../audit/crud-audit.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type LoadStopRow = {
  stop_id: string;
  location_id: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  customer_id: string;
  customer_name: string | null;
};

type ExistingGeofenceRow = {
  id: string;
};

export type AutoGeofenceInput = {
  operating_company_id: string;
  load_id: string;
};

export type AutoGeofenceResult = {
  stops_checked: number;
  geofences_created: number;
  skipped_existing: number;
  skipped_missing_coordinates: number;
};

type LatLng = {
  latitude: number;
  longitude: number;
};

type LatLngVertex = {
  lat: number;
  lng: number;
};

const DEFAULT_GEOFENCE_SIDE_METERS = 100;

function buildAddressLabel(stop: LoadStopRow): string {
  const parts = [stop.address_line1, stop.city, stop.state, stop.country]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (parts.length === 0) return `Stop ${stop.stop_id}`;
  return parts.join(", ");
}

export function normalizeAddressKey(stop: LoadStopRow): string {
  return buildAddressLabel(stop).toLowerCase();
}

export function squareVerticesFromCenter(
  latitude: number,
  longitude: number,
  sideMeters: number = DEFAULT_GEOFENCE_SIDE_METERS
): LatLngVertex[] {
  const halfSideMeters = sideMeters / 2;
  const latDelta = halfSideMeters / 111_320;
  const lngDelta = halfSideMeters / (111_320 * Math.max(0.1, Math.cos((latitude * Math.PI) / 180)));

  return [
    { lat: latitude + latDelta, lng: longitude - lngDelta },
    { lat: latitude + latDelta, lng: longitude + lngDelta },
    { lat: latitude - latDelta, lng: longitude + lngDelta },
    { lat: latitude - latDelta, lng: longitude - lngDelta },
  ];
}

async function geocodeStopIfNeeded(_stop: LoadStopRow): Promise<LatLng | null> {
  // Non-blocking MVP: rely on stop/location coordinates.
  // External geocoder integration can be added without changing CAP-2 callsites.
  return null;
}

async function loadStopsForGeofencing(client: DbClient, input: AutoGeofenceInput): Promise<LoadStopRow[]> {
  const res = await client.query<LoadStopRow>(
    `
      SELECT
        s.id::text AS stop_id,
        s.location_id::text,
        s.address_line1,
        s.city,
        s.state,
        s.country,
        COALESCE(s.latitude, loc.latitude)::double precision AS latitude,
        COALESCE(s.longitude, loc.longitude)::double precision AS longitude,
        l.customer_id::text AS customer_id,
        c.customer_name
      FROM mdata.load_stops s
      JOIN mdata.loads l ON l.id = s.load_id
      JOIN mdata.customers c ON c.id = l.customer_id
      LEFT JOIN mdata.locations loc ON loc.id = s.location_id
      WHERE l.operating_company_id = $1::uuid
        AND l.id = $2::uuid
      ORDER BY s.sequence_number ASC
    `,
    [input.operating_company_id, input.load_id]
  );
  return res.rows;
}

async function findExistingGeofence(
  client: DbClient,
  input: AutoGeofenceInput,
  customerId: string,
  normalizedAddress: string
): Promise<ExistingGeofenceRow | null> {
  const res = await client.query<ExistingGeofenceRow>(
    `
      SELECT g.id::text AS id
      FROM geo.geofences g
      WHERE g.operating_company_id = $1::uuid
        AND g.location_kind = 'customer_site'
        AND g.is_active = true
        AND (
          g.location_ref_id = $2::uuid
          OR lower(g.label) = $3
        )
      LIMIT 1
    `,
    [input.operating_company_id, customerId, normalizedAddress]
  );
  return res.rows[0] ?? null;
}

export async function autoCreateGeofencesForLoadWithClient(
  client: DbClient,
  actorUserId: string,
  input: AutoGeofenceInput
): Promise<AutoGeofenceResult> {
  const stops = await loadStopsForGeofencing(client, input);
  let created = 0;
  let skippedExisting = 0;
  let skippedMissingCoordinates = 0;

  for (const stop of stops) {
    const normalizedAddress = normalizeAddressKey(stop);
    const existing = await findExistingGeofence(client, input, stop.customer_id, normalizedAddress);
    if (existing) {
      skippedExisting += 1;
      continue;
    }

    let center: LatLng | null =
      stop.latitude != null && stop.longitude != null ? { latitude: Number(stop.latitude), longitude: Number(stop.longitude) } : null;
    if (!center) center = await geocodeStopIfNeeded(stop);
    if (!center) {
      skippedMissingCoordinates += 1;
      await appendCrudAudit(
        client as never,
        actorUserId,
        "telematics.auto_geofence.geocode_skipped",
        {
          operating_company_id: input.operating_company_id,
          load_id: input.load_id,
          stop_id: stop.stop_id,
          reason: "missing_coordinates",
        },
        "info",
        "CAP-2"
      );
      continue;
    }

    const label = buildAddressLabel(stop);
    await client.query(
      `
        INSERT INTO geo.geofences (
          operating_company_id,
          label,
          location_kind,
          location_ref_id,
          vertices_json,
          is_active,
          source,
          created_by_user_uuid,
          updated_by_user_uuid
        )
        VALUES (
          $1::uuid,
          $2,
          'customer_site',
          $3::uuid,
          $4::jsonb,
          true,
          'auto_dispatch',
          $5::uuid,
          $5::uuid
        )
      `,
      [input.operating_company_id, label, stop.customer_id, JSON.stringify(squareVerticesFromCenter(center.latitude, center.longitude)), actorUserId]
    );
    created += 1;
  }

  return {
    stops_checked: stops.length,
    geofences_created: created,
    skipped_existing: skippedExisting,
    skipped_missing_coordinates: skippedMissingCoordinates,
  };
}

export async function autoCreateGeofencesForLoad(
  actorUserId: string,
  input: AutoGeofenceInput
): Promise<AutoGeofenceResult> {
  const { withCurrentUser } = await import("../auth/db.js");
  return withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    return autoCreateGeofencesForLoadWithClient(client as DbClient, actorUserId, input);
  });
}
