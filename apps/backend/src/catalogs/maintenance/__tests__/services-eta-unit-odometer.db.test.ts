/**
 * services/eta odometer query — real-schema guard (real Postgres)
 *
 * GET /api/v1/maintenance/services/eta 500'd: it read `hub_meter_current FROM mdata.units` — both
 * hub_meter_current AND operating_company_id are phantom on mdata.units (verified vs prod-copy schema), and
 * mdata.units has NO odometer column at all. The unit's current odometer lives in
 * telematics.vehicle_latest_position (odometer_mi, keyed by unit_id + operating_company_id). This test RUNS
 * the FIXED query against migrated CI Postgres so a phantom column on that relation fails CI. (No seed: a
 * 42703 is a parse/plan error that fires even with zero rows — running the query is the guard.) Harness from
 * accounting/__tests__/bill-expense-lines-rls.db.test.ts.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("services/eta odometer (telematics.vehicle_latest_position, real schema)", () => {
  let db: pg.Client;
  let companyId: string;

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
  });

  afterAll(async () => {
    if (db) await db.end().catch(() => {});
  });

  it("runs the FIXED odometer query against real schema (no phantom-column 42703)", async () => {
    // Must resolve odometer_mi + unit_id + operating_company_id on telematics.vehicle_latest_position.
    const res = await db.query<{ hub_meter_current: number | null }>(
      "SELECT odometer_mi AS hub_meter_current FROM telematics.vehicle_latest_position WHERE unit_id = $1 AND operating_company_id = $2 LIMIT 1",
      [randomUUID(), companyId]
    );
    expect(Array.isArray(res.rows)).toBe(true); // executed; relation + columns all real (would 42703 otherwise)
  });

  it("CONFIRMS the old phantom columns are absent on mdata.units (regression anchor)", async () => {
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='mdata' AND table_name='units'
         AND column_name IN ('hub_meter_current','operating_company_id')`
      // odometer_mi intentionally omitted: it is a REAL column added by migration
      // 202606280001_mdata_units_odometer_mi.sql — not phantom.
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual([]); // hub_meter_current + operating_company_id still phantom
  });
});
