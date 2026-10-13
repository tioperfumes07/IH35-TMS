/**
 * LEAD 443.113 BCF-02 — real Postgres: the driver bill an advance applies to must belong to the advancing driver (or its
 * team driver), be for the advance's load, and be live (not void, not settled); it is locked FOR UPDATE before its
 * remaining balance is read. Anything else is refused by name and nothing is written. ONE transaction, rolled back.
 * Before the fix, createDriverCashAdvanceCore read only gross_amount_cents and allocated against any bill id in the company.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationLoadId } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { createDriverCashAdvanceCore } from "../cash-advance-create.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("BCF-02 — an advance's linked bill must match driver + load + be live (real Postgres)", () => {
  it("refuses another driver's bill, another load's bill, a settled bill and a voided bill; writes nothing", async () => {
    const loadId = await ensureIntegrationLoadId();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const load = (await db.query<{ company: string; number: string }>(
        `SELECT operating_company_id::text AS company, load_number AS number FROM mdata.loads WHERE id = $1::uuid`,
        [loadId]
      )).rows[0]!;
      const company = load.company;
      await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [company]);
      const sfx = randomUUID().slice(0, 6);
      const driver = async (n: string) => {
        const id = randomUUID();
        await db.query(
          `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone, status) VALUES ($1::uuid, $2::uuid, 'BCF02', $3, $4, 'Active')`,
          [id, company, n, `+1003${randomUUID().replace(/\D/g, "0").slice(0, 7).padEnd(7, "0")}`]
        );
        return id;
      };
      // ROUND 394 RULING 1: an advance books to the driver's own sub-account under the advance_recovery account — bind one
      // inside this rolled-back transaction so a bill that passes every check really writes (the positive control).
      const recovery = (await db.query<{ id: string }>(
        `INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid, $2, 'BCF02 driver advances', 'Asset', true) RETURNING id::text`,
        [company, `BCF02${sfx}`]
      )).rows[0]!.id;
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid, 'advance_recovery', $2::uuid, true)
         ON CONFLICT (operating_company_id, role) WHERE is_active = true DO UPDATE SET account_id = EXCLUDED.account_id`,
        [company, recovery]
      );
      const owner = await driver("Owner");
      const other = await driver("Other");
      const bill = async (n: string) =>
        (await db.query<{ id: string }>(
          `INSERT INTO driver_finance.driver_bills (operating_company_id, load_id, load_number, bill_number, driver_id, gross_amount_cents, status)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, 50000, 'open') RETURNING id::text`,
          [company, loadId, load.number, `BCF02-${sfx}-${n}`, owner]
        )).rows[0]!.id;
      const advances = async () =>
        Number((await db.query(`SELECT count(*)::int AS n FROM driver_finance.driver_advances WHERE driver_id = ANY($1::uuid[])`, [[owner, other]])).rows[0]!.n);

      const advance = (driverId: string, linkedBill: string, extra: Record<string, unknown> = {}) =>
        createDriverCashAdvanceCore(db as never, TEST_OWNER_USER_ID, company, {
          driver_id: driverId,
          amount: 100,
          purpose: "other",
          disbursement_method: "in_person_check",
          recipient_info: { recipient_type: "driver" },
          linked_driver_bill_id: linkedBill,
          ...extra,
        } as never);

      // Savepoint per case: a refused case must leave the transaction usable for the next.
      const attempt = async (driverId: string, linkedBill: string, extra: Record<string, unknown> = {}) => {
        await db.query("SAVEPOINT bcf02");
        try {
          return await advance(driverId, linkedBill, extra);
        } catch (e) {
          return { ok: false as const, code: 500, error: `threw: ${(e as Error).message}` };
        } finally {
          await db.query("ROLLBACK TO SAVEPOINT bcf02");
        }
      };

      const open = await bill("OPEN");
      expect(await attempt(other, open)).toMatchObject({ ok: false, code: 422, error: "linked_driver_bill_driver_mismatch" });
      expect(await attempt(owner, open, { load_id: randomUUID() })).toMatchObject({ ok: false, code: 422, error: "linked_driver_bill_load_mismatch" });

      const settled = await bill("SETTLED");
      // settled_in_settlement_id carries no FK: a fixture id marks the bill as settled (nothing else reads it here).
      await db.query(`UPDATE driver_finance.driver_bills SET settled_in_settlement_id = $2::uuid WHERE id = $1::uuid`, [settled, randomUUID()]);
      expect(await attempt(owner, settled)).toMatchObject({ ok: false, code: 409, error: "linked_driver_bill_settled" });

      const voided = await bill("VOID");
      await db.query(
        `UPDATE driver_finance.driver_bills SET status = 'void', voided_at = now(), void_reason = 'BCF-02 fixture', voided_by_user_id = $2::uuid WHERE id = $1::uuid`,
        [voided, TEST_OWNER_USER_ID]
      );
      expect(await attempt(owner, voided)).toMatchObject({ ok: false, code: 409, error: "linked_driver_bill_voided" });

      expect(await advances()).toBe(0);

      // Positive control: the advancing driver's own open bill on this load books the advance against it.
      await db.query("SAVEPOINT bcf02_ok");
      const own = await advance(owner, open);
      expect(own.ok, JSON.stringify(own)).toBe(true);
      const linked = (await db.query(
        `SELECT linked_driver_bill_id::text AS bill, load_id::text AS load FROM driver_finance.driver_advances WHERE driver_id = $1::uuid`,
        [owner]
      )).rows;
      expect(linked).toEqual([{ bill: open, load: loadId }]);
      await db.query("ROLLBACK TO SAVEPOINT bcf02_ok");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  });
});
