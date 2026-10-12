/**
 * LEAD 443.110 G4 — real Postgres: the Settlement Creator's owed company expense is a full vendor bill.
 *  - numbered on its load's spine (never the bare load number the driver bill owns, never a number a bill holds);
 *  - GL-posted in the caller's transaction: Dr the item's account / Cr the company's A/P control, balanced;
 *  - carries vendor, load, driver, the load's unit and the load's trailer; the line carries the item;
 *  - Edit voids it through the bill void engine: the bill is voided and a reversal journal entry exists (nothing deleted).
 * Every fixture lives in ONE transaction that is rolled back — nothing is left behind.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { nextOwedBillSpineNumber, voidCreatorOwedBills, writeCreatorOwedBill } from "../settlement-creator-owed-bill.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Settlement Creator owed company expense -> posted vendor bill on the load spine (443.110 G4, real Postgres)", () => {
  it("posts Dr item account / Cr A/P with vendor, load, unit, trailer; spine number; Edit voids it with a reversal", async () => {
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
      const tag = `G4T${Date.now().toString(36).toUpperCase()}`;
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const opco = (await one(`INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, 'G4 owed bill test', 'operating_carrier') RETURNING id::text AS id`, [tag])).id;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);

      const acct = async (name: string, type: string, num: string) =>
        (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable) VALUES ($1, $2, $3, $4, true) RETURNING id::text AS id`, [opco, name, type, num])).id;
      const repairs = await acct("G4 Repairs", "Expense", "96401");
      const ap = await acct("G4 Accounts Payable", "Liability", "96402");
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1, 'ap_control', $2, true)`, [opco, ap]);
      const cat = (await one(`INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) VALUES ($1, 'G4CAT', 'G4 category') RETURNING id::text AS id`, [opco])).id;
      const item = (await one(
        `INSERT INTO catalogs.items (operating_company_id, item_name, item_type, category_id, default_expense_account_id) VALUES ($1, 'G4 Tire repair', 'Service', $2, $3) RETURNING id::text AS id`,
        [opco, cat, repairs]
      )).id;
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'G4 Tire Shop', 'other') RETURNING id::text AS id`, [opco])).id;
      const driver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Gfour', 'Driver', '5555550144') RETURNING id::text AS id`, [opco])).id;
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'G4 customer') RETURNING id::text AS id`, [opco])).id;
      const unit = (await one(
        `INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`${tag}-U`, `VIN${tag}`.slice(0, 17), opco]
      )).id;
      const trailer = (await one(`INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id) VALUES ($1, 'Reefer', $2) RETURNING id::text AS id`, [`${tag}-T`, opco])).id;
      const loadNumber = `9${String(Date.now()).slice(-9)}`; // real load numbers are digits
      const load = (await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text AS id`,
        [opco, loadNumber, customer, TEST_OWNER_USER_ID, trailerType, unit]
      )).id;
      await db.query(
        `INSERT INTO dispatch.load_assignment_history (operating_company_id, load_id, assignment_method, assigned_by_user_id, new_trailer_id)
         VALUES ($1, $2, 'inline_quicksave_trailer', $3, $4)`,
        [opco, load, TEST_OWNER_USER_ID, trailer]
      );

      // The spine never hands the owed bill the bare load number (the driver bill's) nor a number a bill holds.
      await db.query("SAVEPOINT spine");
      const n1 = await nextOwedBillSpineNumber(db as never, opco, load);
      expect(n1).not.toBe(loadNumber);
      expect(n1.startsWith(`${loadNumber}-`)).toBe(true);
      await db.query("ROLLBACK TO SAVEPOINT spine");

      const owed = await writeCreatorOwedBill(db as never, {
        operatingCompanyId: opco,
        actorUserId: TEST_OWNER_USER_ID,
        vendorId: vendor,
        vendorDocumentNumber: "INV-77",
        loadId: load,
        driverId: driver,
        unitId: null,
        trailerId: null,
        billDate: "2026-10-12",
        amountCents: 12_345,
        memo: "[SC 9999] Tire repair",
        itemId: item,
        accountId: repairs,
        quantity: 1,
        rateCents: 12_345,
        unitOfMeasure: "each",
        label: "Tire repair",
      });
      expect(owed.billNumber.startsWith(`${loadNumber}-`)).toBe(true);

      const b = (await db.query<{ bill_number: string; display_id: string; vendor_id: string; load_id: string; driver_id: string; unit_id: string; trailer_id: string; voided_at: string | null }>(
        `SELECT bill_number, display_id, vendor_id::text, load_id::text, driver_id::text, unit_id::text, trailer_id::text, voided_at::text FROM accounting.bills WHERE id = $1`,
        [owed.billId]
      )).rows[0]!;
      expect(b).toMatchObject({ display_id: owed.billNumber, bill_number: "INV-77", vendor_id: vendor, load_id: load, driver_id: driver, unit_id: unit, trailer_id: trailer, voided_at: null });
      const line = (await db.query<{ item_id: string; account_id: string; load_id: string }>(
        `SELECT item_id::text, account_id::text, load_id::text FROM accounting.bill_lines WHERE bill_id = $1`,
        [owed.billId]
      )).rows;
      expect(line).toEqual([{ item_id: item, account_id: repairs, load_id: load }]);

      // GL: one balanced entry — Dr the item's account, Cr A/P, on this company.
      const postings = (await db.query<{ account_id: string; dc: string; cents: string; opco: string }>(
        `SELECT account_id::text, debit_or_credit AS dc, amount_cents::text AS cents, operating_company_id::text AS opco
           FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1 ORDER BY debit_or_credit`,
        [owed.journalEntryId]
      )).rows;
      const dr = postings.filter((p) => p.dc.toLowerCase().startsWith("d"));
      const cr = postings.filter((p) => p.dc.toLowerCase().startsWith("c"));
      expect(dr.map((p) => p.account_id)).toEqual([repairs]);
      expect(cr.map((p) => p.account_id)).toEqual([ap]);
      expect(dr.reduce((a, p) => a + Number(p.cents), 0)).toBe(12_345);
      expect(cr.reduce((a, p) => a + Number(p.cents), 0)).toBe(12_345);
      expect(postings.every((p) => p.opco === opco)).toBe(true);

      // Edit = void and repost: the bill is voided through the bill void engine, with a reversal entry; nothing deleted.
      await voidCreatorOwedBills(db as never, { operatingCompanyId: opco, billIds: [owed.billId], reason: "G4 test Edit", actorUserId: TEST_OWNER_USER_ID, currentBusinessDate: "2026-10-12" });
      const after = (await db.query<{ voided_at: string | null; n: number }>(
        `SELECT b.voided_at::text, (SELECT count(*)::int FROM accounting.bills x WHERE x.id = b.id) AS n FROM accounting.bills b WHERE b.id = $1`,
        [owed.billId]
      )).rows[0]!;
      expect(after.n).toBe(1);
      expect(after.voided_at).not.toBeNull();
      const reversal = (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM accounting.journal_entries WHERE reverses_je_id = $1`,
        [owed.journalEntryId]
      )).rows[0]!.n;
      expect(reversal).toBe(1);
      // A second void (Edit again) is a no-op, never an error.
      await voidCreatorOwedBills(db as never, { operatingCompanyId: opco, billIds: [owed.billId], reason: "G4 test Edit again", actorUserId: TEST_OWNER_USER_ID, currentBusinessDate: "2026-10-12" });
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  }, 60_000);
});
