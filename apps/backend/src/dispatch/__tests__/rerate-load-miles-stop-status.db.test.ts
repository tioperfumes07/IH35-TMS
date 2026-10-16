/**
 * LEAD 443.157 — real Postgres: rerateLoadMilesFromStops filtered stops with COALESCE(s.status, 'active') <> 'cancelled';
 * 'active' is not a mdata.stop_status_enum value, so EVERY call failed "invalid input value for enum" — an Owner
 * lock-override that touched stops (prod: 13544 / 13563, invoice # 28 / # 46) could never complete. Fails on the old code.
 * Fixtures under an isolated company — never the shared company, never production.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { createIsolatedOperatingCompany, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { rerateLoadMilesFromStops } from "../owner-lock-override-propagation.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("rerateLoadMilesFromStops reads stops without an invalid enum literal (443.157, real Postgres)", () => {
  it("runs on a load with two coordinated stops (old code: invalid input value for enum stop_status_enum: \"active\")", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: co } = await createIsolatedOperatingCompany({ codePrefix: "RRS", legalNamePrefix: "443.157 rerate stop status" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [co]);
      const trailerType = await prepareCompanyForLoadInserts(db, co);
      const tag = `RRS${Date.now().toString(36).toUpperCase()}`;
      const customer = (await db.query<{ id: string }>(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [co, `${tag} customer`])).rows[0]!.id;
      const load = (await db.query<{ id: string }>(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`, [co, `${tag}L`, customer, TEST_OWNER_USER_ID, trailerType])).rows[0]!.id;
      for (const [seq, type] of [[1, "pickup"], [2, "delivery"]] as const) {
        await db.query(
          `INSERT INTO mdata.load_stops (operating_company_id, load_id, sequence_number, stop_type, city, state, country, scheduled_arrival_at, latitude, longitude)
           VALUES ($1, $2, $3, $4, 'Laredo', 'TX', 'US', now(), 27.5306, -99.4803)`, [co, load, seq, type]);
      }
      const out = await rerateLoadMilesFromStops(db as never, { loadId: load, operatingCompanyId: co });
      expect(out).toHaveProperty("detail");
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.end();
    }
  }, 60_000);
});
