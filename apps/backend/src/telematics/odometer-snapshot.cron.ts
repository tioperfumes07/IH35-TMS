/**
 * ENGINE: daily odometer snapshot
 * SCHEDULE: 0 3 * * *
 * WRITES: telematics.odometer_readings
 * IDEMPOTENCY: ADVISORY LOCK pg_try_advisory_xact_lock('telematics.odometer_snapshot') for the tick; UNIQUE(operating_company_id, unit_id, reading day, source) + UNIQUE(unit_id, read_at, source) ON CONFLICT DO NOTHING (every unique index arbitrates)
 * OVERLAP: the twin tick fails the lock and skips; a rerun inserts 0 (ROUND 330.7 overlap proof — the single-arbiter form failed the whole tick with 23505 on the second key, 10-01 and 10-02 on prod)
 * (ROUND 329 standard — docs/specs/ENGINE-HEADER-TEMPLATE.md)
 */
/**
 * ROUND 297.1 J-1 — daily odometer snapshot, one row per unit, written from
 * telematics.vehicle_latest_position -- NOT a new Samsara call. The odometer already arrives with
 * every position poll (see samsara-client.ts's obdOdometerMeters stat); a second pull would pay
 * twice for a number this system already holds.
 *
 * MEASURED LIVE before writing this (br-fancy-credit-akjnd07a): 177,906 historical
 * telematics.odometer_readings rows, 38 units, last read_at 2026-08-26, and ZERO writers of that
 * table anywhere in the repo -- this cron is the first one.
 *
 * GAP RULE: a unit with a position row but odometer_mi IS NULL still gets a row here --
 * odometer_miles NULL, confidence='suggested' -- the gap is RECORDED, never skipped, never
 * interpolated. A unit with NO position row at all (never polled) is left out of this run; there is
 * no honest read_at to stamp it with, and every unit measured live already has a position row.
 *
 * IDEMP: unique on (operating_company_id, unit_id, telematics.odometer_reading_day(read_at),
 * source) -- see migration
 * 202614820000_odometer_readings_gap_rows_and_date_grain_idemp.sql. ON CONFLICT DO NOTHING so a
 * re-run on the same day (a missed tick retried, a manual re-trigger) never duplicates.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { tryXactSingleFlight } from "../lib/single-flight.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type OdometerSnapshotTenantResult = {
  units_written: number;
  units_gap: number;
};

async function listActiveCompanyIds(client: DbClient): Promise<string[]> {
  const res = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
  );
  return res.rows.map((r) => r.id);
}

async function snapshotOdometersForTenant(
  client: DbClient,
  operatingCompanyId: string
): Promise<OdometerSnapshotTenantResult> {
  const rows = await client.query<{ unit_id: string; captured_at: string | null; odometer_mi: string | null }>(
    `
      SELECT
        u.id::text AS unit_id,
        vlp.captured_at::text AS captured_at,
        vlp.odometer_mi::text AS odometer_mi
      FROM mdata.units u
      LEFT JOIN telematics.vehicle_latest_position vlp ON vlp.unit_id = u.id
      WHERE u.deactivated_at IS NULL
        AND COALESCE(u.is_sample_data, false) = false
        AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
        AND vlp.captured_at IS NOT NULL
    `,
    [operatingCompanyId]
  );

  let unitsWritten = 0;
  let unitsGap = 0;

  for (const row of rows.rows) {
    const odometerMi = row.odometer_mi != null ? Number(row.odometer_mi) : null;
    const isGap = odometerMi == null || !Number.isFinite(odometerMi);
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO telematics.odometer_readings (
          operating_company_id, unit_id, read_at, odometer_miles, source, confidence
        )
        VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, 'samsara', $5)
        -- ROUND 330.7: no conflict target — BOTH unique keys arbitrate (the per-day key
        -- odometer_readings_oci_unit_date_source_key and the per-instant key odometer_readings_unit_id_read_at_source_key).
        -- With only the per-day key named, a concurrent twin insert of the same reading tripped the per-instant key,
        -- raised 23505 and rolled back every unit's snapshot (prod 2026-10-01 and 2026-10-02 08:00Z, both instances).
        ON CONFLICT DO NOTHING
        RETURNING id
      `,
      [operatingCompanyId, row.unit_id, row.captured_at, isGap ? null : odometerMi, isGap ? "suggested" : "measured"]
    );
    if (res.rows.length === 0) continue; // already snapshotted today, idempotent no-op
    if (isGap) unitsGap += 1;
    else unitsWritten += 1;
  }

  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    "telematics.odometer_snapshot",
    "info",
    JSON.stringify({
      operating_company_id: operatingCompanyId,
      units_written: unitsWritten,
      units_gap: unitsGap,
      as_of: new Date().toISOString(),
    }),
    "ODOMETER-SNAPSHOT-CRON-1",
  ]);

  return { units_written: unitsWritten, units_gap: unitsGap };
}

export async function runOdometerSnapshotCronTick(): Promise<void> {
  await withLuciaBypass(async (client) => {
    // ROUND 330.7: one snapshot pass per slot across both instances.
    if (!(await tryXactSingleFlight(client, "telematics.odometer_snapshot"))) return;
    const companyIds = await listActiveCompanyIds(client as DbClient);
    for (const operatingCompanyId of companyIds) {
      assertTenantContext(operatingCompanyId, "telematics.odometer_snapshot_cron");
      // membership-scope-exempt: internally-iterated-active-company
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      await snapshotOdometersForTenant(client as DbClient, operatingCompanyId);
    }
  });
}

let initialized = false;

export function initializeOdometerSnapshotCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.ENABLE_ODOMETER_SNAPSHOT_CRON === "false") {
    app.log.info("Odometer snapshot cron disabled via ENABLE_ODOMETER_SNAPSHOT_CRON=false");
    return;
  }

  cron.schedule(
    "0 3 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "telematics.odometer_snapshot_cron",
        async () => {
          await runOdometerSnapshotCronTick();
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Odometer snapshot cron scheduled (daily 03:00 America/Chicago)");
}
