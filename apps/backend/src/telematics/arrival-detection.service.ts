type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type RemainingStopRow = {
  stop_id: string;
  stop_label: string | null;
  latitude: number | string;
  longitude: number | string;
};

type LastArrivalRow = {
  triggered_at: string;
};

export type ArrivalGpsInput = {
  operating_company_id: string;
  unit_id: string;
  latitude: number;
  longitude: number;
  occurred_at: string;
};

export type ArrivalDetectionResult = {
  checked_stops: number;
  arrivals_triggered: number;
};

export type ArrivalDriverNotifier = (input: {
  operatingCompanyId: string;
  driverId: string;
  title: string;
  body: string;
  tag: string;
  data: Record<string, string>;
}) => Promise<unknown>;

export const ARRIVAL_RADIUS_FEET = 250;
export const ARRIVAL_DEDUPE_MINUTES = 30;

export function haversineFeet(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const meters = 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return meters * 3.28084;
}

export function shouldTriggerArrival(distanceFeet: number, lastTriggeredAt: string | null, occurredAt: string): boolean {
  if (distanceFeet > ARRIVAL_RADIUS_FEET) return false;
  if (!lastTriggeredAt) return true;
  const elapsedMs = new Date(occurredAt).getTime() - new Date(lastTriggeredAt).getTime();
  return elapsedMs >= ARRIVAL_DEDUPE_MINUTES * 60 * 1000;
}

async function getDriverForVehicleAtTime(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string,
  ts: string
): Promise<string | null> {
  const res = await client.query<{ driver_id: string | null }>(
    `
      SELECT a.driver_id::text
      FROM telematics.vehicle_driver_assignments a
      WHERE a.operating_company_id = $1::uuid
        AND a.unit_id = $2::uuid
        AND a.started_at <= $3::timestamptz
        AND (a.ended_at IS NULL OR a.ended_at > $3::timestamptz)
      ORDER BY a.started_at DESC, a.created_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, unitId, ts]
  );
  return res.rows[0]?.driver_id ?? null;
}

async function fetchRemainingStops(client: DbClient, input: ArrivalGpsInput): Promise<RemainingStopRow[]> {
  const res = await client.query<RemainingStopRow>(
    `
      SELECT
        s.id::text AS stop_id,
        COALESCE(loc.location_name, s.address_line1, concat_ws(', ', s.city, s.state)) AS stop_label,
        loc.latitude,
        loc.longitude
      FROM mdata.loads l
      JOIN mdata.load_stops s ON s.load_id = l.id
      LEFT JOIN mdata.locations loc ON loc.id = s.location_id
      WHERE l.operating_company_id = $1::uuid
        AND l.assigned_unit_id = $2::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status::text NOT IN ('delivered', 'delivered_pending_docs', 'invoiced', 'paid', 'closed', 'cancelled')
        AND s.status::text <> 'departed'
        AND loc.latitude IS NOT NULL
        AND loc.longitude IS NOT NULL
      ORDER BY s.sequence_number ASC
    `,
    [input.operating_company_id, input.unit_id]
  );
  return res.rows;
}

async function fetchLastArrival(
  client: DbClient,
  operatingCompanyId: string,
  stopId: string,
  unitId: string
): Promise<LastArrivalRow | null> {
  const res = await client.query<LastArrivalRow>(
    `
      SELECT triggered_at::text
      FROM dispatch.stop_arrivals
      WHERE operating_company_id = $1::uuid
        AND stop_id = $2::uuid
        AND unit_id = $3::uuid
      ORDER BY triggered_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, stopId, unitId]
  );
  return res.rows[0] ?? null;
}

export async function processArrivalDetectionsForGpsPoint(
  client: DbClient,
  input: ArrivalGpsInput,
  options?: { notifyDriver?: ArrivalDriverNotifier }
): Promise<ArrivalDetectionResult> {
  const stops = await fetchRemainingStops(client, input);
  if (stops.length === 0) return { checked_stops: 0, arrivals_triggered: 0 };

  const driverId = await getDriverForVehicleAtTime(client, input.operating_company_id, input.unit_id, input.occurred_at);
  let arrivalsTriggered = 0;

  for (const stop of stops) {
    const distanceFeet = Math.round(
      haversineFeet(input.latitude, input.longitude, Number(stop.latitude), Number(stop.longitude))
    );
    const lastArrival = await fetchLastArrival(client, input.operating_company_id, stop.stop_id, input.unit_id);
    if (!shouldTriggerArrival(distanceFeet, lastArrival?.triggered_at ?? null, input.occurred_at)) continue;

    const insertRes = await client.query<{ id: string }>(
      `
        INSERT INTO dispatch.stop_arrivals (
          operating_company_id,
          stop_id,
          unit_id,
          driver_id,
          triggered_at,
          distance_at_trigger_ft
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::timestamptz,
          $6::int
        )
        ON CONFLICT (operating_company_id, stop_id, unit_id, triggered_at) DO NOTHING
        RETURNING id::text
      `,
      [input.operating_company_id, stop.stop_id, input.unit_id, driverId, input.occurred_at, distanceFeet]
    );

    if (insertRes.rows.length === 0) continue;
    arrivalsTriggered += 1;

    if (driverId && options?.notifyDriver) {
      await options.notifyDriver({
        operatingCompanyId: input.operating_company_id,
        driverId,
        title: "Arrived at stop?",
        body: `You appear to be at ${stop.stop_label ?? "your next stop"}. Confirm arrival.`,
        tag: `arrival-${stop.stop_id}`,
        data: { kind: "arrival_prompt", stop_id: stop.stop_id, unit_id: input.unit_id },
      });
    }
  }

  return { checked_stops: stops.length, arrivals_triggered: arrivalsTriggered };
}
