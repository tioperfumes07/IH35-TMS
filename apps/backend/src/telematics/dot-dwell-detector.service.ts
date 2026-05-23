type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type DotDwellInput = {
  operating_company_id: string;
  geofence_id: string;
  unit_id: string;
  driver_id: string | null;
  event_kind: "entered" | "exited";
  occurred_at: string;
};

type DotGeofenceRow = {
  id: string;
};

type EnteredEventRow = {
  occurred_at: string;
  driver_id: string | null;
};

const DEFAULT_DWELL_THRESHOLD_MIN = 5;

function thresholdMinutes() {
  const raw = Number(process.env.DOT_DWELL_THRESHOLD_MINUTES ?? DEFAULT_DWELL_THRESHOLD_MIN);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DWELL_THRESHOLD_MIN;
  return Math.floor(raw);
}

export async function processDotDwellForGeofenceEvent(client: DbClient, input: DotDwellInput): Promise<boolean> {
  if (input.event_kind !== "exited") return false;

  const geofenceRes = await client.query<DotGeofenceRow>(
    `
      SELECT g.id::text AS id
      FROM geo.geofences g
      WHERE g.operating_company_id = $1::uuid
        AND g.id = $2::uuid
        AND g.location_kind = 'dot_inspection_station'
        AND g.is_active = true
      LIMIT 1
    `,
    [input.operating_company_id, input.geofence_id]
  );
  if (!geofenceRes.rows[0]) return false;

  const enteredRes = await client.query<EnteredEventRow>(
    `
      SELECT
        ge.occurred_at::text,
        ge.driver_id::text
      FROM geo.geofence_events ge
      WHERE ge.operating_company_id = $1::uuid
        AND ge.geofence_id = $2::uuid
        AND ge.unit_id = $3::uuid
        AND ge.event_kind = 'entered'
        AND ge.occurred_at <= $4::timestamptz
      ORDER BY ge.occurred_at DESC, ge.created_at DESC
      LIMIT 1
    `,
    [input.operating_company_id, input.geofence_id, input.unit_id, input.occurred_at]
  );
  const entered = enteredRes.rows[0];
  if (!entered?.occurred_at) return false;

  const arrivedAt = new Date(entered.occurred_at);
  const departedAt = new Date(input.occurred_at);
  const dwellMinutes = Math.max(0, Math.round((departedAt.getTime() - arrivedAt.getTime()) / 60000));
  if (dwellMinutes < thresholdMinutes()) return false;

  await client.query(
    `
      INSERT INTO compliance.dot_inspection_events (
        operating_company_id,
        unit_id,
        driver_id,
        station_geofence_id,
        arrived_at,
        departed_at,
        dwell_minutes,
        follow_up_state,
        follow_up_by_user_uuid
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::uuid,
        $5::timestamptz,
        $6::timestamptz,
        $7::int,
        'open',
        NULL
      )
      ON CONFLICT (operating_company_id, station_geofence_id, unit_id, arrived_at, departed_at) DO NOTHING
    `,
    [
      input.operating_company_id,
      input.unit_id,
      input.driver_id ?? entered.driver_id ?? null,
      input.geofence_id,
      entered.occurred_at,
      input.occurred_at,
      dwellMinutes,
    ]
  );
  return true;
}
