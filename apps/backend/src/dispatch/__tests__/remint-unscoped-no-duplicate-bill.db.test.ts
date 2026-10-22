/**
 * LEAD 443.230 — prod 10-22 03:45Z: the remint routes open only withCurrentUser (no app.operating_company_id). driver_bills is
 * RLS-isolated on that setting, so the engine read NO existing bill and a second remint INSERTed a duplicate:
 * 23505 uniq_driver_bills_operating_company_bill_number (13697, rolled back). Real Postgres, as ih35_app (RLS on), no company
 * scope, no bypass — main: the second ensure throws 23505; branch: the engine scopes itself, still one bill. Rolled back.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationLoadId } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { ensureDriverBillArtifactsForLoad } from "../book-load.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("remint with no company scope never duplicates the driver bill (443.230, real Postgres)", () => {
  it("two engine runs under RLS with no app.operating_company_id leave exactly one bill", async () => {
    const fixtureLoadId = await ensureIntegrationLoadId();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const base = (await db.query<{ company: string; customer: string; trailer: string | null }>(
        `SELECT operating_company_id::text AS company, customer_id::text AS customer, load_trailer_equipment_id::text AS trailer
           FROM mdata.loads WHERE id = $1::uuid`, [fixtureLoadId])).rows[0]!;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [base.company]);
      const driver = randomUUID();
      await db.query(`INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone) VALUES ($1::uuid, $2::uuid, 'Rls', 'Remint', $3)`,
        [driver, base.company, `+1005${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`]);
      const loadId = (await db.query<{ id: string }>(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_primary_driver_id, miles_practical)
         VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6::uuid, 1200) RETURNING id::text`,
        [base.company, `R230-${randomUUID().slice(0, 6)}`, base.customer, TEST_OWNER_USER_ID, base.trailer, driver])).rows[0]!.id;
      // The remint route's context: the app role, RLS on, no bypass, no company scope.
      await db.query("SELECT set_config('app.bypass_rls', '', true)");
      await db.query("SELECT set_config('app.operating_company_id', '', true)");
      await db.query("SET LOCAL ROLE ih35_app");
      await db.query(`SELECT set_config('app.current_user_id', $1::text, true)`, [TEST_OWNER_USER_ID]); // withCurrentUser's own setting
      const ensure = async () => {
        await db.query("SELECT set_config('app.operating_company_id', '', true)"); // every remint request starts unscoped
        return ensureDriverBillArtifactsForLoad(db as never, { loadId, operatingCompanyId: base.company, actorUserId: TEST_OWNER_USER_ID });
      };
      expect((await ensure()).outcome).toBe("awaiting_short_miles");
      await db.query("SAVEPOINT second");
      const second = await ensure().catch((e: { code?: string }) => ({ outcome: `error ${e.code}` }));
      expect(second.outcome).not.toMatch(/error/); // main: "error 23505" (duplicate bill number)
      await db.query("RESET ROLE");
      await db.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
      const n = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM driver_finance.driver_bills WHERE load_id = $1::uuid`, [loadId])).rows[0]!.n;
      expect(n).toBe(1);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  }, 60_000);
});
