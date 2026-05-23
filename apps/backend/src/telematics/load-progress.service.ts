type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type NextStopRow = {
  stop_id: string;
  scheduled_arrival_at: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

type UnitGpsRow = {
  raw_payload: unknown;
};

type LatLngPoint = {
  latitude: number;
  longitude: number;
  occurred_at: string;
};

export type ProgressStatus = "on_track" | "behind" | "delayed" | "early" | "unknown";

export type LoadProgressSnapshot = {
  progress_status: ProgressStatus;
  eta_delta_minutes: number | null;
};

export const DEFAULT_HIGHWAY_SPEED_MPH = 60;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function deriveProgressStatus(deltaMinutes: number): ProgressStatus {
  if (deltaMinutes < -30) return "early";
  if (deltaMinutes <= 15) return "on_track";
  if (deltaMinutes <= 60) return "behind";
  return "delayed";
}

export function computeEtaDeltaMinutes(input: {
  distance_miles: number;
  speed_mph?: number;
  gps_occurred_at: string;
  scheduled_arrival_at: string;
}): number {
  const speed = input.speed_mph ?? DEFAULT_HIGHWAY_SPEED_MPH;
  const etaMs = new Date(input.gps_occurred_at).getTime() + (input.distance_miles / speed) * 60 * 60 * 1000;
  const scheduledMs = new Date(input.scheduled_arrival_at).getTime();
  return Math.round((etaMs - scheduledMs) / 60000);
}

function extractLocation(payload: unknown): LatLngPoint | null {
  const root = asObject(payload);
  if (!root) return null;
  const record = asObject(root.data) ?? asObject(root.vehicle) ?? root;
  const candidates = [
    asObject(record.location),
    asObject(record.gps),
    asObject(record.position),
    asObject(root.location),
    asObject(root.gps),
    asObject(root.position),
  ].filter((entry): entry is Record<string, unknown> => Boolean(entry));

  for (const candidate of candidates) {
    const latitude = Number(candidate.latitude ?? candidate.lat);
    const longitude = Number(candidate.longitude ?? candidate.lng ?? candidate.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const rawTime = candidate.time ?? candidate.timestamp ?? candidate.recorded_at ?? candidate.occurred_at;
    const occurredAt = typeof rawTime === "string" && rawTime.trim().length > 0 ? new Date(rawTime).toISOString() : new Date().toISOString();
    return { latitude, longitude, occurred_at: occurredAt };
  }

  return null;
}

async function fetchNextStop(client: DbClient, operatingCompanyId: string, loadId: string): Promise<NextStopRow | null> {
  const res = await client.query<NextStopRow>(
    `
      SELECT
        s.id::text AS stop_id,
        COALESCE(s.scheduled_arrival_at, s.appointment_start_at)::text AS scheduled_arrival_at,
        COALESCE(s.latitude, loc.latitude) AS latitude,
        COALESCE(s.longitude, loc.longitude) AS longitude
      FROM mdata.load_stops s
      JOIN mdata.loads l ON l.id = s.load_id
      LEFT JOIN mdata.locations loc ON loc.id = s.location_id
      WHERE l.operating_company_id = $1::uuid
        AND l.id = $2::uuid
        AND l.soft_deleted_at IS NULL
        AND s.status::text NOT IN ('departed', 'cancelled')
      ORDER BY s.sequence_number ASC
      LIMIT 1
    `,
    [operatingCompanyId, loadId]
  );
  return res.rows[0] ?? null;
}

async function fetchUnitGps(client: DbClient, operatingCompanyId: string, unitId: string): Promise<LatLngPoint | null> {
  const res = await client.query<UnitGpsRow>(
    `
      SELECT raw_payload
      FROM integrations.samsara_vehicles
      WHERE operating_company_id = $1::uuid
        AND local_unit_id = $2::uuid
      ORDER BY last_seen_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, unitId]
  );
  return extractLocation(res.rows[0]?.raw_payload);
}

export async function computeProgressStatus(
  client: DbClient,
  input: { operating_company_id: string; load_id: string; assigned_unit_id: string | null }
): Promise<LoadProgressSnapshot> {
  if (!input.assigned_unit_id) return { progress_status: "unknown", eta_delta_minutes: null };
  const nextStop = await fetchNextStop(client, input.operating_company_id, input.load_id);
  if (!nextStop?.scheduled_arrival_at || nextStop.latitude == null || nextStop.longitude == null) {
    return { progress_status: "unknown", eta_delta_minutes: null };
  }

  const gpsPoint = await fetchUnitGps(client, input.operating_company_id, input.assigned_unit_id);
  if (!gpsPoint) return { progress_status: "unknown", eta_delta_minutes: null };

  const distanceMiles = haversineMiles(gpsPoint.latitude, gpsPoint.longitude, Number(nextStop.latitude), Number(nextStop.longitude));
  const deltaMinutes = computeEtaDeltaMinutes({
    distance_miles: distanceMiles,
    gps_occurred_at: gpsPoint.occurred_at,
    scheduled_arrival_at: nextStop.scheduled_arrival_at,
  });

  return {
    progress_status: deriveProgressStatus(deltaMinutes),
    eta_delta_minutes: deltaMinutes,
  };
}
