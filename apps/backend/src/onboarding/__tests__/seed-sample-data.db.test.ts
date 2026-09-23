/**
 * E6 (Lead ruling, 2026-09-22 / Round 84): seedSampleData's ensureLoad was rewired from a direct
 * INSERT INTO mdata.loads (via a dynamic toInsertParts/columns dance) to the ONE shared create
 * path, createLoadWithFullSideEffects (source="historical_backfill" -- this is synthetic demo
 * data, not a real live dispatch event, so it gets the softer record-not-block gate shape).
 * Real Postgres round-trip, same convention as every other `.db.test.ts` in this repo
 * (book-load-zero-dollar-dispatch-gate.db.test.ts is the sibling this file's fixture shape is
 * modeled on).
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { seedSampleData } from "../seed-sample-data.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("seedSampleData -> the shared create path (E6)", () => {
  let db: pg.Client;
  let companyId: string;

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    companyId = await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    await db.query("BEGIN");
    await prepareCompanyForLoadInserts(db, companyId);
    await db.query("COMMIT");
  }, 30_000);

  afterAll(async () => {
    await db?.end();
  });

  it("creates the sample load through createLoadWithFullSideEffects, with real stops, and is idempotent on re-run", async () => {
    // seedSampleData manages its own BEGIN/COMMIT internally (it always has -- this predates
    // the E6 rewire), so this test cannot wrap it in an outer transaction/savepoint the way the
    // sibling `.db.test.ts` files do. Cleanup runs auto-committed before and after; this is safe
    // only because `.db.test.ts` files run exclusively against CI's ephemeral, torn-down-after
    // Postgres, never production (see file header).
    const cleanup = async () => {
      await db.query(
        `DELETE FROM mdata.load_stops WHERE load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = 'LD-SAMPLE-001')`,
        [companyId]
      );
      await db.query(`DELETE FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = 'LD-SAMPLE-001'`, [companyId]);
    };
    await cleanup();
    try {
      const first = await seedSampleData(db, { operatingCompanyId: companyId, actorUserId: TEST_OWNER_USER_ID });
      expect(first.created.load).toBe(true);

      const loadRow = await db.query<{ status: string; is_sample_data: boolean }>(
        `SELECT status, is_sample_data FROM mdata.loads WHERE id = $1`,
        [first.load_id]
      );
      expect(loadRow.rows[0]?.status).toBe("draft");
      expect(loadRow.rows[0]?.is_sample_data).toBe(true);

      const stops = await db.query<{ stop_type: string; city: string | null }>(
        `SELECT stop_type, city FROM mdata.load_stops WHERE load_id = $1 ORDER BY sequence_number`,
        [first.load_id]
      );
      expect(stops.rows).toEqual([
        { stop_type: "pickup", city: "Laredo" },
        { stop_type: "delivery", city: "San Antonio" },
      ]);

      // Idempotent re-run: same load_id, created:false, no duplicate row.
      const second = await seedSampleData(db, { operatingCompanyId: companyId, actorUserId: TEST_OWNER_USER_ID });
      expect(second.created.load).toBe(false);
      expect(second.load_id).toBe(first.load_id);

      const count = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = 'LD-SAMPLE-001'`,
        [companyId]
      );
      expect(count.rows[0]?.n).toBe("1");
    } finally {
      await cleanup();
    }
  });
});
