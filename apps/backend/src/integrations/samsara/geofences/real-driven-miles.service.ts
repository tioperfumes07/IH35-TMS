type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type SegmentKind = "deadhead_to_pickup" | "loaded" | "empty_home" | "fuel_detour";

export function classifySegmentKind(fromStopType: string, toStopType: string): SegmentKind {
  if (toStopType === "fuel") return "fuel_detour";
  if (toStopType === "pickup") return "deadhead_to_pickup";
  if (fromStopType === "delivery") return "empty_home";
  return "loaded";
}

/**
 * Materialize one completed inter-stop leg when the assigned unit enters the next stop fence.
 * The start is the preceding stop's exit odometer and the end is this stop's entry odometer.
 * Missing/non-monotonic readings fail closed: we never manufacture real miles from planned miles.
 */
export async function recordCompletedLoadLeg(
  client: QueryClient,
  input: {
    operatingCompanyId: string;
    loadId: string;
    unitId: string;
    toStopId: string;
    endedAt: string;
    odometerEndMi: number | null;
  }
): Promise<{ recorded: boolean; reason?: string }> {
  if (input.odometerEndMi == null || !Number.isFinite(input.odometerEndMi)) {
    return { recorded: false, reason: "entry_odometer_missing" };
  }

  const leg = await client.query<{
    from_stop_id: string;
    to_stop_id: string;
    from_stop_type: string;
    to_stop_type: string;
    started_at: string | null;
    odometer_start_mi: number | null;
  }>(
    `WITH current_stop AS (
       SELECT id, load_id, sequence_number, stop_type::text
       FROM mdata.load_stops
       WHERE id = $4::uuid AND load_id = $2::uuid AND soft_deleted_at IS NULL
     ), previous_stop AS (
       SELECT ps.id, ps.stop_type::text
       FROM mdata.load_stops ps
       JOIN current_stop cs ON cs.load_id = ps.load_id
       WHERE ps.soft_deleted_at IS NULL AND ps.sequence_number < cs.sequence_number
       ORDER BY ps.sequence_number DESC
       LIMIT 1
     )
     SELECT ps.id::text AS from_stop_id,
            cs.id::text AS to_stop_id,
            ps.stop_type AS from_stop_type,
            cs.stop_type AS to_stop_type,
            gvs.departed_at::text AS started_at,
            gvs.odometer_at_exit_mi
     FROM current_stop cs
     JOIN previous_stop ps ON true
     JOIN geo.geofence_vehicle_state gvs
       ON gvs.operating_company_id = $1::uuid
      AND gvs.load_id = $2::uuid
      AND gvs.unit_id = $3::uuid
      AND gvs.stop_id = ps.id
     LIMIT 1`,
    [input.operatingCompanyId, input.loadId, input.unitId, input.toStopId]
  );
  const row = leg.rows[0];
  if (!row?.started_at || row.odometer_start_mi == null) {
    return { recorded: false, reason: "previous_exit_odometer_missing" };
  }
  const start = Number(row.odometer_start_mi);
  if (!Number.isFinite(start) || input.odometerEndMi < start) {
    return { recorded: false, reason: "odometer_non_monotonic" };
  }

  await client.query(
    `INSERT INTO telematics.load_odometer_segments (
       operating_company_id, load_id, unit_id, segment_kind,
       from_stop_id, to_stop_id, started_at, ended_at,
       odometer_start_mi, odometer_end_mi
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid,
               $7::timestamptz, $8::timestamptz, $9, $10)
     ON CONFLICT (operating_company_id, load_id, unit_id, segment_kind, started_at)
     DO UPDATE SET
       to_stop_id = EXCLUDED.to_stop_id,
       ended_at = EXCLUDED.ended_at,
       odometer_end_mi = EXCLUDED.odometer_end_mi`,
    [
      input.operatingCompanyId,
      input.loadId,
      input.unitId,
      classifySegmentKind(row.from_stop_type, row.to_stop_type),
      row.from_stop_id,
      row.to_stop_id,
      row.started_at,
      input.endedAt,
      start,
      input.odometerEndMi,
    ]
  );
  return { recorded: true };
}

export async function listRealDrivenMilesForLoad(
  client: QueryClient,
  operatingCompanyId: string,
  loadId: string
) {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
  const result = await client.query<{
    load_id: string;
    practical_miles: string | null;
    short_miles: string | null;
    real_driven_miles: string;
    segments: unknown;
  }>(
    `SELECT l.id::text AS load_id,
            l.miles_practical::text AS practical_miles,
            l.miles_shortest::text AS short_miles,
            COALESCE(SUM(s.driven_miles), 0)::text AS real_driven_miles,
            COALESCE(jsonb_agg(jsonb_build_object(
              'segment_id', s.id,
              'kind', s.segment_kind,
              'unit_id', s.unit_id,
              'from_stop_id', s.from_stop_id,
              'to_stop_id', s.to_stop_id,
              'started_at', s.started_at,
              'ended_at', s.ended_at,
              'odometer_start_mi', s.odometer_start_mi,
              'odometer_end_mi', s.odometer_end_mi,
              'real_driven_miles', s.driven_miles
            ) ORDER BY s.started_at) FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb) AS segments
     FROM mdata.loads l
     LEFT JOIN telematics.load_odometer_segments s
       ON s.load_id = l.id AND s.operating_company_id = l.operating_company_id
     WHERE l.id = $2::uuid
       AND l.operating_company_id = $1::uuid
       AND l.soft_deleted_at IS NULL
     GROUP BY l.id, l.miles_practical, l.miles_shortest`,
    [operatingCompanyId, loadId]
  );
  return result.rows[0] ?? null;
}
