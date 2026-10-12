import pg from "pg";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { addSettlementPayLineInClientTx, PAY_LINE_KINDS } from "../settlement-pay-line.service.js";
import { loadSettlementPayItems } from "../settlement-payrun-close.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("BCF-09 selected pay item (isolated PostgreSQL)", () => {
  it("keeps every send-back assertion and rejects removal of USMCA scope on PostgreSQL 16", () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    refuseProductionConnectionString(cs);
    const root = fileURLToPath(new URL("../../../../../", import.meta.url));
    const result = spawnSync(process.execPath, ["scripts/verify-send-back-preserves-the-match-and-its-load.mjs", "--selftest"], {
      cwd: root, env: { ...process.env, SELFTEST_DATABASE_URL: cs }, encoding: "utf8",
    });
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(result.stdout).toContain("selftest 21/21");
  });
  it("rejects the old extra-pay INSERT, accepts every pay kind with its item's account, and refuses unavailable items", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const id = async (sql: string, params: unknown[]) => (await db.query<{ id: string }>(sql + " RETURNING id::text", params)).rows[0]!.id;
      const tag = `BCF9${Date.now().toString(36).toUpperCase()}`;
      const company = await id("INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, 'Isolated pay-item fixture', 'operating_carrier')", [tag]);
      await db.query("SELECT set_config('app.operating_company_id', $1, true)", [company]);
      const trailerType = await prepareCompanyForLoadInserts(db, company);
      const account = await id("INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable) VALUES ($1, 'Isolated pay expense', 'Expense', '96409', true)", [company]);
      const category = await id("INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) VALUES ($1, 'BCF9', 'Isolated category')", [company]);
      const item = await id("INSERT INTO catalogs.items (operating_company_id, item_name, item_type, category_id, default_expense_account_id) VALUES ($1, 'Isolated selected pay item', 'Service', $2, $3)", [company, category, account]);
      const driver = await id("INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Isolated', 'Paydriver', '5555550144')", [company]);
      const customer = await id("INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'Isolated customer')", [company]);
      const loadNumber = `9${String(Date.now()).slice(-9)}`;
      const load = await id("INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id) VALUES ($1, $2, $3, $4, $5)", [company, loadNumber, customer, TEST_OWNER_USER_ID, trailerType]);
      const settlement = await id("INSERT INTO driver_finance.driver_settlements (operating_company_id, display_id, driver_id, period_start, period_end, status, gross_pay, deductions_total, reimbursements_total, net_pay, settlement_model) VALUES ($1, $2, $3, CURRENT_DATE-7, CURRENT_DATE, 'open', 0, 0, 0, 0, 'load_bookended')", [company, tag, driver]);
      await db.query("INSERT INTO driver_finance.driver_bills (operating_company_id, load_id, load_number, bill_number, driver_id, gross_amount_cents, status, settled_in_settlement_id) VALUES ($1, $2, $3, $3, $4, 0, 'open', $5)", [company, load, loadNumber, driver, settlement]);

      // Execute the pre-fix write against the migrated CHECK, not a mock or a weakened schema.
      await db.query("SAVEPOINT old_writer");
      await expect(db.query("INSERT INTO driver_finance.settlement_lines (settlement_id, operating_company_id, line_type, description, amount, load_id, category, source_type, posting_account_id, is_active, is_sample_data) VALUES ($1, $2, 'extra_pay', 'Old writer', 15, $3, 'bonus', 'settlement_pay_line', $4, true, false)", [settlement, company, load, account]))
        .rejects.toMatchObject({ code: "23514", constraint: "settlement_lines_extra_pay_requires_item" });
      await db.query("ROLLBACK TO SAVEPOINT old_writer");

      const input = { operatingCompanyId: company, settlementId: settlement, itemId: item, amountCents: 1569, transactionDate: "2026-10-12", loadId: load, actorUserId: TEST_OWNER_USER_ID };
      for (const kind of PAY_LINE_KINDS) {
        const result = await addSettlementPayLineInClientTx(db as never, { ...input, kind });
        const row = (await db.query("SELECT item_id::text, posting_account_id::text, load_id::text, quantity::text, rate_cents::text, amount::text, unit_of_measure FROM driver_finance.settlement_lines WHERE id = $1", [result.settlement_line_id])).rows[0];
        expect(row).toMatchObject({ item_id: item, posting_account_id: account, load_id: load, rate_cents: "1569.0000", amount: "15.69", unit_of_measure: "each" });
        expect(Number(row.quantity)).toBe(1);
      }
      await expect(addSettlementPayLineInClientTx(db as never, { ...input, kind: "bonus", itemId: "" })).rejects.toMatchObject({ code: "PAY_LINE_ITEM_REQUIRED" });
      const otherCompany = await id("INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, 'Other isolated company', 'operating_carrier')", [`${tag}B`]);
      const otherAccount = await id("INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable) VALUES ($1, 'Other pay expense', 'Expense', '96409', true)", [otherCompany]);
      const otherCategory = await id("INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name) VALUES ($1, 'BCF9', 'Other category')", [otherCompany]);
      const otherItem = await id("INSERT INTO catalogs.items (operating_company_id, item_name, item_type, category_id, default_expense_account_id) VALUES ($1, 'Other company pay item', 'Service', $2, $3)", [otherCompany, otherCategory, otherAccount]);
      await expect(addSettlementPayLineInClientTx(db as never, { ...input, kind: "bonus", itemId: otherItem })).rejects.toMatchObject({ code: "PAY_LINE_ITEM_UNMAPPED" });
      const payItems = await loadSettlementPayItems(db as never, company, settlement, {
        driverPay: "00000000-0000-4000-8000-000000000009", detention: null, reimbursementByType: async () => null,
      });
      expect(payItems).toHaveLength(PAY_LINE_KINDS.length);
      for (const payItem of payItems) expect(payItem).toMatchObject({ accountId: account, itemId: item, cents: 1569, loadId: load });
      // The existing database guard also refuses making a referenced item account non-postable.
      await db.query("SAVEPOINT account_refusal");
      await expect(db.query("UPDATE catalogs.accounts SET is_postable = false WHERE id = $1", [account])).rejects.toMatchObject({ code: "23514" });
      await db.query("ROLLBACK TO SAVEPOINT account_refusal");
      await db.query("UPDATE catalogs.items SET default_expense_account_id = NULL WHERE id = $1", [item]);
      await expect(addSettlementPayLineInClientTx(db as never, { ...input, kind: "bonus" })).rejects.toMatchObject({ code: "PAY_LINE_ITEM_UNMAPPED" });
      await db.query("UPDATE catalogs.items SET default_expense_account_id = $2 WHERE id = $1", [item, account]);
      await db.query("UPDATE catalogs.items SET deactivated_at = now() WHERE id = $1", [item]);
      await expect(addSettlementPayLineInClientTx(db as never, { ...input, kind: "bonus" })).rejects.toMatchObject({ code: "PAY_LINE_ITEM_UNMAPPED" });
      expect((await db.query("SELECT count(*)::int n FROM driver_finance.settlement_lines WHERE settlement_id = $1", [settlement])).rows[0].n).toBe(PAY_LINE_KINDS.length);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  }, 60_000);
});
