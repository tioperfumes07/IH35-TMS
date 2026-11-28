/**
 * CUSTOMER REFUNDS (owner 2026-11-27 22:40 CT "Build refund engine": one refund document per credit, posting Dr the customer's credit /
 * Cr bank, with a test proving the entry before it is used). On ScentsX: a $50.00 credit memo to 4800 Sales Returns & Allowances left
 * unapplied (the customer's credit), then $30.00 of it refunded by check from Operating Checking —
 *   · the refund posts Dr 1100 A/R 3000 / Cr 1000 Operating Checking 3000 through the posting engine (source customer_refund);
 *   · the credit memo has $20.00 left; a refund over what is left is refused; the credit memo cannot be voided while refunded;
 *   · voiding the refund reverses it (Dr 1000 / Cr 1100) and the $30.00 goes back to the credit memo.
 * Real Postgres, rolled back. The writers are the product's own (createCreditMemoInClientTx, createCustomerRefundInClientTx,
 * voidCustomerRefundInClientTx) — no GL math here.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createCreditMemoInClientTx } from "../accounting/credit-memo-create.service.js";
import { createCustomerRefundInClientTx, liveRefundCentsForCreditMemo, voidCustomerRefundInClientTx } from "../accounting/customer-refunds.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("customer refund of a credit memo (ScentsX, real Postgres, rolled back)", () => {
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

  it("refund posts Dr A/R / Cr bank, consumes the credit, refuses over-refund and memo void, and voids back", async () => {
    const u = TEST_OWNER_USER_ID;
    const cust = (await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('Refund test buyer', $1::uuid, false) RETURNING id::text`, [co])).rows[0]!.id;
    const cm = await createCreditMemoInClientTx(db as never, { operatingCompanyId: co, userId: u, input: { customer_id: cust, amount_cents: 5000, reason: "damage",
      account_id: await acct("4800"), notes: "Returned damaged bottle" } });
    expect("error" in cm ? cm : "ok").toBe("ok");
    const cmId = (cm as { data: { id: string } }).data.id;
    const bank = (await db.query<{ id: string }>(
      `SELECT b.id::text FROM banking.bank_accounts b JOIN catalogs.accounts a ON a.id = b.ledger_account_id
        WHERE b.operating_company_id = $1::uuid AND a.account_number = '1000' AND b.deactivated_at IS NULL LIMIT 1`, [co])).rows[0]!.id;

    const r = await createCustomerRefundInClientTx(db as never, { operatingCompanyId: co, userId: u, input: {
      credit_memo_id: cmId, bank_account_id: bank, amount_cents: 3000, method: "check", reference: "1042", idempotency_key: `test-refund-${cmId}` } });
    expect("error" in r ? r : r.code).toBe(201);
    const refund = (r as { data: { refund: { id: string; display_id: string; journal_entry_id: string; amount_cents: number } } }).data.refund;
    expect(refund.display_id).toMatch(/^RF-\d{4}-\d{5}$/);
    expect(refund.amount_cents).toBe(3000);
    const posted = await lines(refund.id);
    expect(posted.map((l) => [l.side, l.num, Number(l.cents)])).toEqual([["debit", "1100", 3000], ["credit", "1000", 3000]]);
    expect(posted.every((l) => l.je === refund.journal_entry_id)).toBe(true);
    expect(await memo(cmId)).toEqual({ left: "2000", status: "issued" });

    // A double-submit of the same refund returns the same document (no second posting).
    const again = await createCustomerRefundInClientTx(db as never, { operatingCompanyId: co, userId: u, input: {
      credit_memo_id: cmId, bank_account_id: bank, amount_cents: 3000, method: "check", reference: "1042", idempotency_key: `test-refund-${cmId}` } });
    expect((again as { data: { refund: { id: string }; replayed?: boolean } }).data).toMatchObject({ refund: { id: refund.id }, replayed: true });
    expect((await lines(refund.id)).length).toBe(2);

    // Cannot refund more than the credit has left.
    const over = await createCustomerRefundInClientTx(db as never, { operatingCompanyId: co, userId: u, input: {
      credit_memo_id: cmId, bank_account_id: bank, amount_cents: 2001, method: "ach" } });
    expect(over).toMatchObject({ code: 422, error: "refund_exceeds_credit" });
    expect(await liveRefundCentsForCreditMemo(db as never, co, cmId)).toBe(3000);

    // Void: the posting reverses and the credit comes back.
    const v = await voidCustomerRefundInClientTx(db as never, { operatingCompanyId: co, userId: u, refundId: refund.id, reason: "check never cashed" });
    expect("error" in v ? v : v.code).toBe(200);
    const after = await lines(refund.id);
    const net = new Map<string, number>();
    for (const l of after) net.set(l.num, (net.get(l.num) ?? 0) + (l.side === "debit" ? 1 : -1) * Number(l.cents));
    expect(Object.fromEntries(net)).toEqual({ "1000": 0, "1100": 0 });
    expect(after.length).toBe(4);
    expect(await memo(cmId)).toEqual({ left: "5000", status: "issued" });
    expect(await liveRefundCentsForCreditMemo(db as never, co, cmId)).toBe(0);
  });
});
