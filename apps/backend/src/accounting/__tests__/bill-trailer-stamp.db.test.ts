/**
 * LEAD 443.105 item 1 — real Postgres: stampDriverBillTrailersFromLoads stamps the load's trailer on POSTED driver bills
 * (company trailer -> bills.trailer_id + line equipment_id; customer trailer -> bills.non_owned_trailer_id), metadata
 * only, and the forward writer helper stamps a NEW driver bill the same way. Every fixture lives in ONE transaction that
 * is rolled back — nothing is left behind.
 *
 *  - company trailer from the load's assignment (dispatch.load_assignment_history), and from the one trailer the
 *    load's live expenses carry when the load has no assignment trailer;
 *  - customer trailer (mdata.loads.trailer_source = 'customer' -> non_owned_trailer_id);
 *  - another company's trailer (not owned, not leased) is never stamped; a load with no recorded trailer is reported;
 *  - a bill whose lines name different trailers keeps a NULL header while each line takes its own trailer;
 *  - dry run writes nothing; the real run writes one audit row per bill and leaves every amount / account / status /
 *    journal entry byte-identical; a second run changes nothing; a non-Owner is refused (403) and audited.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { BillTrailerStampError, stampDriverBillTrailersFromLoads, stampNewDriverBillTrailerFromLoad } from "../bill-trailer-stamp.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("posted driver bills take their load's trailer (443.105, real Postgres)", () => {
  it("company / customer / expense-carried trailers stamped metadata only; foreign, missing, mixed, rerun, non-Owner handled; forward helper", async () => {
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
      const tag = `TST${Date.now().toString(36).toUpperCase()}`;
      const co = async (code: string) =>
        (await db.query<{ id: string }>(
          `INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
          [code, `Trailer stamp test ${code}`]
        )).rows[0]!.id;
      const opco = await co(`${tag}A`);
      const other = await co(`${tag}B`);
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;

      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'TST customer') RETURNING id::text AS id`, [opco])).id;
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'TST driver vendor', 'other') RETURNING id::text AS id`, [opco])).id;
      const driver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Tst', 'Driver', '5555550101') RETURNING id::text AS id`, [opco])).id;
      const account = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, 'TST driver pay', 'Expense', '96902') RETURNING id::text AS id`, [opco])).id;
      const equipment = async (n: string, owner: string, leasedTo: string | null) =>
        (await one(`INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id, currently_leased_to_company_id) VALUES ($1, 'Reefer', $2, $3) RETURNING id::text AS id`,
          [`${tag}-${n}`, owner, leasedTo])).id;
      const tAssigned = await equipment("T1", opco, null);
      const tExpense = await equipment("T2", opco, null);
      const tLeased = await equipment("T3", other, opco);
      const tForeign = await equipment("T4", other, null);
      const nonOwned = (await one(
        `INSERT INTO dispatch.non_owned_trailers (operating_company_id, trailer_number, counterparty_type, counterparty_id) VALUES ($1, $2, 'customer', $3) RETURNING id::text AS id`,
        [opco, `${tag}-C1`, customer]
      )).id;
      const load = async (n: string) =>
        (await one(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
          [opco, `${tag}${n}`, customer, TEST_OWNER_USER_ID, trailerType]
        )).id;
      const assign = async (loadId: string, trailerId: string) =>
        db.query(
          `INSERT INTO dispatch.load_assignment_history (operating_company_id, load_id, assignment_method, assigned_by_user_id, new_trailer_id)
           VALUES ($1, $2, 'inline_quicksave_trailer', $3, $4)`,
          [opco, loadId, TEST_OWNER_USER_ID, trailerId]
        );
      let trace = Date.now() % 1_000_000_000;
      const expense = async (loadId: string, trailerId: string) =>
        db.query(
          `INSERT INTO accounting.expenses (operating_company_id, transaction_date, total_amount_cents, trace_no, load_id, trailer_id)
           VALUES ($1, current_date, 500, $2, $3, $4)`,
          [opco, (trace += 1), loadId, trailerId]
        );

      const lAssigned = await load("1"); await assign(lAssigned, tAssigned);
      const lExpense = await load("2"); await expense(lExpense, tExpense);
      const lLeased = await load("3"); await assign(lLeased, tLeased);
      const lCustomer = await load("4");
      await db.query(`UPDATE mdata.loads SET trailer_source = 'customer', non_owned_trailer_id = $2 WHERE id = $1`, [lCustomer, nonOwned]);
      const lNone = await load("5");
      const lForeign = await load("6"); await assign(lForeign, tForeign);
      const lMixA = await load("7"); await assign(lMixA, tAssigned);
      const lMixB = await load("8"); await assign(lMixB, tExpense);

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
      const bAssigned = await bill("B1", [lAssigned]);
      const bExpense = await bill("B2", [lExpense]);
      const bLeased = await bill("B3", [lLeased]);
      const bCustomer = await bill("B4", [lCustomer]);
      const bNone = await bill("B5", [lNone]);
      const bForeign = await bill("B6", [lForeign]);
      const bMixed = await bill("B7", [lMixA, lMixB]);

      const snapshot = async () => ({
        bills: (await db.query(`SELECT id, amount_cents, total_amount, status, vendor_id, driver_id, unit_id, bill_date FROM accounting.bills WHERE operating_company_id = $1 ORDER BY id`, [opco])).rows,
        lines: (await db.query(`SELECT id, amount, account_id, item_id, load_id, unit_id FROM accounting.bill_lines WHERE operating_company_id = $1 ORDER BY id`, [opco])).rows,
        jes: (await db.query(`SELECT count(*)::int AS n FROM accounting.journal_entries WHERE operating_company_id = $1`, [opco])).rows[0],
        postings: (await db.query(`SELECT count(*)::int AS n FROM accounting.journal_entry_postings WHERE operating_company_id = $1`, [opco])).rows[0],
      });
      const trailers = async (billId: string) => ({
        trailer: (await db.query<{ t: string | null; n: string | null }>(`SELECT trailer_id::text AS t, non_owned_trailer_id::text AS n FROM accounting.bills WHERE id = $1`, [billId])).rows[0]!,
        lines: (await db.query<{ e: string | null }>(`SELECT equipment_id::text AS e FROM accounting.bill_lines WHERE bill_id = $1 ORDER BY line_sequence`, [billId])).rows.map((r) => r.e),
      });
      const audits = async () =>
        (await db.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM audit.audit_events WHERE event_class = 'bill.trailer_stamped_from_load' AND payload->>'operating_company_id' = $1`,
          [opco]
        )).rows[0]!.n;

      // Non-Owner: refused, audited, nothing written.
      await db.query("SAVEPOINT non_owner");
      const refused = await stampDriverBillTrailersFromLoads(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, actorRole: "Dispatcher", dryRun: false }).catch((e) => e);
      expect(refused).toBeInstanceOf(BillTrailerStampError);
      expect((refused as BillTrailerStampError).statusCode).toBe(403);
      const refusalAudit = (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit.audit_events WHERE event_class = 'bill.trailer_stamp_refused_non_owner' AND payload->>'operating_company_id' = $1`, [opco])).rows[0]!.n;
      expect(refusalAudit).toBe(1);
      await db.query("ROLLBACK TO SAVEPOINT non_owner");

      const before = await snapshot();

      // Dry run: the full plan, nothing written.
      const dry = await stampDriverBillTrailersFromLoads(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, actorRole: "Owner", dryRun: true });
      expect(dry.dry_run).toBe(true);
      expect(dry.header_stamps).toBe(4); // assigned, expense-carried, leased, customer
      expect(dry.company_trailer_headers).toBe(3);
      expect(dry.non_owned_trailer_headers).toBe(1);
      expect(dry.line_stamps).toBe(5); // assigned 1 + expense 1 + leased 1 + mixed 2 (customer lines carry no equipment)
      expect(dry.no_trailer_bills).toBe(2); // none, foreign
      expect(dry.mixed_trailer_bills).toBe(1);
      expect(await trailers(bAssigned)).toEqual({ trailer: { t: null, n: null }, lines: [null] });
      expect(await audits()).toBe(0);
      expect(dry.bills.find((b) => b.bill_id === bForeign)!.lines[0]).toMatchObject({ action: "skip", reason: "load_has_no_recorded_trailer" });

      // Real run.
      const run = await stampDriverBillTrailersFromLoads(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, actorRole: "Owner", dryRun: false });
      expect(run.refused_bills).toBe(0);
      expect(run.header_stamps).toBe(4);
      expect(run.line_stamps).toBe(5);
      expect(await trailers(bAssigned)).toEqual({ trailer: { t: tAssigned, n: null }, lines: [tAssigned] });
      expect(await trailers(bExpense)).toEqual({ trailer: { t: tExpense, n: null }, lines: [tExpense] });
      expect(await trailers(bLeased)).toEqual({ trailer: { t: tLeased, n: null }, lines: [tLeased] });
      expect(await trailers(bCustomer)).toEqual({ trailer: { t: null, n: nonOwned }, lines: [null] });
      expect(await trailers(bNone)).toEqual({ trailer: { t: null, n: null }, lines: [null] });
      expect(await trailers(bForeign)).toEqual({ trailer: { t: null, n: null }, lines: [null] });
      expect(await trailers(bMixed)).toEqual({ trailer: { t: null, n: null }, lines: [tAssigned, tExpense] });
      expect(await audits()).toBe(5); // assigned, expense, leased, customer, mixed (lines only)

      // Metadata only: every amount / account / status / unit / JE identical.
      expect(await snapshot()).toEqual(before);

      // Idempotent.
      const again = await stampDriverBillTrailersFromLoads(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, actorRole: "Owner", dryRun: false });
      expect(again.header_stamps + again.line_stamps).toBe(0);
      expect(await audits()).toBe(5);

      // Forward writer helper: a NEW driver bill takes its load's trailer in the writer's own transaction.
      const lNewCompany = await load("9"); await assign(lNewCompany, tAssigned);
      const bNewCompany = await bill("B8", [lNewCompany]);
      expect(await stampNewDriverBillTrailerFromLoad(db as never, { operatingCompanyId: opco, billId: bNewCompany, loadId: lNewCompany })).toBe("company");
      expect(await trailers(bNewCompany)).toEqual({ trailer: { t: tAssigned, n: null }, lines: [tAssigned] });
      const bNewCustomer = await bill("B9", [lCustomer]);
      expect(await stampNewDriverBillTrailerFromLoad(db as never, { operatingCompanyId: opco, billId: bNewCustomer, loadId: lCustomer })).toBe("non_owned");
      expect(await trailers(bNewCustomer)).toEqual({ trailer: { t: null, n: nonOwned }, lines: [null] });
      const bNewForeign = await bill("B10", [lForeign]);
      expect(await stampNewDriverBillTrailerFromLoad(db as never, { operatingCompanyId: opco, billId: bNewForeign, loadId: lForeign })).toBeNull();

      // The database refuses a bill naming both kinds.
      await db.query("SAVEPOINT both_kinds");
      const both = await db.query(`UPDATE accounting.bills SET non_owned_trailer_id = $2 WHERE id = $1`, [bAssigned, nonOwned]).catch((e) => e);
      expect(String((both as Error).message)).toMatch(/bills_one_trailer_kind/);
      await db.query("ROLLBACK TO SAVEPOINT both_kinds");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
