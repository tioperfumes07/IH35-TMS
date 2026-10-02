/**
 * CC-3 queue 2c (2026-10-02) — the ONE manual writer of telematics.odometer_readings. Both the manual-odometer route and
 * the maintenance service-history backfill call this, so a second manual reading for the same unit and day updates the
 * day's row instead of colliding with the day-unique index (operating_company_id, unit_id, day, source) — which the
 * backfill's plain INSERT did (23505 on the second PM backfilled for one unit on one service date).
 */
type Q = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };

export async function upsertManualOdometerReading(
  client: Q,
  input: { operatingCompanyId: string; unitId: string; readAt: string; odometerMiles: number; recordedByUserId: string }
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `
      INSERT INTO telematics.odometer_readings (
        operating_company_id, unit_id, read_at, odometer_miles, source, confidence, recorded_by_user_id
      )
      VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, 'manual', 'entered', $5::uuid)
      ON CONFLICT (operating_company_id, unit_id, telematics.odometer_reading_day(read_at), source)
        WHERE read_at >= '2026-09-30T00:00:00Z'::timestamptz
      DO UPDATE
      SET odometer_miles = EXCLUDED.odometer_miles,
          read_at = EXCLUDED.read_at,
          recorded_by_user_id = EXCLUDED.recorded_by_user_id,
          updated_at = now()
      RETURNING id::text
    `,
    [input.operatingCompanyId, input.unitId, input.readAt, input.odometerMiles, input.recordedByUserId]
  );
  return r.rows[0]!.id;
}
