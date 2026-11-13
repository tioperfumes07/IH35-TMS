/**
 * ENG-38 PERIOD-LOCK ENGINE — real Postgres proof of db/migrations/202616580100_period_lock_engine_all_money_documents.sql.
 * A closed period refuses every create / money edit / delete of a document dated in it, and every line change under
 * such a document; unrelated stamps and edits in an open period still pass; reopening the period lifts the lock.
 * Uses a throwaway company with a 2020-01 period. Runs only in CI (GITHUB_ACTIONS=true); never touches production.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ENG-38 period-lock engine (real Postgres)", () => {
  let db: pg.Client;
  const co = randomUUID();
  const account = randomUUID();
  const item = randomUUID();
  const closedExpense = randomUUID();
  const openExpense = randomUUID();
  const sfx = co.slice(0, 6);

  async function tx<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [co]);
    try {
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function refused(p: Promise<unknown>) {
    let msg = "";
    try { await p; } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain("IH35_CLOSED_PERIOD");
  }

  const setPeriod = (status: "open" | "closed") =>
    tx(() => db.query("UPDATE accounting.periods SET status = $2 WHERE operating_company_id = $1 AND period_end = '2020-01-31'", [co, status]));

  const insertExpense = (id: string, date: string) =>
    tx(() => db.query(
      `INSERT INTO accounting.expenses (id, operating_company_id, transaction_date, total_amount_cents, payee_kind, payment_type)
       VALUES ($1, $2, $3, 1000, 'vendor', 'expense')`, [id, co, date]));

  const insertLine = (expenseId: string, seq: number) =>
    tx(() => db.query(
      `INSERT INTO accounting.expense_lines (expense_id, line_sequence, operating_company_id, amount_cents, expense_account_uuid, item_id,
                                            quantity, rate_cents, unit_of_measure)
       VALUES ($1, $2, $3, 1000, $4, $5, 1, 1000, 'each')`, [expenseId, seq, co, account, item]));

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await tx(async () => {
      await db.query(`INSERT INTO org.companies (id, code, legal_name, company_type) VALUES ($1, $2, $3, 'operating_carrier')`,
        [co, `E38${sfx}`, `ENG38 Period Lock ${sfx}`]);
      await db.query(`INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type) VALUES ($1, $2, '6938', 'ENG38 Fuel', 'Expense')`,
        [account, co]);
      await db.query(`INSERT INTO catalogs.items (id, operating_company_id, item_name, item_type) VALUES ($1, $2, 'ENG38 Diesel', 'Service')`,
        [item, co]);
      await db.query(`INSERT INTO accounting.periods (operating_company_id, period_start, period_end, fiscal_year, status)
                      VALUES ($1, '2020-01-01', '2020-01-31', 2020, 'open')`, [co]);
    });
    // Documents keyed while January was open.
    await insertExpense(closedExpense, "2020-01-15");
    await insertLine(closedExpense, 1);
    await insertExpense(openExpense, "2020-02-10");
    await setPeriod("closed");
  });

  afterAll(async () => {
    await setPeriod("open").catch(() => {});
    await db?.end();
  });

  it("refuses a new document dated in the closed month", async () => {
    await refused(insertExpense(randomUUID(), "2020-01-20"));
  });

  it("refuses changing the amount of a closed-month document", async () => {
    await refused(tx(() => db.query("UPDATE accounting.expenses SET total_amount_cents = 2000 WHERE id = $1", [closedExpense])));
  });

  it("refuses moving a closed-month document out to an open month", async () => {
    await refused(tx(() => db.query("UPDATE accounting.expenses SET transaction_date = '2020-02-01' WHERE id = $1", [closedExpense])));
  });

  it("refuses moving an open-month document into the closed month", async () => {
    await refused(tx(() => db.query("UPDATE accounting.expenses SET transaction_date = '2020-01-31' WHERE id = $1", [openExpense])));
  });

  it("refuses deleting a closed-month document", async () => {
    await refused(tx(() => db.query("DELETE FROM accounting.expenses WHERE id = $1", [closedExpense])));
    await refused(tx(() => db.query("DELETE FROM accounting.expense_lines WHERE expense_id = $1", [closedExpense])));
  });

  it("refuses adding or changing a line under a closed-month document", async () => {
    await refused(insertLine(closedExpense, 2));
    await refused(tx(() => db.query("UPDATE accounting.expense_lines SET amount_cents = 500, rate_cents = 500 WHERE expense_id = $1", [closedExpense])));
  });

  it("lets a non-money stamp on a closed-month document through", async () => {
    await tx(() => db.query("UPDATE accounting.expenses SET print_status = 'print_complete' WHERE id = $1", [closedExpense]));
    const r = await db.query("SELECT print_status FROM accounting.expenses WHERE id = $1", [closedExpense]);
    expect(r.rows[0]?.print_status).toBe("print_complete");
  });

  it("leaves open-month documents fully editable", async () => {
    await tx(() => db.query("UPDATE accounting.expenses SET total_amount_cents = 1500 WHERE id = $1", [openExpense]));
    await insertLine(openExpense, 1);
  });

  it("reopening the month lifts the lock (reverse)", async () => {
    await setPeriod("open");
    await tx(() => db.query("UPDATE accounting.expenses SET total_amount_cents = 1200 WHERE id = $1", [closedExpense]));
    await setPeriod("closed");
  });
});
