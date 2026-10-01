/**
 * The ONE odometer source for every PM consumer (ORDERS 2026-10-01: E-14 row 1, E-15 row 2) -- the PM
 * auto-WO cron, the PM due engine, and Maintenance Home's /maint/pm/due all read this, never their own.
 *
 * Order, nothing else:
 *   1. telematics.unit_stop_events -- latest stop that carried an odometer (E-03, the Lead's persisted
 *      stop engine). Feature-detected: until that table is live this tier no-ops ("E-03 pending").
 *   2. telematics.odometer_readings -- the E-06 daily snapshot ledger, latest measured/entered row.
 *   3. ABSENT -- the caller states the reason. Never 0, never interpolated, never guessed.
 * Snapshot and stop odometers are the same Samsara stat (obdOdometerMeters): 0.0 mi apart at the same
 * instant on every sample measured 2026-10-01.
 */
type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type PmOdometerSource = "unit_stop_events" | "odometer_readings";

export type PmOdometer = {
  odometer: number;
  source: PmOdometerSource;
  read_at: string | null;
};

export async function loadPmOdometers(
  client: DbClient,
  operatingCompanyId: string,
  unitIds: string[]
): Promise<{ byUnit: Map<string, PmOdometer>; stopEventsLive: boolean }> {
  const byUnit = new Map<string, PmOdometer>();
  const live = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('telematics.unit_stop_events') IS NOT NULL AS ok`
  );
  const stopEventsLive = Boolean(live.rows[0]?.ok);
  if (unitIds.length === 0) return { byUnit, stopEventsLive };

  if (stopEventsLive) {
    const stops = await client.query<{ unit_id: string; odometer_mi: number | string; read_at: string | null }>(
      `
        SELECT DISTINCT ON (unit_id)
          unit_id::text AS unit_id, odometer_mi, COALESCE(odometer_read_at, started_at)::text AS read_at
        FROM telematics.unit_stop_events
        WHERE unit_id = ANY($1::uuid[])
          AND odometer_mi IS NOT NULL
          AND COALESCE(odometer_note, '') <> 'ABSENT'
        ORDER BY unit_id, started_at DESC
      `,
      [unitIds]
    );
    for (const row of stops.rows) {
      const odo = Number(row.odometer_mi);
      if (Number.isFinite(odo)) byUnit.set(row.unit_id, { odometer: odo, source: "unit_stop_events", read_at: row.read_at });
    }
  }

  const snapshot = await client.query<{ unit_id: string; odometer_miles: number | string; read_at: string }>(
    `
      SELECT DISTINCT ON (unit_id) unit_id::text AS unit_id, odometer_miles, read_at::text AS read_at
      FROM telematics.odometer_readings
      WHERE operating_company_id = $1::uuid
        AND unit_id = ANY($2::uuid[])
        AND confidence IN ('measured', 'entered')
        AND odometer_miles IS NOT NULL
      ORDER BY unit_id, read_at DESC
    `,
    [operatingCompanyId, unitIds]
  );
  for (const row of snapshot.rows) {
    if (byUnit.has(row.unit_id)) continue;
    const odo = Number(row.odometer_miles);
    if (Number.isFinite(odo)) byUnit.set(row.unit_id, { odometer: odo, source: "odometer_readings", read_at: row.read_at });
  }
  return { byUnit, stopEventsLive };
}

/** Why a unit has no odometer -- the ABSENT tier, worded once for every consumer. */
export function absentOdometerReason(stopEventsLive: boolean): string {
  return stopEventsLive
    ? "ABSENT: no odometer in telematics.unit_stop_events or telematics.odometer_readings"
    : "ABSENT: E-03 pending (telematics.unit_stop_events not live) and no odometer in telematics.odometer_readings";
}
