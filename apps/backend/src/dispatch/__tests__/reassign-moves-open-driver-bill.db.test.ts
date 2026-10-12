/**
 * LEAD 443.113 AJK-01 — real Postgres: reassigning a load to another driver at the SAME pay moves its open driver bill to
 * the new driver through the one driver-bill engine (ensureDriverBillArtifactsForLoad -> createDriverBillArtifacts).
 * Before, `totalBillCents === existingGross` returned already_exists before driver_id was ever read, so driver A kept
 * the bill for a load driver B now drives. A bill that is no longer open is refused by name, never silently moved.
 * ONE transaction, rolled back.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationLoadId } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { DriverBillReassignRefusedError, ensureDriverBillArtifactsForLoad } from "../book-load.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("reassign moves the open driver bill to the new driver (AJK-01, real Postgres)", () => {
  it("same-pay reassignment A -> B: the open bill carries B; a paid bill refuses to move", async () => {
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
           FROM mdata.loads WHERE id = $1::uuid`,
        [fixtureLoadId]
      )).rows[0]!;
      const company = base.company;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company]);
      const sfx = randomUUID().slice(0, 6);
      const driver = async (tag: string) => {
        const id = randomUUID();
        await db.query(
          `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone) VALUES ($1::uuid, $2::uuid, $3, 'AJK01', $4)`,
          [id, company, tag, `+1003${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`]
        );
        return id;
      };
      const driverA = await driver("A");
      const driverB = await driver("B");
      // A fresh load of its own (no earlier bill on it), priced by a per-load rate so A and B earn exactly the same.
      const loadId = (await db.query<{ id: string }>(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id,
                                  assigned_primary_driver_id, miles_shortest, miles_practical, driver_pay_rate_per_mile,
                                  driver_pay_rate_override_reason)
         VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6::uuid, 500, 520, 0.50, 'AJK-01 same-pay per-load rate') RETURNING id::text`,
        [company, `AJK01-${sfx}`, base.customer, TEST_OWNER_USER_ID, base.trailer, driverA]
      )).rows[0]!.id;
      const ensure = () => ensureDriverBillArtifactsForLoad(db as never, { loadId, operatingCompanyId: company, actorUserId: TEST_OWNER_USER_ID });
      const bill = async () =>
        (await db.query<{ id: string; driver_id: string; gross: string; n: number }>(
          `SELECT id::text, driver_id::text, gross_amount_cents::text AS gross, count(*) OVER ()::int AS n
             FROM driver_finance.driver_bills WHERE load_id = $1::uuid ORDER BY created_at LIMIT 1`,
          [loadId]
        )).rows[0]!;

      const minted = await ensure();
      expect(minted.outcome, JSON.stringify(minted)).toBe("minted");
      const first = await bill();
      expect(first.driver_id).toBe(driverA);
      expect(Number(first.gross)).toBeGreaterThan(0);

      // Reassign to B at the same pay — the bill moves; same bill, same money, still one bill on the load.
      await db.query(`UPDATE mdata.loads SET assigned_primary_driver_id = $2::uuid WHERE id = $1::uuid`, [loadId, driverB]);
      await ensure();
      const moved = await bill();
      expect(moved).toEqual({ ...first, driver_id: driverB });
      const audit = (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit.audit_events
          WHERE event_class = 'driver_finance.driver_bill.reassigned' AND payload->>'driver_bill_id' = $1 AND payload->>'to_driver_id' = $2`,
        [first.id, driverB]
      )).rows[0]!.n;
      expect(audit).toBe(1);

      // A paid bill is a closed document: reassigning back to A is refused by name and the bill keeps B.
      await db.query(`UPDATE driver_finance.driver_bills SET status = 'paid' WHERE id = $1::uuid`, [first.id]);
      await db.query(`UPDATE mdata.loads SET assigned_primary_driver_id = $2::uuid WHERE id = $1::uuid`, [loadId, driverA]);
      await expect(ensure()).rejects.toBeInstanceOf(DriverBillReassignRefusedError);
      expect((await bill()).driver_id).toBe(driverB);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  });
});
