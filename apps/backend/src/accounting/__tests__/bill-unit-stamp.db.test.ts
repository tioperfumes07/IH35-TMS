/**
 * LEAD 443.102 ruling 1 — real Postgres: stampDriverBillUnitsFromLoads stamps the load's same-entity unit on POSTED
 * driver bills, metadata only. Every fixture lives in ONE transaction that is rolled back — nothing is left behind.
 *
 *  - dry run plans the bill and writes nothing;
 *  - the real run stamps header + lines, writes exactly one audit row per bill, and leaves every amount / account /
 *    status / journal entry byte-identical;
 *  - a second run changes nothing (idempotent);
 *  - a bill whose lines name different units keeps a NULL header while each line takes its own unit;
 *  - a load whose unit is no longer the company's own or leased (lease ended) is never stamped;
 *  - a non-Owner is refused (403) and the refusal is audited.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { BillUnitStampError, stampDriverBillUnitsFromLoads } from "../bill-unit-stamp.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("posted driver bills take their load's unit (443.102, real Postgres)", () => {
  it("dry run plans, real run stamps metadata only + audits, rerun is a no-op, mixed / lease-ended / non-Owner handled", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const tag = `UST${Date.now().toString(36).toUpperCase()}`;
      const co = async (code: string) =>
        (await db.query<{ id: string }>(
          `INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
          [code, `Unit stamp test ${code}`]
        )).rows[0]!.id;
      const opco = await co(`${tag}A`);
      const lessor = await co(`${tag}B`);
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailer = await prepareCompanyForLoadInserts(db, opco);
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;

      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'UST customer') RETURNING id::text AS id`, [opco])).id;
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'UST driver vendor', 'other') RETURNING id::text AS id`, [opco])).id;
      const driver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Ust', 'Driver', '5555550100') RETURNING id::text AS id`, [opco])).id;
      const account = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, 'UST driver pay', 'Expense', '96901') RETURNING id::text AS id`, [opco])).id;
      const unit = async (n: string, owner: string, leasedTo: string | null) =>
        (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, currently_leased_to_company_id) VALUES ($1, $2, $3, $4) RETURNING id::text AS id`,
          [`${tag}-${n}`, `VIN${tag}${n}`.slice(0, 17), owner, leasedTo])).id;
      const uOwn1 = await unit("U1", opco, null);
      const uOwn2 = await unit("U2", opco, null);
      const uLeased = await unit("UL", lessor, opco);
      const load = async (n: string, unitId: string) =>
        (await one(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text AS id`,
          [opco, `${tag}${n}`, customer, TEST_OWNER_USER_ID, trailer, unitId]
        )).id;
      const lOwn = await load("1", uOwn1);
      const lMixA = await load("2", uOwn1);
      const lMixB = await load("3", uOwn2);
      const lLeased = await load("4", uLeased);
      const lEnded = await load("5", uLeased);
      const bill = async (n: string, loads: string[]) => {
        const b = (await one(
          `INSERT INTO accounting.bills (operating_company_id, vendor_id, driver_id, bill_number, bill_date, amount_cents, total_amount, status)
           VALUES ($1, $2, $3, $4, current_date, $5, $6, 'unpaid') RETURNING id::text AS id`,
          [opco, vendor, driver, `${tag}${n}`, 1000 * loads.length, 10 * loads.length]
        )).id;
        let seq = 0;
        for (const l of loads) {
          seq += 1;
          await db.query(
            `INSERT INTO accounting.bill_lines (bill_id, line_sequence, operating_company_id, amount, account_id, load_id) VALUES ($1, $2, $3, 10, $4, $5)`,
            [b, seq, opco, account, l]
          );
        }
        return b;
      };
      const bOwn = await bill("B1", [lOwn]);
      const bMixed = await bill("B2", [lMixA, lMixB]);
      const bLeased = await bill("B3", [lLeased]);
      // The lease ends after the loads were booked: uLeased is no longer the company's own or leased, so bLeased and
      // bEnded are never stamped. A second, still-leased unit proves a leased unit IS stamped.
      const bEnded = await bill("B4", [lEnded]);
      await db.query(`UPDATE mdata.units SET currently_leased_to_company_id = NULL WHERE id = $1`, [uLeased]);
      const uLeased2 = await unit("UL2", lessor, opco);
      const lLeased2 = await load("6", uLeased2);
      const bLeased2 = await bill("B5", [lLeased2]);

      const snapshot = async () => ({
        bills: (await db.query(`SELECT id, amount_cents, total_amount, status, vendor_id, driver_id, bill_date FROM accounting.bills WHERE operating_company_id = $1 ORDER BY id`, [opco])).rows,
        lines: (await db.query(`SELECT id, amount, account_id, item_id, load_id FROM accounting.bill_lines WHERE operating_company_id = $1 ORDER BY id`, [opco])).rows,
        jes: (await db.query(`SELECT count(*)::int AS n FROM accounting.journal_entries WHERE operating_company_id = $1`, [opco])).rows[0],
        postings: (await db.query(`SELECT count(*)::int AS n FROM accounting.journal_entry_postings WHERE operating_company_id = $1`, [opco])).rows[0],
      });
      const units = async (billId: string) => ({
        header: (await db.query<{ u: string | null }>(`SELECT unit_id::text AS u FROM accounting.bills WHERE id = $1`, [billId])).rows[0]!.u,
        lines: (await db.query<{ u: string | null }>(`SELECT unit_id::text AS u FROM accounting.bill_lines WHERE bill_id = $1 ORDER BY line_sequence`, [billId])).rows.map((r) => r.u),
      });
      const audits = async () =>
        (await db.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM audit.audit_events WHERE event_class = 'bill.unit_stamped_from_load' AND payload->>'operating_company_id' = $1`,
          [opco]
        )).rows[0]!.n;

      // Non-Owner: refused, audited, nothing written.
      await db.query("SAVEPOINT non_owner");
      const refused = await stampDriverBillUnitsFromLoads(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, actorRole: "Dispatcher", dryRun: false }).catch((e) => e);
      expect(refused).toBeInstanceOf(BillUnitStampError);
      expect((refused as BillUnitStampError).statusCode).toBe(403);
      const refusalAudit = (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit.audit_events WHERE event_class = 'bill.unit_stamp_refused_non_owner' AND payload->>'operating_company_id' = $1`, [opco])).rows[0]!.n;
      expect(refusalAudit).toBe(1);
      await db.query("ROLLBACK TO SAVEPOINT non_owner");

      const before = await snapshot();

      // Dry run: the full plan, nothing written.
      const dry = await stampDriverBillUnitsFromLoads(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, actorRole: "Owner", dryRun: true });
      expect(dry.dry_run).toBe(true);
      expect(dry.bills_changed).toBe(3); // bOwn, bMixed (lines only), bLeased2 — bLeased / bEnded resolve to no unit
      expect(dry.header_stamps).toBe(2); // bOwn, bLeased2
      expect(dry.line_stamps).toBe(4); // bOwn 1 + bMixed 2 + bLeased2 1
      expect(dry.mixed_unit_bills).toBe(1);
      expect((await units(bOwn)).header).toBeNull();
      expect(await audits()).toBe(0);
      const dryOwn = dry.bills.find((b) => b.bill_id === bOwn)!;
      expect(dryOwn.header).toMatchObject({ action: "stamp", unit_id: uOwn1 });
      expect(dry.bills.find((b) => b.bill_id === bEnded)!.lines[0]).toMatchObject({ action: "skip", reason: "load_has_no_same_entity_unit" });

      // Real run.
      const run = await stampDriverBillUnitsFromLoads(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, actorRole: "Owner", dryRun: false });
      expect(run.refused_bills).toBe(0);
      expect(run.header_stamps).toBe(2);
      expect(run.line_stamps).toBe(4);
      expect(await units(bOwn)).toEqual({ header: uOwn1, lines: [uOwn1] });
      expect(await units(bMixed)).toEqual({ header: null, lines: [uOwn1, uOwn2] });
      expect(await units(bLeased2)).toEqual({ header: uLeased2, lines: [uLeased2] });
      expect(await units(bEnded)).toEqual({ header: null, lines: [null] });
      expect(await units(bLeased)).toEqual({ header: null, lines: [null] });
      expect(await audits()).toBe(3); // one per stamped bill: bOwn, bMixed, bLeased2

      // Metadata only: every amount / account / status / JE identical.
      expect(await snapshot()).toEqual(before);

      // Idempotent.
      const again = await stampDriverBillUnitsFromLoads(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, actorRole: "Owner", dryRun: false });
      expect(again.bills_changed).toBe(0);
      expect(again.header_stamps + again.line_stamps).toBe(0);
      expect(await audits()).toBe(3);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
