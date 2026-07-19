/**
 * [HOLD-FOR-JORGE — TIER 1] BANKING-GL-COMPLETION — atomic vendor-bill split line (real Postgres).
 *
 * Proves the CPA-required one-transaction architecture:
 *   - PAID-IN-FULL bill + bill_payment + both JE legs in one unit (postSourceTransactionInClientTx)
 *   - Dual JE/account/balance/source proof before posted=true
 *   - Failure rollback leaves ZERO bill/payment/JE artifacts (no compensate-void)
 *   - Same-company/same-line concurrent commits serialize → exactly one posts
 *   - Retry idempotency (already_posted, no duplicate bill)
 *   - Disabled nested GL flags → posted:false + zero artifacts
 *   - Wrong entity cannot post
 *   - Isolated company fixtures via canonical createIsolatedOperatingCompany (#2719) — no shared TRANSP race
 *
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import {
  BANK_TX_SPLIT_FLAG_KEY,
  BANK_TX_SPLIT_GL_POSTING_FLAG_KEY,
  commitSplit,
  saveSplitDraft,
} from "../bank-transaction-splits.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

type Fixture = {
  isolated: IsolatedOperatingCompany;
  companyId: string;
  userId: string;
  vendorId: string;
  glAccountId: string;
  otherGlAccountId: string;
  bankGlAccountId: string;
  apGlAccountId: string;
  bankAccountId: string;
  txnId: string;
  createdBillIds: string[];
  createdPaymentIds: string[];
};

const REQUIRED_FLAGS = [
  BANK_TX_SPLIT_FLAG_KEY,
  BANK_TX_SPLIT_GL_POSTING_FLAG_KEY,
  "BILL_GL_POSTING_ENABLED",
  "BILL_PAYMENT_GL_POSTING_ENABLED",
] as const;

describeIntegration("BANKING-GL-COMPLETION atomic bank-transaction-splits vendor-bill (real Postgres)", () => {
  let db: pg.Client;
  const fixtures: Fixture[] = [];

  async function bypass(companyId: string, fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      await fn();
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function scopedRead<T = Record<string, unknown>>(
    companyId: string,
    sql: string,
    params: unknown[]
  ): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      const r = await db.query(sql, params);
      await db.query("COMMIT");
      return r.rows as T[];
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function setTenantFlag(companyId: string, userId: string, flagKey: string, enabled: boolean) {
    await bypass(companyId, async () => {
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ($1,$2::uuid,NULL,$3,$4::uuid)
         ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
         DO UPDATE SET enabled = EXCLUDED.enabled`,
        [flagKey, companyId, enabled, userId]
      );
    });
  }

  async function assertPrerequisites(fx: Fixture) {
    const flags = await scopedRead<{ flag_key: string; enabled: boolean }>(
      fx.companyId,
      `SELECT flag_key, enabled FROM lib.feature_flag_overrides
        WHERE operating_company_id = $1::uuid AND user_uuid IS NULL AND flag_key = ANY($2::text[])`,
      [fx.companyId, [...REQUIRED_FLAGS]]
    );
    expect(flags).toHaveLength(REQUIRED_FLAGS.length);
    for (const key of REQUIRED_FLAGS) {
      expect(flags.find((f) => f.flag_key === key)?.enabled, `flag ${key}`).toBe(true);
    }
    const ap = await scopedRead<{ account_id: string }>(
      fx.companyId,
      `SELECT account_id::text FROM accounting.chart_of_accounts_roles
        WHERE operating_company_id = $1::uuid AND role = 'ap_control' AND is_active = true LIMIT 1`,
      [fx.companyId]
    );
    expect(ap[0]?.account_id).toBe(fx.apGlAccountId);
  }

  async function seedFixture(): Promise<Fixture> {
    const suffix = randomUUID().slice(0, 8);
    const userId = randomUUID();
    const vendorId = randomUUID();
    const glAccountId = randomUUID();
    const otherGlAccountId = randomUUID();
    const bankGlAccountId = randomUUID();
    const apGlAccountId = randomUUID();
    const bankAccountId = randomUUID();
    const txnId = randomUUID();

    // Actor must exist BEFORE createIsolatedOperatingCompany({ actorUserId }) — fail-loud grant (#2719).
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(
      `INSERT INTO identity.users (id, email, role, preferred_language)
       VALUES ($1::uuid,$2,'Owner','en')
       ON CONFLICT (id) DO NOTHING`,
      [userId, `split-vendor-bill-${suffix}@test.local`]
    );
    await db.query("COMMIT");

    const isolated = await createIsolatedOperatingCompany({
      codePrefix: "SPV",
      legalNamePrefix: "Split Vendor Bill Fixture",
      label: "bank-transaction-splits-vendor-bill-atomic",
      actorUserId: userId,
      client: db,
    });
    const companyId = isolated.companyId;

    await bypass(companyId, async () => {
      await db.query(
        `UPDATE identity.users SET default_company_id = $1::uuid WHERE id = $2::uuid`,
        [companyId, userId]
      );

      const mkAccount = (id: string, code: string, name: string, type: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$4::uuid,$2,$3,$5,true)`,
          [id, `${code}${suffix}`, name, companyId, type]
        );
      await mkAccount(glAccountId, "SPV1", "Split Vendor Line 1 Test", "Expense");
      await mkAccount(otherGlAccountId, "SPV2", "Split Vendor Line 2 Test", "Expense");
      await mkAccount(bankGlAccountId, "SPBK", "Split Bank GL Test", "Asset");
      await mkAccount(apGlAccountId, "SPAP", "Split AP Control Test", "Liability");

      // ap_control for THIS fixture's isolated company only — no shared-TRANSP DO UPDATE race.
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid, 'ap_control', $2::uuid, true)
         ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE SET account_id = EXCLUDED.account_id`,
        [companyId, apGlAccountId]
      );
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type)
         VALUES ($1::uuid, $2::uuid, 'Split Test Vendor', 'Other')
         ON CONFLICT (id) DO NOTHING`,
        [vendorId, companyId]
      );
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id, is_active, current_balance_cents)
         VALUES ($1::uuid,$2::uuid,'Split Test Bank',$3::uuid,true,0)`,
        [bankAccountId, companyId, bankGlAccountId]
      );
      await db.query(
        `INSERT INTO banking.bank_transactions
           (id, bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, status, description)
         VALUES ($1::uuid,$2::uuid,$3::uuid, CURRENT_DATE, -50000, false, 'pending_categorization', 'split vendor-bill test')`,
        [txnId, bankAccountId, companyId]
      );
    });

    for (const key of REQUIRED_FLAGS) {
      await setTenantFlag(companyId, userId, key, true);
    }

    const fx: Fixture = {
      isolated,
      companyId,
      userId,
      vendorId,
      glAccountId,
      otherGlAccountId,
      bankGlAccountId,
      apGlAccountId,
      bankAccountId,
      txnId,
      createdBillIds: [],
      createdPaymentIds: [],
    };
    fixtures.push(fx);
    return fx;
  }

  async function saveDefaultDraft(fx: Fixture) {
    await saveSplitDraft(fx.companyId, fx.userId, fx.txnId, "multi_vendor", [
      { amount_cents: 30_000, vendor_id: fx.vendorId, gl_account_id: fx.glAccountId, category_kind: "supplies" },
      { amount_cents: 20_000, gl_account_id: fx.otherGlAccountId, category_kind: "supplies" },
    ]);
  }

  async function assertDualJeProof(fx: Fixture, billId: string, paymentId: string) {
    const billLines = await scopedRead<{ account_id: string; debit_or_credit: string; amount_cents: string }>(
      fx.companyId,
      `SELECT account_id::text, debit_or_credit, amount_cents::text FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid AND source_transaction_type = 'bill' AND source_transaction_id = $2
        ORDER BY line_sequence ASC`,
      [fx.companyId, billId]
    );
    const billDebit = billLines.find((l) => l.debit_or_credit === "debit");
    const billCredit = billLines.find((l) => l.debit_or_credit === "credit");
    expect(billDebit, "bill GL debit must exist").toBeDefined();
    expect(billDebit!.account_id).toBe(fx.glAccountId);
    expect(billCredit!.account_id).toBe(fx.apGlAccountId);
    expect(Number(billDebit!.amount_cents)).toBe(30_000);
    expect(Number(billCredit!.amount_cents)).toBe(30_000);

    const payLines = await scopedRead<{ account_id: string; debit_or_credit: string; amount_cents: string }>(
      fx.companyId,
      `SELECT account_id::text, debit_or_credit, amount_cents::text FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid AND source_transaction_type = 'bill_payment' AND source_transaction_id = $2
        ORDER BY line_sequence ASC`,
      [fx.companyId, paymentId]
    );
    const payDebit = payLines.find((l) => l.debit_or_credit === "debit");
    const payCredit = payLines.find((l) => l.debit_or_credit === "credit");
    expect(payDebit!.account_id).toBe(fx.apGlAccountId);
    expect(payCredit!.account_id).toBe(fx.bankGlAccountId);
    expect(Number(payDebit!.amount_cents)).toBe(30_000);
    expect(Number(payCredit!.amount_cents)).toBe(30_000);
  }

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
  });

  afterAll(async () => {
    if (!db) return;
    for (const fx of fixtures) {
      try {
        await bypass(fx.companyId, async () => {
          await db.query(
            `DELETE FROM accounting.journal_entry_postings
              WHERE operating_company_id = $1::uuid
                AND source_transaction_id IN (
                  SELECT id::text FROM accounting.bills WHERE operating_company_id = $1::uuid
                  UNION
                  SELECT id::text FROM accounting.bill_payments WHERE operating_company_id = $1::uuid
                )`,
            [fx.companyId]
          );
          await db.query(`DELETE FROM accounting.posting_batches WHERE operating_company_id = $1::uuid`, [fx.companyId]);
          await db.query(`DELETE FROM accounting.bill_payments WHERE operating_company_id = $1::uuid`, [fx.companyId]);
          await db.query(
            `DELETE FROM accounting.bill_lines WHERE bill_id IN (SELECT id FROM accounting.bills WHERE operating_company_id = $1::uuid)`,
            [fx.companyId]
          );
          await db.query(`DELETE FROM accounting.bills WHERE operating_company_id = $1::uuid`, [fx.companyId]);
          await db.query(`DELETE FROM mdata.vendors WHERE id = $1::uuid`, [fx.vendorId]);
          await db.query(`DELETE FROM banking.bank_transaction_splits WHERE bank_transaction_id = $1::uuid`, [fx.txnId]);
          await db.query(`DELETE FROM banking.bank_transactions WHERE id = $1::uuid`, [fx.txnId]);
          await db.query(`DELETE FROM banking.bank_accounts WHERE id = $1::uuid`, [fx.bankAccountId]);
          await db.query(`DELETE FROM catalogs.accounts WHERE operating_company_id = $1::uuid`, [fx.companyId]);
          await db.query(`DELETE FROM lib.feature_flag_overrides WHERE operating_company_id = $1::uuid`, [fx.companyId]);
          // Canonical teardown: deactivate + drop role rows + access (never DELETE protected seeds).
          await deactivateIsolatedOperatingCompany(db, fx.isolated);
          await db.query(`DELETE FROM identity.users WHERE id = $1::uuid`, [fx.userId]);
        });
      } catch {
        /* CI DB ephemeral */
      }
    }
    await db.end();
  });

  it("happy path: PAID-IN-FULL + dual JE proof (expense/AP/bank) + re-commit already_posted", async () => {
    const fx = await seedFixture();
    await assertPrerequisites(fx);
    await saveDefaultDraft(fx);

    const first = await commitSplit(fx.companyId, fx.userId, "Owner", fx.txnId);
    const line1 = first.results.find((r) => r.line_no === 1)!;
    expect(line1.posted).toBe(true);
    expect(line1.bill_id).toBeTruthy();
    expect(line1.journal_entry_id).toBeTruthy();
    fx.createdBillIds.push(line1.bill_id!);

    const billRow = await scopedRead<{ status: string; paid_cents: string }>(
      fx.companyId,
      `SELECT status, paid_cents::text FROM accounting.bills WHERE id = $1::uuid AND revoked_at IS NULL`,
      [line1.bill_id!]
    );
    expect(billRow[0]?.status).toBe("paid");
    expect(billRow[0]?.paid_cents).toBe("30000");

    const paymentRow = await scopedRead<{ id: string; from_bank_account_id: string }>(
      fx.companyId,
      `SELECT id::text, from_bank_account_id::text FROM accounting.bill_payments
        WHERE bill_id = $1::uuid AND revoked_at IS NULL`,
      [line1.bill_id!]
    );
    expect(paymentRow).toHaveLength(1);
    fx.createdPaymentIds.push(paymentRow[0]!.id);
    expect(paymentRow[0]?.from_bank_account_id).toBe(fx.bankAccountId);

    await assertDualJeProof(fx, line1.bill_id!, paymentRow[0]!.id);

    const line2 = first.results.find((r) => r.line_no === 2)!;
    expect(line2.posted).toBe(false);
    expect(line2.reason).toBe("no_vendor_or_driver_advance_account");

    const billCountBefore = (
      await scopedRead<{ c: string }>(
        fx.companyId,
        `SELECT count(*)::text AS c FROM accounting.bills
          WHERE source_bank_transaction_id = $1::uuid AND revoked_at IS NULL`,
        [fx.txnId]
      )
    )[0]?.c;
    const second = await commitSplit(fx.companyId, fx.userId, "Owner", fx.txnId);
    expect(second.results.find((r) => r.line_no === 1)?.reason).toBe("already_posted");
    const billCountAfter = (
      await scopedRead<{ c: string }>(
        fx.companyId,
        `SELECT count(*)::text AS c FROM accounting.bills
          WHERE source_bank_transaction_id = $1::uuid AND revoked_at IS NULL`,
        [fx.txnId]
      )
    )[0]?.c;
    expect(billCountAfter).toBe(billCountBefore);
  });

  it("same-company/same-line concurrent commits: exactly one bill posts", async () => {
    const fx = await seedFixture();
    await assertPrerequisites(fx);
    await saveDefaultDraft(fx);

    const [a, b] = await Promise.all([
      commitSplit(fx.companyId, fx.userId, "Owner", fx.txnId),
      commitSplit(fx.companyId, fx.userId, "Owner", fx.txnId),
    ]);

    const outcomes = [a, b].map((r) => r.results.find((x) => x.line_no === 1)!);
    const posted = outcomes.filter((o) => o.posted && o.reason === "posted");
    const already = outcomes.filter((o) => o.reason === "already_posted");
    expect(posted.length + already.length).toBe(2);
    expect(posted.length).toBe(1);
    expect(already.length).toBe(1);

    const bills = await scopedRead<{ id: string }>(
      fx.companyId,
      `SELECT id::text FROM accounting.bills
        WHERE source_bank_transaction_id = $1::uuid AND revoked_at IS NULL`,
      [fx.txnId]
    );
    expect(bills).toHaveLength(1);
    fx.createdBillIds.push(bills[0]!.id);
    const payment = await scopedRead<{ id: string }>(
      fx.companyId,
      `SELECT id::text FROM accounting.bill_payments WHERE bill_id = $1::uuid AND revoked_at IS NULL`,
      [bills[0]!.id]
    );
    expect(payment).toHaveLength(1);
    fx.createdPaymentIds.push(payment[0]!.id);
    await assertDualJeProof(fx, bills[0]!.id, payment[0]!.id);
  });

  it("disabled BILL_GL flag: posted=false and ZERO bill/payment/JE artifacts", async () => {
    const fx = await seedFixture();
    await setTenantFlag(fx.companyId, fx.userId, "BILL_GL_POSTING_ENABLED", false);
    await saveDefaultDraft(fx);

    const result = await commitSplit(fx.companyId, fx.userId, "Owner", fx.txnId);
    const line1 = result.results.find((r) => r.line_no === 1)!;
    expect(line1.posted).toBe(false);
    expect(line1.reason).toBe("required_gl_flags_off");

    const bills = await scopedRead<{ c: string }>(
      fx.companyId,
      `SELECT count(*)::text AS c FROM accounting.bills WHERE source_bank_transaction_id = $1::uuid`,
      [fx.txnId]
    );
    expect(bills[0]?.c).toBe("0");
    const payments = await scopedRead<{ c: string }>(
      fx.companyId,
      `SELECT count(*)::text AS c FROM accounting.bill_payments WHERE operating_company_id = $1::uuid`,
      [fx.companyId]
    );
    expect(payments[0]?.c).toBe("0");
    const jes = await scopedRead<{ c: string }>(
      fx.companyId,
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`,
      [fx.companyId]
    );
    expect(jes[0]?.c).toBe("0");
  });

  it("ap_control missing: atomic failure rolls back — zero artifacts", async () => {
    const fx = await seedFixture();
    await bypass(fx.companyId, async () => {
      await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid AND role = 'ap_control'`, [
        fx.companyId,
      ]);
    });
    await saveDefaultDraft(fx);

    const result = await commitSplit(fx.companyId, fx.userId, "Owner", fx.txnId);
    const line1 = result.results.find((r) => r.line_no === 1)!;
    expect(line1.posted).toBe(false);
    expect(line1.reason).toMatch(/ap_control_unmapped|ACCOUNT_MAPPING_MISSING|gl_post_failed/);

    const bills = await scopedRead<{ c: string }>(
      fx.companyId,
      `SELECT count(*)::text AS c FROM accounting.bills WHERE source_bank_transaction_id = $1::uuid`,
      [fx.txnId]
    );
    expect(bills[0]?.c).toBe("0");
  });

  it("wrong entity cannot post another company's split", async () => {
    const fx = await seedFixture();
    const other = await seedFixture();
    await assertPrerequisites(fx);
    await saveDefaultDraft(fx);

    await expect(commitSplit(other.companyId, other.userId, "Owner", fx.txnId)).rejects.toThrow();

    const bills = await scopedRead<{ c: string }>(
      fx.companyId,
      `SELECT count(*)::text AS c FROM accounting.bills WHERE source_bank_transaction_id = $1::uuid`,
      [fx.txnId]
    );
    expect(bills[0]?.c).toBe("0");
  });

  it("isolated companies: concurrent commits across tenants neither share ap_control nor undefined debit", async () => {
    const a = await seedFixture();
    const b = await seedFixture();
    expect(a.companyId).not.toBe(b.companyId);
    await assertPrerequisites(a);
    await assertPrerequisites(b);
    await saveDefaultDraft(a);
    await saveDefaultDraft(b);

    const [firstA, firstB] = await Promise.all([
      commitSplit(a.companyId, a.userId, "Owner", a.txnId),
      commitSplit(b.companyId, b.userId, "Owner", b.txnId),
    ]);

    for (const [fx, first] of [
      [a, firstA],
      [b, firstB],
    ] as const) {
      const line1 = first.results.find((r) => r.line_no === 1)!;
      expect(line1.posted).toBe(true);
      expect(line1.bill_id).toBeTruthy();
      fx.createdBillIds.push(line1.bill_id!);
      const payment = await scopedRead<{ id: string }>(
        fx.companyId,
        `SELECT id::text FROM accounting.bill_payments WHERE bill_id = $1::uuid AND revoked_at IS NULL`,
        [line1.bill_id!]
      );
      fx.createdPaymentIds.push(payment[0]!.id);
      await assertDualJeProof(fx, line1.bill_id!, payment[0]!.id);
    }
  });
});
