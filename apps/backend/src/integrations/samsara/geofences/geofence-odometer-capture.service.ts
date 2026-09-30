type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type OdometerSource = "real_obd" | "interpolated" | "absent";

export type GeofenceOdometerCapture = {
  id: string;
  geofence_event_id: string;
  unit_id: string;
  geofence_id: string;
  geofence_kind: string;
  event_kind: "entered" | "exited";
  occurred_at: string;
  odometer_mi: number | null;
  odometer_source: OdometerSource;
  odometer_reading_at: string | null;
};

export type GeofenceOdometerCaptureStatus = {
  events: number;
  captures: number;
  real_obd: number;
  interpolated: number;
  absent: number;
  newest_capture_at: string | null;
};

/** How close a single reading must be to the event to count as a REAL (not interpolated) read. */
const REAL_OBD_TOLERANCE_SECONDS = 120;

/**
 * T-21 (owner order, 2026-09-30): capture the unit's odometer at EVERY geofence crossing --
 * Love's/other fuel stops, DOT/scale, customer site (pickup/delivery), yard -- idempotent per
 * geo.geofence_events row (UNIQUE geofence_event_id, ON CONFLICT DO NOTHING; replaying the feed
 * can never double-count or double-write).
 *
 * SOURCE IS NEVER GUESSED: a reading within REAL_OBD_TOLERANCE_SECONDS of the crossing is
 * 'real_obd'; two real readings bracketing the crossing (one before, one after, arbitrarily far
 * apart) are linearly interpolated and labelled 'interpolated'; anything else writes the event
 * with odometer_mi = NULL and odometer_source = 'absent' -- an honest "we do not know" row, not a
 * skipped event. Matches the mpg_method pattern already established on company settlements.
 */
export async function captureGeofenceOdometerEvents(
  client: QueryClient,
  input: { operatingCompanyId: string }
): Promise<GeofenceOdometerCapture[]> {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);
  const result = await client.query<GeofenceOdometerCapture>(
    `
    INSERT INTO telematics.geofence_odometer_captures
      (operating_company_id, geofence_event_id, unit_id, geofence_id, geofence_kind,
       event_kind, occurred_at, odometer_mi, odometer_source, odometer_reading_at)
    SELECT
      ge.operating_company_id,
      ge.id,
      ge.unit_id,
      ge.geofence_id,
      gf.location_kind,
      ge.event_kind,
      ge.occurred_at,
      CASE
        WHEN nearest.mi IS NOT NULL
             AND abs(extract(epoch FROM (nearest.captured_at - ge.occurred_at))) <= ${REAL_OBD_TOLERANCE_SECONDS}
          THEN nearest.mi
        WHEN before_r.mi IS NOT NULL AND after_r.mi IS NOT NULL THEN
          before_r.mi + (after_r.mi - before_r.mi) *
            (extract(epoch FROM (ge.occurred_at - before_r.captured_at))
             / NULLIF(extract(epoch FROM (after_r.captured_at - before_r.captured_at)), 0))
        ELSE NULL
      END AS odometer_mi,
      CASE
        WHEN nearest.mi IS NOT NULL
             AND abs(extract(epoch FROM (nearest.captured_at - ge.occurred_at))) <= ${REAL_OBD_TOLERANCE_SECONDS}
          THEN 'real_obd'
        WHEN before_r.mi IS NOT NULL AND after_r.mi IS NOT NULL THEN 'interpolated'
        ELSE 'absent'
      END AS odometer_source,
      COALESCE(nearest.captured_at, before_r.captured_at, after_r.captured_at) AS odometer_reading_at
    FROM geo.geofence_events ge
    JOIN geo.geofences gf ON gf.id = ge.geofence_id
    LEFT JOIN LATERAL (
      SELECT vl.odometer_mi AS mi, vl.captured_at
      FROM telematics.vehicle_locations vl
      WHERE vl.unit_id = ge.unit_id
        AND vl.odometer_mi IS NOT NULL
        AND vl.captured_at BETWEEN ge.occurred_at - interval '${REAL_OBD_TOLERANCE_SECONDS} seconds'
                                AND ge.occurred_at + interval '${REAL_OBD_TOLERANCE_SECONDS} seconds'
      ORDER BY abs(extract(epoch FROM (vl.captured_at - ge.occurred_at))) ASC
      LIMIT 1
    ) nearest ON true
    LEFT JOIN LATERAL (
      SELECT vl.odometer_mi AS mi, vl.captured_at
      FROM telematics.vehicle_locations vl
      WHERE vl.unit_id = ge.unit_id AND vl.odometer_mi IS NOT NULL AND vl.captured_at <= ge.occurred_at
      ORDER BY vl.captured_at DESC LIMIT 1
    ) before_r ON true
    LEFT JOIN LATERAL (
      SELECT vl.odometer_mi AS mi, vl.captured_at
      FROM telematics.vehicle_locations vl
      WHERE vl.unit_id = ge.unit_id AND vl.odometer_mi IS NOT NULL AND vl.captured_at >= ge.occurred_at
      ORDER BY vl.captured_at ASC LIMIT 1
    ) after_r ON true
    WHERE ge.operating_company_id = $1::uuid
      AND NOT EXISTS (
        SELECT 1 FROM telematics.geofence_odometer_captures c WHERE c.geofence_event_id = ge.id
      )
    ON CONFLICT (geofence_event_id) DO NOTHING
    RETURNING id, geofence_event_id, unit_id, geofence_id, geofence_kind, event_kind,
              occurred_at::text, odometer_mi, odometer_source, odometer_reading_at::text
    `,
    [input.operatingCompanyId]
  );
  return result.rows;
}

export async function getGeofenceOdometerCaptureStatus(
  client: QueryClient,
  operatingCompanyId: string
): Promise<GeofenceOdometerCaptureStatus> {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
  const result = await client.query<{
    events: string | number;
    captures: string | number;
    real_obd: string | number;
    interpolated: string | number;
    absent: string | number;
    newest_capture_at: string | null;
  }>(
    `SELECT
       (SELECT count(*) FROM geo.geofence_events WHERE operating_company_id = $1::uuid) AS events,
       (SELECT count(*) FROM telematics.geofence_odometer_captures WHERE operating_company_id = $1::uuid) AS captures,
       (SELECT count(*) FROM telematics.geofence_odometer_captures WHERE operating_company_id = $1::uuid AND odometer_source = 'real_obd') AS real_obd,
       (SELECT count(*) FROM telematics.geofence_odometer_captures WHERE operating_company_id = $1::uuid AND odometer_source = 'interpolated') AS interpolated,
       (SELECT count(*) FROM telematics.geofence_odometer_captures WHERE operating_company_id = $1::uuid AND odometer_source = 'absent') AS absent,
       (SELECT max(occurred_at)::text FROM telematics.geofence_odometer_captures WHERE operating_company_id = $1::uuid) AS newest_capture_at`,
    [operatingCompanyId]
  );
  const row = result.rows[0];
  return {
    events: Number(row?.events ?? 0),
    captures: Number(row?.captures ?? 0),
    real_obd: Number(row?.real_obd ?? 0),
    interpolated: Number(row?.interpolated ?? 0),
    absent: Number(row?.absent ?? 0),
    newest_capture_at: row?.newest_capture_at ?? null,
  };
}
