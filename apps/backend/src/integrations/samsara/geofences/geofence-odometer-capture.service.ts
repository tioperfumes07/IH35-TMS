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
 * 'real_obd'; anything else writes the event with odometer_mi = NULL and odometer_source =
 * 'absent' -- an honest "we do not know" row, not a skipped event. ROUND 306 E-04 (R-02): the
 * former 'interpolated' branch is gone; 'interpolated' stays in the type only because 615 historic
 * rows carry it, and every reader (driven-miles-legs) already treats them as no reading.
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
      -- ROUND 306 E-04 / R-02: READ or ABSENT. The old middle branch computed a value between the
      -- readings before and after the crossing (615 rows, source 'interpolated'); that is a computed
      -- odometer, which R-02 forbids. A crossing with no real read within the tolerance is ABSENT.
      CASE
        WHEN nearest.mi IS NOT NULL
             AND abs(extract(epoch FROM (nearest.captured_at - ge.occurred_at))) <= ${REAL_OBD_TOLERANCE_SECONDS}
          THEN nearest.mi
        ELSE NULL
      END AS odometer_mi,
      CASE
        WHEN nearest.mi IS NOT NULL
             AND abs(extract(epoch FROM (nearest.captured_at - ge.occurred_at))) <= ${REAL_OBD_TOLERANCE_SECONDS}
          THEN 'real_obd'
        ELSE 'absent'
      END AS odometer_source,
      nearest.captured_at AS odometer_reading_at
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

/**
 * ROUND 306 E-04 -> E-03 hand-off (REDUNDANCY R-1): a stop inside a fence carries BOTH the stop's
 * own odometer (E-03) and this engine's fence crossings, under one event. The crossings returned are
 * the ones that bound the SAME VISIT as the stop: the unit's last 'entered' of that fence at or before
 * the stop's end with no 'exited' of that fence in between, and its first 'exited' at or after the
 * stop's start with no new 'entered' in between. A visit with several stops (fuel, then park) gives
 * every stop the same pair. Never a crossing of another fence, never a computed odometer.
 */
export type StopFenceCrossing = { capture_id: string; occurred_at: string; odometer_mi: number | null; odometer_source: OdometerSource };
export type StopFenceCaptures = { entered: StopFenceCrossing | null; exited: StopFenceCrossing | null };

export async function loadFenceCapturesForStop(
  client: QueryClient,
  input: { operatingCompanyId: string; unitId: string; geofenceId: string; startedAt: Date; endedAt: Date }
): Promise<StopFenceCaptures> {
  const res = await client.query<{ event_kind: "entered" | "exited"; id: string; occurred_at: string; odometer_mi: string | null; odometer_source: OdometerSource }>(
    `(SELECT 'entered' AS event_kind, c.id::text, c.occurred_at::text, c.odometer_mi::text, c.odometer_source
        FROM telematics.geofence_odometer_captures c
       WHERE c.operating_company_id = $1::uuid AND c.unit_id = $2::uuid AND c.geofence_id = $3::uuid
         AND c.event_kind = 'entered'
         AND c.occurred_at <= $5::timestamptz
         AND NOT EXISTS (
           SELECT 1 FROM telematics.geofence_odometer_captures x
            WHERE x.operating_company_id = c.operating_company_id AND x.unit_id = c.unit_id AND x.geofence_id = c.geofence_id
              AND x.event_kind = 'exited' AND x.occurred_at > c.occurred_at AND x.occurred_at < $4::timestamptz)
       ORDER BY c.occurred_at DESC LIMIT 1)
     UNION ALL
     (SELECT 'exited', c.id::text, c.occurred_at::text, c.odometer_mi::text, c.odometer_source
        FROM telematics.geofence_odometer_captures c
       WHERE c.operating_company_id = $1::uuid AND c.unit_id = $2::uuid AND c.geofence_id = $3::uuid
         AND c.event_kind = 'exited'
         AND c.occurred_at >= $4::timestamptz
         AND NOT EXISTS (
           SELECT 1 FROM telematics.geofence_odometer_captures x
            WHERE x.operating_company_id = c.operating_company_id AND x.unit_id = c.unit_id AND x.geofence_id = c.geofence_id
              AND x.event_kind = 'entered' AND x.occurred_at > $5::timestamptz AND x.occurred_at < c.occurred_at)
       ORDER BY c.occurred_at ASC LIMIT 1)`,
    [input.operatingCompanyId, input.unitId, input.geofenceId, input.startedAt.toISOString(), input.endedAt.toISOString()]
  );
  const pick = (k: "entered" | "exited"): StopFenceCrossing | null => {
    const r = res.rows.find((x) => x.event_kind === k);
    if (!r) return null;
    // A legacy 'interpolated' row carries a computed number -- surface the crossing, never the number.
    const real = r.odometer_source === "real_obd" && r.odometer_mi != null;
    return { capture_id: r.id, occurred_at: r.occurred_at, odometer_mi: real ? Number(r.odometer_mi) : null, odometer_source: r.odometer_source };
  };
  return { entered: pick("entered"), exited: pick("exited") };
}
