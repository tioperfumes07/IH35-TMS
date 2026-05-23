type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type AutoStatusInput = {
  operating_company_id: string;
  unit_id: string;
  occurred_at: string;
  speed_mph: number | null;
  engine_on: boolean | null;
};

export type StatusSuggestion =
  | { suggested_to: "in_transit" | "at_pickup" | "at_delivery"; reason: string }
  | null;

type ActiveLoadRow = {
  load_id: string;
  current_status: string;
  driver_id: string | null;
  next_stop_type: "pickup" | "delivery" | null;
};

type LastGeofenceEventRow = {
  event_kind: "entered" | "exited";
  occurred_at: string;
};

export function suggestStatusTransition(input: {
  current_status: string;
  engine_on: boolean | null;
  speed_mph: number | null;
  geofence_event_kind: "entered" | "exited" | null;
  geofence_idle_minutes: number;
  next_stop_type: "pickup" | "delivery" | null;
}): StatusSuggestion {
  const moving = Boolean(input.engine_on) && (input.speed_mph ?? 0) > 5;
  const idleAtStop = input.geofence_event_kind === "entered" && input.geofence_idle_minutes >= 5;

  if ((input.current_status === "assigned" || input.current_status === "dispatched") && moving) {
    return { suggested_to: "in_transit", reason: "Movement detected (engine on + speed > 5 mph)." };
  }
  if (input.current_status === "in_transit" && idleAtStop) {
    if (input.next_stop_type === "delivery") {
      return { suggested_to: "at_delivery", reason: "Entered geofence and idled > 5m at delivery stop." };
    }
    return { suggested_to: "at_pickup", reason: "Entered geofence and idled > 5m at stop." };
  }
  if ((input.current_status === "at_pickup" || input.current_status === "at_delivery") && input.geofence_event_kind === "exited") {
    return { suggested_to: "in_transit", reason: "Departing stop geofence." };
  }
  return null;
}

async function fetchActiveLoad(client: DbClient, input: AutoStatusInput): Promise<ActiveLoadRow | null> {
  const res = await client.query<ActiveLoadRow>(
    `
      SELECT
        l.id::text AS load_id,
        l.status::text AS current_status,
        COALESCE(l.assigned_primary_driver_id, l.assigned_secondary_driver_id)::text AS driver_id,
        (
          SELECT s.stop_type::text
          FROM mdata.load_stops s
          WHERE s.load_id = l.id
            AND s.status::text = 'pending'
          ORDER BY s.sequence_number ASC
          LIMIT 1
        )::text AS next_stop_type
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.assigned_unit_id = $2::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status::text IN ('assigned', 'dispatched', 'in_transit', 'at_pickup', 'at_delivery')
      ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC
      LIMIT 1
    `,
    [input.operating_company_id, input.unit_id]
  );
  return res.rows[0] ?? null;
}

async function fetchLastGeofenceEvent(client: DbClient, input: AutoStatusInput): Promise<LastGeofenceEventRow | null> {
  const res = await client.query<LastGeofenceEventRow>(
    `
      SELECT
        ge.event_kind::text,
        ge.occurred_at::text
      FROM geo.geofence_events ge
      WHERE ge.operating_company_id = $1::uuid
        AND ge.unit_id = $2::uuid
      ORDER BY ge.occurred_at DESC, ge.created_at DESC
      LIMIT 1
    `,
    [input.operating_company_id, input.unit_id]
  );
  return res.rows[0] ?? null;
}

export async function processAutoStatusSuggestionForVehicleEvent(client: DbClient, input: AutoStatusInput): Promise<boolean> {
  const load = await fetchActiveLoad(client, input);
  if (!load) return false;

  const geofence = await fetchLastGeofenceEvent(client, input);
  const idleMinutes =
    geofence?.event_kind === "entered"
      ? Math.max(0, Math.floor((new Date(input.occurred_at).getTime() - new Date(geofence.occurred_at).getTime()) / 60000))
      : 0;

  const suggestion = suggestStatusTransition({
    current_status: load.current_status,
    engine_on: input.engine_on,
    speed_mph: input.speed_mph,
    geofence_event_kind: geofence?.event_kind ?? null,
    geofence_idle_minutes: idleMinutes,
    next_stop_type: load.next_stop_type,
  });
  if (!suggestion) return false;

  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM dispatch.auto_status_suggestions s
      WHERE s.operating_company_id = $1::uuid
        AND s.load_id = $2::uuid
        AND s.suggested_from = $3
        AND s.suggested_to = $4
        AND s.suggested_at >= now() - interval '30 minutes'
      LIMIT 1
    `,
    [input.operating_company_id, load.load_id, load.current_status, suggestion.suggested_to]
  );
  if (existing.rows[0]) return false;

  await client.query(
    `
      INSERT INTO dispatch.auto_status_suggestions (
        operating_company_id,
        load_id,
        unit_id,
        driver_id,
        suggested_from,
        suggested_to,
        reason
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7)
    `,
    [input.operating_company_id, load.load_id, input.unit_id, load.driver_id, load.current_status, suggestion.suggested_to, suggestion.reason]
  );
  return true;
}
