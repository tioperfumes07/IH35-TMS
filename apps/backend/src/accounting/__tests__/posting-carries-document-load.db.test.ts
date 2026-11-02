/**
 * LEAD 443.110 G8 — real Postgres: every posting carries its source document's load (and party), through the ONE
 * posting writer (insertPostingLineWithSpine), and only ever its OWN company's load. Every fixture lives in ONE
 * transaction that is rolled back — nothing is left behind.
 *
 *  - fuel_event        -> the fuel transaction's load (+ its vendor)
 *  - factoring event   -> the factoring advance's source_load_id (customer payment; posting_source_load_id only maps
 *                         'factoring_advance', so these events used to post with no load)
 *  - driver_advance    -> the advance's load + its driver (the cash-advance JE lines)
 *  - bank_categorization -> the categorized bank line's load + its vendor (a split names its own vendor first)
 *  - a document naming ANOTHER company's load never stamps it; a caller passing one is refused by name
 *  - a document with no load -> load_id NULL
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { PostingLoadOfAnotherCompanyError } from "../posting-line-writer.js";
import { postBalancedSourceLine } from "../../../test-helpers/post-balanced-source-line.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("postings carry their source document's load (443.110 G8, real Postgres)", () => {
  it("fuel / factoring / driver advance / bank categorization stamp load + party; foreign load never; no-load doc null", async () => {
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
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const co = async (code: string) =>
        (await one(`INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
          [code, `G8 posting load test ${code}`])).id;
      const opco = await co(`${tag}A`);
      const other = await co(`${tag}B`);

      const loadIn = async (company: string, n: string) => {
        await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company]);
        const trailerType = await prepareCompanyForLoadInserts(db, company);
        const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`,
          [company, `TST customer ${n}`])).id;
        return (await one(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
          [company, `${tag}${n}`, customer, TEST_OWNER_USER_ID, trailerType]
        )).id;
      };
      const foreignLoad = await loadIn(other, "F1");
      const load = await loadIn(opco, "L1");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);

      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'TST G8 vendor', 'other') RETURNING id::text AS id`, [opco])).id;
      const splitVendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'TST G8 split vendor', 'other') RETURNING id::text AS id`, [opco])).id;
      const factor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'TST G8 factor', 'other') RETURNING id::text AS id`, [opco])).id;
      const driver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Tst', 'G8', '5555550108') RETURNING id::text AS id`, [opco])).id;
      const account = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, 'TST G8 expense', 'Expense', '96908') RETURNING id::text AS id`, [opco])).id;
      const je = (await one(`INSERT INTO accounting.journal_entries (operating_company_id, entry_date, memo) VALUES ($1, CURRENT_DATE, 'TST G8') RETURNING id::text AS id`, [opco])).id;
      const bank = (await one(`INSERT INTO banking.bank_accounts (operating_company_id) VALUES ($1) RETURNING id::text AS id`, [opco])).id;

      // Source documents.
      const fuel = (await one(`INSERT INTO fuel.fuel_transactions (operating_company_id, source_row_hash, load_id, vendor_id) VALUES ($1, $2, $3, $4) RETURNING id::text AS id`,
        [opco, `${tag}-fuel`, load, vendor])).id;
      const advance = (await one(
        `INSERT INTO accounting.factoring_advances (operating_company_id, factoring_company_vendor_id, display_id, invoice_total_cents,
           advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents, source_load_id)
         VALUES ($1, $2, $3, 100000, 90, 90000, 10, 10000, $4) RETURNING id::text AS id`,
        [opco, factor, `${tag}-FA`, load])).id;
      const liability = (await one(
        `INSERT INTO driver_finance.driver_liabilities (operating_company_id, driver_id, type, source_description, original_amount, current_balance)
         VALUES ($1, $2, 'advance', 'TST G8', 100, 100) RETURNING id::text AS id`, [opco, driver])).id;
      const driverAdvance = (await one(
        `INSERT INTO driver_finance.driver_advances (operating_company_id, display_id, driver_id, liability_id, amount, purpose, disbursement_method,
           disbursement_status, recipient_type, created_by_user_id, load_id)
         VALUES ($1, $2, $3, $4, 100, 'TST G8', 'cash', 'disbursed', 'driver', $5, $6) RETURNING id::text AS id`,
        [opco, `${tag}-DA`, driver, liability, TEST_OWNER_USER_ID, load])).id;
      const bankLine = (await one(
        `INSERT INTO banking.bank_transactions (operating_company_id, bank_account_id, transaction_date, amount_cents, categorization_load_id, categorization_vendor_id)
         VALUES ($1, $2, CURRENT_DATE, 5000, $3, $4) RETURNING id::text AS id`, [opco, bank, load, vendor])).id;
      const split = (await one(
        `INSERT INTO banking.bank_transaction_splits (operating_company_id, bank_transaction_id, line_no, amount_cents, load_id, vendor_id) VALUES ($1, $2, 1, 5000, $3, $4) RETURNING id::text AS id`,
        [opco, bankLine, load, splitVendor])).id;
      const foreignBankLine = (await one(
        `INSERT INTO banking.bank_transactions (operating_company_id, bank_account_id, transaction_date, amount_cents, categorization_load_id, categorization_vendor_id)
         VALUES ($1, $2, CURRENT_DATE, 700, $3, $4) RETURNING id::text AS id`, [opco, bank, foreignLoad, vendor])).id;
      const plainBankLine = (await one(
        `INSERT INTO banking.bank_transactions (operating_company_id, bank_account_id, transaction_date, amount_cents, categorization_vendor_id)
         VALUES ($1, $2, CURRENT_DATE, 300, $3) RETURNING id::text AS id`, [opco, bank, vendor])).id;

      let seq = 0;
      const post = async (type: string, id: string, extra: Record<string, unknown> = {}) => {
        seq += 1;
        const postingId = await postBalancedSourceLine(db as never, {
          operating_company_id: opco,
          journal_entry_uuid: je,
          line_sequence: seq,
          account_id: account,
          debit_or_credit: seq % 2 ? "debit" : "credit",
          amount_cents: 100,
          description: `TST G8 ${type}`,
          source_transaction_type: type,
          source_transaction_id: id,
          ...extra,
        } as never);
        return one<{ load_id: string | null; entity_uuid: string | null; entity_type: string | null }>(
          `SELECT load_id::text, entity_uuid::text, entity_type FROM accounting.journal_entry_postings WHERE id = $1::uuid`, [postingId]);
      };

      // Fuel: load + vendor from the fuel transaction.
      expect(await post("fuel_event", fuel)).toEqual({ load_id: load, entity_uuid: vendor, entity_type: "vendor" });
      // Factoring lifecycle event sourced by its advance: the advance's load.
      expect((await post("factoring_customer_payment", advance)).load_id).toBe(load);
      expect((await post("factoring_reserve_release", advance)).load_id).toBe(load);
      // Cash-advance JE line: the advance's load + its driver.
      expect(await post("driver_advance", driverAdvance)).toEqual({ load_id: load, entity_uuid: driver, entity_type: "driver" });
      // Bank categorization: the line's load + vendor; a split names its own vendor first.
      expect(await post("bank_categorization", bankLine)).toEqual({ load_id: load, entity_uuid: vendor, entity_type: "vendor" });
      expect(await post("bank_categorization", bankLine, { source_transaction_line_id: split })).toEqual({ load_id: load, entity_uuid: splitVendor, entity_type: "vendor" });
      // A document naming another company's load: the derived load never stamps.
      expect((await post("bank_categorization", foreignBankLine)).load_id).toBeNull();
      // A document with no load: NULL (its party still stamps).
      expect(await post("bank_categorization", plainBankLine)).toEqual({ load_id: null, entity_uuid: vendor, entity_type: "vendor" });
      // A caller passing another company's load is refused by name.
      await db.query("SAVEPOINT foreign_explicit");
      await expect(post("bank_categorization", plainBankLine, { load_id: foreignLoad })).rejects.toBeInstanceOf(PostingLoadOfAnotherCompanyError);
      await db.query("ROLLBACK TO SAVEPOINT foreign_explicit");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
