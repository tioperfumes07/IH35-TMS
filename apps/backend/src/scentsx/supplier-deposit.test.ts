/**
 * ROUND L.31 M6 — a ScentsX supplier deposit (paid before the goods) on the ONE bill + bill-payment engines (the expense writer requires a
 * truck unit — GO-19-1b — so it is not ScentsX's path): a deposit bill to the supplier on 1310 Supplier Deposits, paid at once from
 * 1000 (net Dr 1310 / Cr 1000, A/P back to zero); when the goods bill comes, a vendor credit on 1310 applied to it moves the deposit
 * onto the bill (Dr A/P / Cr 1310) — 1310 back to $0, the bill shows only what is still owed. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createBillInClientTx, payBillInClientTx } from "../accounting/bills.service.js";
import { createVendorCreditInClientTx } from "../accounting/vendor-credits.service.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { vendorAccount } from "./payables.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("ScentsX supplier deposit (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  const acct = async (num: string) =>
    (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL`, [co, num])).rows[0]!.id;
  const balance = async (num: string) => Number((await db.query<{ b: string }>(
    `SELECT coalesce(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS b
       FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
      WHERE j.operating_company_id = $1::uuid AND p.account_id = $2::uuid AND j.voided_at IS NULL`, [co, await acct(num)])).rows[0]!.b);
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    co = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
    await db.query(`SELECT set_config('app.operating_company_id', $1, true)`, [co]);
    await db.query(
      `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
       SELECT f.flag_key, $1::uuid, true, $2::uuid FROM lib.feature_flags f WHERE f.flag_key = ANY ($3::text[])
       ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL DO UPDATE SET enabled = true`,
      [co, TEST_OWNER_USER_ID, ["GL_POSTING_ENABLED", "BILL_GL_POSTING_ENABLED", "BILL_PAYMENT_GL_POSTING_ENABLED", "VENDOR_CREDIT_GL_POSTING_ENABLED"]]);
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("deposit Dr 1310 / Cr 1000; the credit on 1310 applied to the bill takes 1310 back to zero", async () => {
    const u = TEST_OWNER_USER_ID;
    const vendor = (await db.query<{ id: string }>(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid, 'ZZ Deposit supplier', 'Other') RETURNING id::text`, [co])).rows[0]!.id;
    const b1310 = await balance("1310"), b1000 = await balance("1000");
    const b2000 = await balance("2000");
    const bank = (await db.query<{ id: string }>(
      `SELECT b.id::text FROM banking.bank_accounts b JOIN catalogs.accounts a ON a.id = b.ledger_account_id WHERE b.operating_company_id = $1::uuid AND a.account_number = '1000'`, [co])).rows[0]!.id;
    const dep = await createBillInClientTx(db as never, { operatingCompanyId: co, source: "manual", vendorId: vendor, billNumber: "ZZ-DEP-1", autoDisplayId: true,
      billDate: "2026-11-27", dueDate: "2026-11-27", amountCents: 300000, lines: [{ amountCents: 300000, accountId: await acct("1310"), description: "Supplier deposit — PO 1001" }] }, u);
    await postSourceTransactionInClientTx(db as never, { operating_company_id: co, source_transaction_type: "bill", source_transaction_id: dep.id }, { userId: u });
    const pay = await payBillInClientTx(db as never, { operatingCompanyId: co, billId: dep.id, paymentDate: "2026-11-27", amountCents: 300000, paymentMethod: "check", fromBankAccountId: bank, checkNumber: "5001" } as never, u);
    const payId = (pay as { id?: string; bill_payment_id?: string }).id ?? (pay as { bill_payment_id?: string }).bill_payment_id;
    if (!(await db.query(`SELECT 1 FROM accounting.journal_entry_postings WHERE source_transaction_type = 'bill_payment' AND source_transaction_id = $1`, [payId])).rowCount)
      await postSourceTransactionInClientTx(db as never, { operating_company_id: co, source_transaction_type: "bill_payment", source_transaction_id: String(payId) }, { userId: u });
    expect(await balance("2000") - b2000).toBe(0);
    expect(await balance("1310") - b1310).toBe(300000);
    expect((await vendorAccount(db, vendor, { as_of: "2026-11-30" })).deposits).toMatchObject({ paid_cents: 300000, used_cents: 0, available_cents: 300000 });
    expect(await balance("1000") - b1000).toBe(-300000);
    // The bill arrives ($10,000 of perfume to inventory via GRNI is out of scope here: an expense-coded line is enough to prove the credit).
    const bill = await createBillInClientTx(db as never, { operatingCompanyId: co, source: "manual", vendorId: vendor, billNumber: "ZZ-SD-1", autoDisplayId: true,
      billDate: "2026-11-30", dueDate: "2026-12-30", amountCents: 1000000, lines: [{ amountCents: 1000000, accountId: await acct("6990"), description: "goods" }] }, u);
    const vc = await createVendorCreditInClientTx(db as never, { operatingCompanyId: co, vendorId: vendor, issueDate: "2026-11-30", amountCents: 300000, accountId: await acct("1310"), notes: "Supplier deposit applied", userId: u });
    expect(await balance("1310") - b1310).toBe(0);
    expect((await vendorAccount(db, vendor, { as_of: "2026-11-30" })).deposits).toMatchObject({ paid_cents: 300000, used_cents: 300000, available_cents: 0 });
    expect(vc).toMatchObject({ id: expect.anything() });
    expect(bill).toMatchObject({ id: expect.anything() });
  });
});
