type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type Transition = "entered" | "exited" | null;

type GeofenceContainmentRow = {
  geofence_id: string;
  vertices_json: unknown;
  last_event_kind: "entered" | "exited" | null;
};

type LatLngVertex = {
  lat: number;
  lng: number;
};

export type GpsPointInput = {
  operating_company_id: string;
  unit_id: string;
  latitude: number;
  longitude: number;
  occurred_at: string;
  source?: "samsara_gps" | "manual";
  driver_id?: string | null;
};

export type GeofenceDetectionResult = {
  checked_geofences: number;
  transitions_written: number;
};

export function computeGeofenceTransition(
  lastEventKind: "entered" | "exited" | null,
  isInside: boolean
): Transition {
  if (isInside && lastEventKind !== "entered") return "entered";
  if (!isInside && lastEventKind === "entered") return "exited";
  return null;
}

function normalizeVertices(raw: unknown): LatLngVertex[] {
  if (!Array.isArray(raw)) return [];
  const out: LatLngVertex[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as { lat?: unknown; lng?: unknown };
    const lat = typeof value.lat === "number" ? value.lat : Number.NaN;
    const lng = typeof value.lng === "number" ? value.lng : Number.NaN;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      out.push({ lat, lng });
    }
  }
  return out;
}

function pointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  const cross = (py - ay) * (bx - ax) - (px - ax) * (by - ay);
  if (Math.abs(cross) > 1e-12) return false;
  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  if (dot < 0) return false;
  const squaredLength = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  return dot <= squaredLength;
}

export function pointInPolygon(latitude: number, longitude: number, vertices: LatLngVertex[]): boolean {
  if (vertices.length < 3) return false;

  let inside = false;
  const x = longitude;
  const y = latitude;

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].lng;
    const yi = vertices[i].lat;
    const xj = vertices[j].lng;
    const yj = vertices[j].lat;

    if (pointOnSegment(x, y, xi, yi, xj, yj)) return true;

    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

async function resolveDriverIdForUnit(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string
): Promise<string | null> {
  const res = await client.query<{ driver_id: string | null }>(
    `
      SELECT COALESCE(l.assigned_primary_driver_id, l.assigned_secondary_driver_id)::text AS driver_id
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.assigned_unit_id = $2::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status::text NOT IN ('delivered', 'cancelled')
      ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, unitId]
  );
  return res.rows[0]?.driver_id ?? null;
}

async function fetchContainmentRows(
  client: DbClient,
  input: GpsPointInput
): Promise<GeofenceContainmentRow[]> {
  const res = await client.query<GeofenceContainmentRow>(
    `
      SELECT
        g.id::text AS geofence_id,
        g.vertices_json,
        (
          SELECT ge.event_kind::text
          FROM geo.geofence_events ge
          WHERE ge.operating_company_id = $1::uuid
            AND ge.geofence_id = g.id
            AND ge.unit_id = $2::uuid
          ORDER BY ge.occurred_at DESC, ge.created_at DESC
          LIMIT 1
        )::text AS last_event_kind
      FROM geo.geofences g
      WHERE g.operating_company_id = $1::uuid
        AND g.is_active = true
    `,
    [input.operating_company_id, input.unit_id]
  );
  return res.rows;
}

export async function processGeofenceDetectionsForGpsPoint(
  client: DbClient,
  input: GpsPointInput
): Promise<GeofenceDetectionResult> {
  const rows = await fetchContainmentRows(client, input);
  if (rows.length === 0) {
    return { checked_geofences: 0, transitions_written: 0 };
  }

  const resolvedDriverId = input.driver_id ?? (await resolveDriverIdForUnit(client, input.operating_company_id, input.unit_id));

  let transitionsWritten = 0;
  for (const row of rows) {
    const isInside = pointInPolygon(input.latitude, input.longitude, normalizeVertices(row.vertices_json));
    const transition = computeGeofenceTransition(row.last_event_kind, isInside);
    if (!transition) continue;
    await client.query(
      `
        INSERT INTO geo.geofence_events (
          operating_company_id,
          geofence_id,
          unit_id,
          driver_id,
          event_kind,
          occurred_at,
          point_lat,
          point_lng,
          source
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6::timestamptz,
          $7::numeric,
          $8::numeric,
          $9
        )
        ON CONFLICT (operating_company_id, geofence_id, unit_id, event_kind, occurred_at, source) DO NOTHING
      `,
      [
        input.operating_company_id,
        row.geofence_id,
        input.unit_id,
        resolvedDriverId,
        transition,
        input.occurred_at,
        input.latitude,
        input.longitude,
        input.source ?? "samsara_gps",
      ]
    );
    transitionsWritten += 1;
  }

  return {
    checked_geofences: rows.length,
    transitions_written: transitionsWritten,
  };
}
