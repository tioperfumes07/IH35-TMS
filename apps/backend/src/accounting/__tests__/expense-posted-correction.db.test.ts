/**
 * LEAD 443.129 E — real Postgres: the ONE correction path for a POSTED expense. A fuel receipt posts on receipt with no
 * driver (as EXP-2026-00006 / 00007 did on prod). Correcting its driver must: reverse the live entry, re-post the same money
 * on a new entry, keep the SAME expense_number, stamp the driver on the document (header + lines), move the fuel receipt
 * identity to the new posting, and write one audit row. A dry run writes nothing; an identical second correction is a no-op;
 * a money field is refused by name; a closed period refuses. On the old code correctPostedExpense does not exist (and the
 * PATCH route refuses every posted expense) — this test fails there.
 *
 * Fixtures are committed under an isolated company — never the shared company, never production.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { createIsolatedOperatingCompany, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { postFuelFillOnReceipt } from "../bank-recon/bank-match-fuel-post.service.js";
import { correctPostedExpense, EXPENSE_CORRECTED_EVENT } from "../expense-correction.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("one correction path for a posted expense (443.129 E, real Postgres)", () => {
  it("driver correction: reverse + re-post, same number, receipt identity moved, one audit row; dry run, no-op, refusals", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: opco } = await createIsolatedOperatingCompany({ codePrefix: "EPC", legalNamePrefix: "443.129 E posted expense correction" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = `EPC${Date.now().toString(36).toUpperCase()}`;
    const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
    const scope = async () => {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
    };
    try {
      // ---- committed fixtures (isolated company) ---------------------------------------------------------------
      await scope();
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [opco, `${tag} customer`])).id;
      const load = (await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
        [opco, `${tag}L1`, customer, TEST_OWNER_USER_ID, trailerType])).id;
      const unit = (await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`,
        [`${tag}U`, `${tag}VIN00000000`.slice(0, 17), opco])).id;
      // The fill was booked to the WRONG driver; the correction moves the document to the right one. (Card fuel rows are TIER1 and
      // must name a driver; the prod case — a Relay fill posted with none — runs the same correction from NULL.)
      const wrongDriver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Epc', 'Wrong', '5555550128') RETURNING id::text AS id`, [opco])).id;
      const driver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Epc', 'Driver', '5555550129') RETURNING id::text AS id`, [opco])).id;
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, $2, 'other') RETURNING id::text AS id`, [opco, `${tag} Dreamline`])).id;
      const fuelAcct = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Expense', '95000') RETURNING id::text AS id`, [opco, `${tag} Fuel & Diesel`])).id;
      const payable = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, $2, 'Liability', '92510') RETURNING id::text AS id`, [opco, `${tag} Dreamline Diesel Card Payable`])).id;
      await db.query(`INSERT INTO catalogs.items (operating_company_id, item_name, item_type, default_expense_account_id) VALUES ($1, 'Fuel-Truck Diesel', 'NonInventory', $2)`, [opco, fuelAcct]);
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active) VALUES ($1, 'fuel_card_payable_dreamline', $2, true)`, [opco, payable]);
      const card = (await one(`INSERT INTO catalogs.fuel_card_types (operating_company_id, code, display_name, is_active) VALUES ($1, 'DREAMLINE', 'Dreamline', true) RETURNING id::text AS id`, [opco])).id;
      const fill = (await one(
        `INSERT INTO fuel.fuel_transactions (operating_company_id, vendor_id, load_id, driver_id, unit_id, fuel_type, gallons, price_per_gallon,
           total_cost, transaction_at, purchased_at, transaction_reference, source, source_row_hash, fuel_card_id, location_state)
         VALUES ($1, $2, $3, $4, $5, 'diesel', 40, 5, 200.00, now(), now(), '7129001', 'import', $6, $7, 'TX') RETURNING id::text AS id`,
        [opco, vendor, load, wrongDriver, unit, `${tag}-fill`, card])).id;
      await db.query("COMMIT");

      // ---- the receipt posts (same path as prod: fuel_event entry + adopted expense document) ----------------------
      await scope();
      const posted = await postFuelFillOnReceipt(db as never, { operating_company_id: opco, actor_user_uuid: TEST_OWNER_USER_ID, kind: "fuel_transaction", fill_id: fill });
      await db.query("COMMIT");
      expect(posted.result).toBe("posted");
      const exp0 = await one<{ id: string; expense_number: string; journal_entry_id: string; driver_uuid: string | null; posting_status: string }>(
        `SELECT id::text, expense_number, journal_entry_id::text, driver_uuid::text, posting_status FROM accounting.expenses
          WHERE operating_company_id = $1::uuid AND source_fuel_transaction_id = $2::uuid`, [opco, fill]);
      expect(exp0.posting_status).toBe("posted");
      expect(exp0.driver_uuid).toBe(wrongDriver);
      expect(exp0.journal_entry_id).toBe(posted.journal_entry_id);

      const moneyOf = async (je: string) =>
        (await db.query<{ a: string; dc: string; c: string }>(
          `SELECT account_id::text AS a, debit_or_credit AS dc, amount_cents::text AS c FROM accounting.journal_entry_postings
            WHERE journal_entry_uuid = $1::uuid ORDER BY line_sequence`, [je])).rows;
      const originalMoney = await moneyOf(exp0.journal_entry_id);

      // ---- a money field is refused by name; a dry run writes nothing ------------------------------------------
      await scope();
      const moneyRefused = await correctPostedExpense(db as never, {
        operatingCompanyId: opco, expenseId: exp0.id, changes: { amount_cents: 1 } as never, actorUserId: TEST_OWNER_USER_ID, reason: "test money",
      });
      expect(moneyRefused.outcome).toBe("refused");
      expect((moneyRefused as { reason: string }).reason).toMatch(/correction_field_not_supported: amount_cents/);
      const planned = await correctPostedExpense(db as never, {
        operatingCompanyId: opco, expenseId: exp0.id, changes: { driver_id: driver }, actorUserId: TEST_OWNER_USER_ID, reason: "add driver", dryRun: true,
      });
      expect(planned.outcome).toBe("planned");
      await db.query("COMMIT");
      const stillOriginal = await one<{ je: string; d: string | null }>(`SELECT journal_entry_id::text AS je, driver_uuid::text AS d FROM accounting.expenses WHERE id = $1::uuid`, [exp0.id]);
      expect(stillOriginal.je).toBe(exp0.journal_entry_id);
      expect(stillOriginal.d).toBe(wrongDriver);

      // ---- the correction ---------------------------------------------------------------------------------------
      await scope();
      const corrected = await correctPostedExpense(db as never, {
        operatingCompanyId: opco, expenseId: exp0.id, changes: { driver_id: driver }, actorUserId: TEST_OWNER_USER_ID, reason: "add driver (443.129 E)",
      });
      await db.query("COMMIT");
      expect(corrected.outcome).toBe("corrected");
      const c = corrected as { new_journal_entry_id: string; reversal_journal_entry_id: string; original_journal_entry_id: string; correction_revision: number };
      expect(c.original_journal_entry_id).toBe(exp0.journal_entry_id);
      expect(c.reversal_journal_entry_id).toBeTruthy();
      expect(c.correction_revision).toBe(1);

      const exp1 = await one<{ expense_number: string; journal_entry_id: string; driver_uuid: string | null; posting_status: string }>(
        `SELECT expense_number, journal_entry_id::text, driver_uuid::text, posting_status FROM accounting.expenses WHERE id = $1::uuid`, [exp0.id]);
      expect(exp1.expense_number).toBe(exp0.expense_number);
      expect(exp1.posting_status).toBe("posted");
      expect(exp1.driver_uuid).toBe(driver);
      expect(exp1.journal_entry_id).toBe(c.new_journal_entry_id);
      const lineDrivers = (await db.query<{ d: string | null }>(`SELECT driver_id::text AS d FROM accounting.expense_lines WHERE expense_id = $1::uuid`, [exp0.id])).rows;
      expect(lineDrivers.length).toBeGreaterThan(0);
      expect(lineDrivers.every((l) => l.d === driver)).toBe(true);

      // original reversed, new entry = same money
      const orig = await one<{ r: string | null }>(`SELECT reversed_by_je_id::text AS r FROM accounting.journal_entries WHERE id = $1::uuid`, [exp0.journal_entry_id]);
      expect(orig.r).toBe(c.reversal_journal_entry_id);
      expect(await moneyOf(c.new_journal_entry_id)).toEqual(originalMoney);

      // the fuel receipt identity lives on the new posting only
      const receipts = (await db.query<{ b: string }>(
        `SELECT rp.posting_batch_id::text AS b FROM fuel.fuel_receipt_postings rp WHERE rp.operating_company_id = $1::uuid AND rp.released_at IS NULL`, [opco])).rows;
      const newBatch = await one<{ b: string }>(`SELECT DISTINCT posting_batch_id::text AS b FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid`, [c.new_journal_entry_id]);
      expect(receipts.map((r) => r.b)).toEqual([newBatch.b]);

      // the company's books still balance; one audit row
      const tb = await one<{ net: string }>(
        `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END), 0)::text AS net
           FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`, [opco]);
      expect(Number(tb.net)).toBe(0);
      const audits = await one<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit.audit_events WHERE event_class = $1 AND payload->>'expense_id' = $2`, [EXPENSE_CORRECTED_EVENT, exp0.id]);
      expect(Number(audits.n)).toBe(1);

      // ---- an identical second correction is a no-op ----------------------------------------------------------
      await scope();
      const again = await correctPostedExpense(db as never, {
        operatingCompanyId: opco, expenseId: exp0.id, changes: { driver_id: driver }, actorUserId: TEST_OWNER_USER_ID, reason: "add driver again",
      });
      await db.query("COMMIT");
      expect(again.outcome).toBe("unchanged");

      // ---- a closed period refuses -----------------------------------------------------------------------------
      await scope();
      await db.query(
        `INSERT INTO accounting.periods (operating_company_id, period_start, period_end, fiscal_year, status, closed_at)
         VALUES ($1::uuid, (current_date - 400), (current_date + 1), extract(year from current_date)::int, 'closed', now())`, [opco]);
      const closed = await correctPostedExpense(db as never, {
        operatingCompanyId: opco, expenseId: exp0.id, changes: { memo: "late note" }, actorUserId: TEST_OWNER_USER_ID, reason: "closed period try",
      });
      await db.query("ROLLBACK");
      expect(closed.outcome).toBe("refused");
      expect((closed as { reason: string }).reason).toMatch(/^period_closed/);
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.end();
    }
  }, 120_000);
});
