/**
 * ScentsX General Ledger (ROUND L.31 M16 remainder) — read only over posted lines. A $50.00 credit memo to 4800 (Dr 4800 / Cr 1100) and a
 * $30.00 refund by check (Dr 1100 / Cr 1000) are posted by the product's own writers; the GL for the period then shows exactly those lines
 * per account with natural-side running balances (1000 asset: -3000; 1100 asset: -5000 then -2000; 4800 income: -5000), and the
 * period's debits equal its credits. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createCreditMemoInClientTx } from "../accounting/credit-memo-create.service.js";
import { createCustomerRefundInClientTx } from "../accounting/customer-refunds.service.js";
import { generalLedger, glQuery } from "./general-ledger.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("ScentsX general ledger (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  const acct = async (num: string) =>
    (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL`, [co, num])).rows[0]!.id;
  const lines = async (id: string) =>
    (await db.query<{ num: string; side: string; cents: string; je: string }>(
      `SELECT a.account_number AS num, p.debit_or_credit AS side, p.amount_cents::text AS cents, j.id::text AS je
         FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
         JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE j.operating_company_id = $1::uuid AND p.source_transaction_type = 'customer_refund' AND p.source_transaction_id = $2
        ORDER BY j.created_at, p.debit_or_credit DESC, a.account_number`,
      [co, id]
    )).rows;
  const memo = async (id: string) =>
    (await db.query<{ left: string; status: string }>(`SELECT (amount_cents - amount_applied_cents)::text AS left, status FROM accounting.credit_memos WHERE id = $1::uuid`, [id])).rows[0]!;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    co = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
    await db.query(`SELECT set_config('app.operating_company_id', $1, true)`, [co]);
    await db.query(
      `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
       SELECT f.flag_key, $1::uuid, true, $2::uuid FROM lib.feature_flags f WHERE f.flag_key = ANY ($3::text[])
       ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL DO UPDATE SET enabled = true`,
      [co, TEST_OWNER_USER_ID, ["GL_POSTING_ENABLED"]]
    );
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("shows each posted line per account with natural-side running balances, and the period balances", async () => {
    const u = TEST_OWNER_USER_ID;
    const day = (await db.query<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Chicago')::date::text AS d`)).rows[0]!.d;
    const before = await generalLedger(db as never, glQuery.parse({ from: day, to: day }));
    const cust = (await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('GL test buyer', $1::uuid, false) RETURNING id::text`, [co])).rows[0]!.id;
    const cm = await createCreditMemoInClientTx(db as never, { operatingCompanyId: co, userId: u, input: { customer_id: cust, amount_cents: 5000, reason: "damage",
      account_id: await acct("4800"), issue_date: day } });
    const cmId = (cm as { data: { id: string } }).data.id;
    const bank = (await db.query<{ id: string }>(
      `SELECT b.id::text FROM banking.bank_accounts b JOIN catalogs.accounts a ON a.id = b.ledger_account_id
        WHERE b.operating_company_id = $1::uuid AND a.account_number = '1000' AND b.deactivated_at IS NULL LIMIT 1`, [co])).rows[0]!.id;
    const r = await createCustomerRefundInClientTx(db as never, { operatingCompanyId: co, userId: u, input: { credit_memo_id: cmId, bank_account_id: bank,
      amount_cents: 3000, refund_date: day, method: "check" } });
    const refundId = (r as { data: { refund: { id: string } } }).data.refund.id;

    const gl = await generalLedger(db as never, glQuery.parse({ from: day, to: day }));
    expect(gl.totals.debit_cents - before.totals.debit_cents).toBe(8000);
    expect(gl.totals.credit_cents - before.totals.credit_cents).toBe(8000);
    expect(gl.totals.debit_cents).toBe(gl.totals.credit_cents);
    const acc = (n: string) => gl.accounts.find((a) => a.account_number === n)!;
    const mine = (n: string) => acc(n).lines.filter((l) => l.source_transaction_id === cmId || l.source_transaction_id === refundId);
    expect(acc("4800").normal_side).toBe("credit");
    expect(mine("4800").map((l) => [l.debit_cents, l.credit_cents])).toEqual([[5000, 0]]);
    // Both documents post inside this one rolled-back transaction (same created_at), so their order within the day is not asserted.
    expect(mine("1100").map((l) => [l.source_transaction_type, l.debit_cents, l.credit_cents]).sort()).toEqual([["credit_memo", 0, 5000], ["customer_refund", 3000, 0]]);
    expect(mine("1000").map((l) => [l.source_transaction_type, l.debit_cents, l.credit_cents])).toEqual([["customer_refund", 0, 3000]]);
    for (const a of gl.accounts) {
      const sign = a.normal_side === "debit" ? 1 : -1;
      expect(a.closing_cents).toBe(a.opening_cents + sign * (a.debit_cents - a.credit_cents));
      if (a.lines.length) expect(a.lines[a.lines.length - 1]!.balance_cents).toBe(a.closing_cents);
    }
    const one = await generalLedger(db as never, glQuery.parse({ from: day, to: day, account_id: acc("1000").account_id }));
    expect(one.accounts.map((a) => a.account_number)).toEqual(["1000"]);
    expect(() => glQuery.parse({ from: "2026-12-01", to: "2026-11-01" })).toThrow();
  });
});
