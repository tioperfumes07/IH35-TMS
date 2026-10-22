/**
 * LEAD 443.220 (owner 10-21 7:34 PM CT: "why no driver bill, it should be created automatically") — real Postgres.
 * 13697 / 13699 were booked with no SHORT miles: the mint gate returned refused_no_shortest_miles and wrote NO bill.
 * Main: 0 bill rows. Branch: the bill exists at once (awaiting_short_miles, $0, the driver linked, a dispatcher task queued);
 * when the short miles land the SAME row is priced (status open, short miles x rate) — never a second bill. ONE transaction,
 * rolled back.
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

describeIntegration("a booked load always has its driver bill (443.220, real Postgres)", () => {
  it("no short miles -> awaiting_short_miles bill + task; short miles land -> the same bill is priced", async () => {
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
      const driver = randomUUID();
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone) VALUES ($1::uuid, $2::uuid, 'Await', 'Short', $3)`,
        [driver, company, `+1004${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`]
      );
      // Practical miles only (the 13697 / 13699 shape) and a per-load rate with a reason, so pricing needs no rate card.
      const loadNumber = `A220-${sfx}`;
      const loadId = (await db.query<{ id: string }>(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id,
                                  assigned_primary_driver_id, miles_shortest, miles_practical, driver_pay_rate_per_mile,
                                  driver_pay_rate_override_reason)
         VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6::uuid, NULL, 1958.9, 0.43, '443.220 per-load rate for the test')
         RETURNING id::text`,
        [company, loadNumber, base.customer, TEST_OWNER_USER_ID, base.trailer, driver]
      )).rows[0]!.id;
      const ensure = () => ensureDriverBillArtifactsForLoad(db as never, { loadId, operatingCompanyId: company, actorUserId: TEST_OWNER_USER_ID });
      const bills = async () =>
        (await db.query<{ id: string; status: string; driver_id: string; gross: string; miles_basis: string | null; miles_basis_type: string | null }>(
          `SELECT id::text, status, driver_id::text, gross_amount_cents::text AS gross, miles_basis::text, miles_basis_type
             FROM driver_finance.driver_bills WHERE load_id = $1::uuid AND voided_at IS NULL ORDER BY created_at`,
          [loadId]
        )).rows;

      // 1. Booked without short miles: the bill EXISTS (main: refused_no_shortest_miles, 0 rows).
      const first = await ensure();
      expect(first.outcome, JSON.stringify(first)).toBe("awaiting_short_miles");
      const awaiting = await bills();
      expect(awaiting).toHaveLength(1);
      expect(awaiting[0]).toMatchObject({ status: "awaiting_short_miles", driver_id: driver, gross: "0", miles_basis: null });
      // never a practical-miles basis
      expect(awaiting[0]!.miles_basis_type).toBeNull();
      const task = (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM tasks.task WHERE subject_type = 'load' AND subject_id = $1::uuid AND is_active`,
        [loadId]
      )).rows[0]!.n;
      expect(task).toBe(1);

      // 2. Re-entry before the miles land: still ONE bill, still awaiting, still one task.
      await ensure();
      expect(await bills()).toHaveLength(1);

      // 3. The short miles land (AlwaysTrack L.Miles) -> the SAME row is priced: 1875.7 x $0.43 = $806.55, status open.
      await db.query(`UPDATE mdata.loads SET miles_shortest = 1875.7 WHERE id = $1::uuid`, [loadId]);
      const priced = await ensure();
      expect(priced.outcome, JSON.stringify(priced)).toBe("minted");
      const after = await bills();
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({ id: awaiting[0]!.id, status: "open", driver_id: driver, gross: "80655", miles_basis_type: "short" });
      expect(Number(after[0]!.miles_basis)).toBe(1875.7);
      const pricedAudit = (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit.audit_events
          WHERE event_class = 'driver_finance.driver_bill.priced_from_short_miles' AND payload->>'driver_bill_id' = $1`,
        [awaiting[0]!.id]
      )).rows[0]!.n;
      expect(pricedAudit).toBe(1);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  }, 60_000);
});
