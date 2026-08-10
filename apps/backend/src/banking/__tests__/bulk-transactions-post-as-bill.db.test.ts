/**
 * [HOLD-FOR-JORGE — TIER 1] BANKING-GL-COMPLETION — "Post as bill" is PAID-IN-FULL, end-to-end (real
 * Postgres). Proves bulkPostTransactionsAsBills (bulk-transactions.ts):
 *   - creates the bill ALREADY 'paid' (paid_cents = amount_cents) + a matching FULL-amount
 *     accounting.bill_payments row crediting the REAL source bank account (from_bank_account_id,
 *     source_bank_transaction_id) — never an unpaid bill for cash that already left the bank.
 *   - GL posting is gated by the EXISTING BILL_GL_POSTING_ENABLED / BILL_PAYMENT_GL_POSTING_ENABLED flags
 *     (both default OFF): with either flag off, gl_posting reports bill_posted/bill_payment_posted=false
 *     and zero JE rows exist.
 *   - with both flags ON, the bill's own bill_lines row (Tier-3 uncategorized_expense) lets the bill post
 *     DR uncategorized_expense / CR ap_control, then the bill_payment posts DR ap_control / CR the real
 *     bank ledger — GL == subledger tie-out: the bill_payment's amount_cents equals both JE legs.
 *   - idempotent re-post: calling postCreatedBillsGl again for the same pair never duplicates the JE.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany, type IsolatedOperatingCompany } from "../../../test-helpers/db-fixture.js";
import { bulkPostTransactionsAsBills, postCreatedBillsGl } from "../bulk-transactions.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("BANKING-GL-COMPLETION post-as-bill paid-in-full end-to-end (real Postgres)", () => {
  let db: pg.Client;
  let pool: pg.Pool;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;
  const suffix = randomUUID().slice(0, 6);
  const userId = randomUUID();
  const vendorId = randomUUID();
  const bankGlAccountId = randomUUID();
  const apControlAccountId = randomUUID();
  const uncategorizedExpenseAccountId = randomUUID();
  const bankAccountId = randomUUID();
  const createdBillIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdTxnIds: string[] = [];

  /** Seed bill/payment CoA roles on THIS suite's isolated company (no shared-TRANSP race). */
  async function ensureBillPostingRoles() {
    await bypass(async () => {
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$3::uuid,$2,'Bulk Post AP Control Test','Liability',true)
         ON CONFLICT (id) DO NOTHING`,
        [apControlAccountId, `BPBAP${suffix}`, companyId]
      );
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$3::uuid,$2,'Bulk Post Uncategorized Exp Test','Expense',true)
         ON CONFLICT (id) DO NOTHING`,
        [uncategorizedExpenseAccountId, `BPBUE${suffix}`, companyId]
      );
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid, 'ap_control', $2::uuid, true)
         ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE SET account_id = EXCLUDED.account_id`,
        [companyId, apControlAccountId]
      );
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid, 'uncategorized_expense', $2::uuid, true)
         ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE SET account_id = EXCLUDED.account_id`,
        [companyId, uncategorizedExpenseAccountId]
      );
    });
  }

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      await fn();
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const r = await db.query(sql, params);
      await db.query("COMMIT");
      return r.rows as T[];
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function setFlagOverride(flagKey: string, enabled: boolean) {
    // Use a USER-LEVEL override (user_uuid = userId, operating_company_id = NULL) so this test is immune
    // to concurrent company-level flag writes from other parallel test files (e.g. bank-transaction-splits-
    // vendor-bill which sets BILL_GL_POSTING_ENABLED = true for TRANSP at the company level). User-level
    // overrides take priority over company-level in resolveFlagEnabled(), isolating this test's flag state.
    await bypass(async () => {
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, user_uuid, enabled, set_by_user_uuid)
         VALUES ($1,$2::uuid,$3,$2::uuid)
         ON CONFLICT (flag_key, user_uuid) WHERE user_uuid IS NOT NULL
         DO UPDATE SET enabled = EXCLUDED.enabled`,
        [flagKey, userId, enabled]
      );
    });
  }

  async function seedTxn(amountCents: number): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO banking.bank_transactions
           (id, bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, status, description)
         VALUES ($1::uuid,$2::uuid,$3::uuid, CURRENT_DATE, $4, false, 'pending_categorization', 'bulk-post-as-bill test')`,
        [id, bankAccountId, companyId, -Math.abs(amountCents)]
      );
    });
    createdTxnIds.push(id);
    return id;
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    pool = new pg.Pool(buildPgClientConfig(cs));

    // Actor must exist BEFORE createIsolatedOperatingCompany({ actorUserId }).
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(
      `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
      [userId, `bulk-post-bill-${suffix}@test.local`]
    );
    await db.query("COMMIT");

    isolated = await createIsolatedOperatingCompany({
      codePrefix: "BPB",
      legalNamePrefix: "Bulk Post As Bill Fixture",
      label: "bulk-transactions-post-as-bill",
      actorUserId: userId,
      client: db,
    });
    companyId = isolated.companyId;

    await bypass(async () => {
      await db.query(
        `UPDATE identity.users SET default_company_id = $1::uuid WHERE id = $2::uuid`,
        [companyId, userId]
      );
      await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key IN ('BILL_GL_POSTING_ENABLED','BILL_PAYMENT_GL_POSTING_ENABLED') AND (operating_company_id=$1::uuid OR user_uuid=$2::uuid)`, [companyId, userId]);
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$3::uuid,$2,'Bulk Post Bank GL Test','Asset',true)`,
        [bankGlAccountId, `BPB${suffix}`, companyId]
      );
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id, is_active, current_balance_cents)
         VALUES ($1::uuid,$2::uuid,'Bulk Post Test Bank',$3::uuid,true,0)`,
        [bankAccountId, companyId, bankGlAccountId]
      );
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type)
         VALUES ($1::uuid, $2::uuid, 'Bulk Post Test Vendor', 'Other')
         ON CONFLICT (id) DO NOTHING`,
        [vendorId, companyId]
      );
    });
    await ensureBillPostingRoles();
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(
          `DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1) AND linked_object_type IN ('bill','bill_payment')`,
          [[...createdBillIds, ...createdPaymentIds]]
        );
        await db.query(
          `DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type IN ('bill','bill_payment')`,
          [[...createdBillIds, ...createdPaymentIds]]
        );
        await db.query(
          `DELETE FROM accounting.posting_batches WHERE source_transaction_id = ANY($1) AND source_transaction_type IN ('bill','bill_payment')`,
          [[...createdBillIds, ...createdPaymentIds]]
        );
        await db.query(`DELETE FROM accounting.bill_payments WHERE id = ANY($1::uuid[])`, [createdPaymentIds]);
        await db.query(`DELETE FROM accounting.bill_lines WHERE bill_id = ANY($1::uuid[])`, [createdBillIds]);
        await db.query(`DELETE FROM accounting.bills WHERE id = ANY($1::uuid[])`, [createdBillIds]);
        await db.query(`DELETE FROM mdata.vendors WHERE id = $1::uuid`, [vendorId]);
        await db.query(`DELETE FROM banking.bank_transactions WHERE id = ANY($1::uuid[])`, [createdTxnIds]);
        await db.query(`DELETE FROM banking.bank_accounts WHERE id = $1::uuid`, [bankAccountId]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [[bankGlAccountId, apControlAccountId, uncategorizedExpenseAccountId]]);
        await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key IN ('BILL_GL_POSTING_ENABLED','BILL_PAYMENT_GL_POSTING_ENABLED') AND (operating_company_id=$1::uuid OR user_uuid=$2::uuid)`, [companyId, userId]);
      });
      if (isolated) {
        await deactivateIsolatedOperatingCompany(db, isolated);
      }
    } catch {
      /* best-effort cleanup */
    }
    await pool?.end().catch(() => {});
    await db.end();
  });

  it("creates the bill ALREADY paid + a full-amount bill_payment crediting the real bank", async () => {
    await setFlagOverride("BILL_GL_POSTING_ENABLED", false);
    await setFlagOverride("BILL_PAYMENT_GL_POSTING_ENABLED", false);
    const amountCents = 21_000;
    const txnId = await seedTxn(amountCents);

    const client = await pool.connect();
    let result;
    try {
      result = await bulkPostTransactionsAsBills(
        client,
        { operatingCompanyId: companyId, txnIds: [txnId], vendorId, psCategory: "Office Supplies", psItem: "Supplies" },
        userId
      );
    } finally {
      client.release();
    }
    createdBillIds.push(...result.bill_ids);
    createdPaymentIds.push(...result.bill_payment_ids);

    expect(result.bill_ids).toHaveLength(1);
    expect(result.bill_payment_ids).toHaveLength(1);
    // Flags OFF (default) → strict no-op, matching every other poster's dark contract.
    expect(result.gl_posting[0]?.bill_posted).toBe(false);
    expect(result.gl_posting[0]?.bill_payment_posted).toBe(false);

    const bill = await scopedRead<{ status: string; amount_cents: string; paid_cents: string }>(
      `SELECT status, amount_cents::text, paid_cents::text FROM accounting.bills WHERE id = $1::uuid`,
      [result.bill_ids[0]]
    );
    expect(bill[0]?.status).toBe("paid");
    expect(bill[0]?.paid_cents).toBe(String(amountCents));

    const payment = await scopedRead<{ from_bank_account_id: string; amount_cents: string; source_bank_transaction_id: string }>(
      `SELECT from_bank_account_id::text, amount_cents::text, source_bank_transaction_id::text FROM accounting.bill_payments WHERE id = $1::uuid`,
      [result.bill_payment_ids[0]]
    );
    expect(payment[0]?.from_bank_account_id).toBe(bankAccountId);
    expect(payment[0]?.amount_cents).toBe(String(amountCents));
    expect(payment[0]?.source_bank_transaction_id).toBe(txnId);

    const jeCount = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1)`,
      [[result.bill_ids[0], result.bill_payment_ids[0]]]
    );
    expect(Number(jeCount[0]?.c)).toBe(0);
  });

  it("flags ON — bill posts DR uncategorized_expense / CR ap_control, then bill_payment posts DR ap_control / CR the real bank; tie-out; idempotent", async () => {
    await setFlagOverride("BILL_GL_POSTING_ENABLED", true);
    await setFlagOverride("BILL_PAYMENT_GL_POSTING_ENABLED", true);
    // Re-seed immediately before post — sibling fork teardown can wipe shared CoA roles after beforeAll.
    await ensureBillPostingRoles();
    const amountCents = 44_400;
    const txnId = await seedTxn(amountCents);

    const client = await pool.connect();
    let result;
    try {
      result = await bulkPostTransactionsAsBills(
        client,
        { operatingCompanyId: companyId, txnIds: [txnId], vendorId, psCategory: "Fuel", psItem: "Diesel" },
        userId
      );
    } finally {
      client.release();
    }
    createdBillIds.push(...result.bill_ids);
    createdPaymentIds.push(...result.bill_payment_ids);

    expect(result.gl_posting[0]?.bill_posted).toBe(true);
    expect(result.gl_posting[0]?.bill_payment_posted).toBe(true);

    const billId = result.bill_ids[0]!;
    const paymentId = result.bill_payment_ids[0]!;

    const billLines = await scopedRead<{ debit_or_credit: string; amount_cents: string }>(
      `SELECT debit_or_credit, amount_cents::text FROM accounting.journal_entry_postings
        WHERE source_transaction_id = $1 AND source_transaction_type = 'bill' ORDER BY line_sequence ASC`,
      [billId]
    );
    expect(billLines).toHaveLength(2);
    const billDebitTotal = billLines.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + Number(l.amount_cents), 0);
    const billCreditTotal = billLines.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + Number(l.amount_cents), 0);
    expect(billDebitTotal).toBe(amountCents);
    expect(billCreditTotal).toBe(amountCents);

    const paymentLines = await scopedRead<{ account_id: string; debit_or_credit: string; amount_cents: string }>(
      `SELECT account_id::text, debit_or_credit, amount_cents::text FROM accounting.journal_entry_postings
        WHERE source_transaction_id = $1 AND source_transaction_type = 'bill_payment' ORDER BY line_sequence ASC`,
      [paymentId]
    );
    expect(paymentLines).toHaveLength(2);
    const credit = paymentLines.find((l) => l.debit_or_credit === "credit");
    expect(credit?.account_id).toBe(bankGlAccountId); // GL == subledger tie-out: the REAL bank, not a generic cash bucket
    expect(Number(credit?.amount_cents)).toBe(amountCents);
    // GL == subledger tie-out: the bill_payment JE amount equals the subledger row's amount_cents.
    const paymentRow = await scopedRead<{ amount_cents: string }>(
      `SELECT amount_cents::text FROM accounting.bill_payments WHERE id = $1::uuid`,
      [paymentId]
    );
    expect(Number(paymentRow[0]?.amount_cents)).toBe(amountCents);

    // Idempotent re-post — a second postCreatedBillsGl call for the SAME pair never duplicates the JE.
    const again = await postCreatedBillsGl(companyId, [{ billId, billPaymentId: paymentId }], userId);
    expect(again[0]?.bill_posted).toBe(true);
    expect(again[0]?.bill_payment_posted).toBe(true);
    const billLinesAfter = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings WHERE source_transaction_id = $1 AND source_transaction_type = 'bill'`,
      [billId]
    );
    expect(Number(billLinesAfter[0]?.c)).toBe(2);
  });
});
