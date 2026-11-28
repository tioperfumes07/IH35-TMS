/**
 * OWNER RULING 2026-11-27 22:40 CT (L.31 M5 "Exempt ScentsX"): ScentsX LLC has no trucks, so its expenses post with no unit through the
 * ONE expense writer (Dr the category account / Cr the payment account); every trucking company keeps GO-19-1b's hard reject.
 * Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createExpenseInClientTx } from "../accounting/expense-writer.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("ScentsX expense with no unit (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  const acct = async (company: string, num: string) =>
    (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL LIMIT 1`, [company, num])).rows[0]?.id;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    co = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
    // Prod has these ON for ScentsX (lib.feature_flag_overrides, measured 2026-11-28); a fresh CI database turns them on here, rolled back.
    await db.query(
      `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
       SELECT f.flag_key, $1::uuid, true, $2::uuid FROM lib.feature_flags f WHERE f.flag_key = ANY ($3::text[])
       ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL DO UPDATE SET enabled = true`,
      [co, TEST_OWNER_USER_ID, ["GL_POSTING_ENABLED", "EXPENSE_GL_POSTING_ENABLED"]]);
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("ScentsX: rent expense with no unit, on the EXP-RENT item, posts Dr 6000 / Cr 1000", async () => {
    await db.query(`SELECT set_config('app.operating_company_id', $1, true)`, [co]);
    const rent = (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.items WHERE operating_company_id = $1::uuid AND item_code = 'EXP-RENT' AND deactivated_at IS NULL`, [co])).rows[0]!.id;
    const r = await createExpenseInClientTx(db as never, { operating_company_id: co, expense_date: "2026-11-27", amount_cents: 120000, category_account_id: await acct(co, "6000"),
      item_id: rent, payment_account_uuid: await acct(co, "1000"), memo: "Warehouse rent — November", is_company_expense: true } as never, TEST_OWNER_USER_ID) as Record<string, unknown>;
    expect(r.unitIdRequired).toBeUndefined();
    const row = (await db.query<{ unit_id: string | null; total: string }>(
      `SELECT unit_id::text, total_amount_cents::text AS total FROM accounting.expenses WHERE operating_company_id = $1::uuid AND memo = 'Warehouse rent — November'`, [co])).rows[0];
    expect(row).toMatchObject({ unit_id: null, total: "120000" });
    const lines = (await db.query<{ num: string; side: string; cents: string }>(
      `SELECT a.account_number AS num, p.debit_or_credit AS side, p.amount_cents::text AS cents FROM accounting.journal_entry_postings p
         JOIN catalogs.accounts a ON a.id = p.account_id JOIN accounting.expenses e ON e.id::text = p.source_transaction_id
        WHERE p.source_transaction_type = 'expense' AND e.memo = 'Warehouse rent — November' ORDER BY p.debit_or_credit DESC`)).rows.map((x) => [x.side, x.num, Number(x.cents)]);
    expect(lines).toEqual([["debit", "6000", 120000], ["credit", "1000", 120000]]);
  });
  it("a trucking company with no unit is still refused (GO-19-1b)", async () => {
    const other = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code IN ('USMCA', 'TRANSP', 'TRK') ORDER BY code LIMIT 1`)).rows[0]?.id;
    expect(other).toBeTruthy();
    await db.query(`SELECT set_config('app.operating_company_id', $1, true)`, [other!]);
    const r = await createExpenseInClientTx(db as never, { operating_company_id: other!, expense_date: "2026-11-27", amount_cents: 5000, memo: "no unit",
      is_company_expense: true } as never, TEST_OWNER_USER_ID) as Record<string, unknown>;
    expect(r).toEqual({ unitIdRequired: true });
  });
});
