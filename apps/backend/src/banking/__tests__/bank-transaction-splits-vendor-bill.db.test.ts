/**
 * [HOLD-FOR-JORGE — TIER 1] BANKING-GL-COMPLETION — bank-transaction-splits.service.ts vendor-bill line,
 * end-to-end (real Postgres). Proves:
 *   - the vendor-bill split line now books PAID-IN-FULL (a bill ALREADY 'paid' + a matching full-amount
 *     accounting.bill_payments row crediting the real source bank account), not an unpaid bill for cash
 *     that already left the bank.
 *   - GL posting (behind the EXISTING BILL_GL_POSTING_ENABLED / BILL_PAYMENT_GL_POSTING_ENABLED flags, on
 *     top of BANK_TX_SPLIT_GL_POSTING_ENABLED) resolves the bill's line via the operator's OWN chosen GL
 *     account (Tier-1 explicit override), not a generic uncategorized bucket.
 *   - RE-POST GUARD — re-committing an already-committed split is a strict no-op: the vendor-bill line is
 *     NOT re-inserted (no duplicate accounting.bills row) and reports posting_status='posted' as-is.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { BANK_TX_SPLIT_FLAG_KEY, BANK_TX_SPLIT_GL_POSTING_FLAG_KEY, commitSplit, saveSplitDraft } from "../bank-transaction-splits.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("BANKING-GL-COMPLETION bank-transaction-splits vendor-bill line (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 6);
  const userId = "00000000-0000-4000-8000-0000000000f7";
  const vendorId = randomUUID();
  const glAccountId = randomUUID(); // the operator's chosen category account for line 1 (NAPA)
  const otherGlAccountId = randomUUID(); // a distinct category account for line 2 (AutoZone) — no vendor
  const bankGlAccountId = randomUUID();
  const bankAccountId = randomUUID();
  const createdBillIds: string[] = [];
  const createdPaymentIds: string[] = [];
  let txnId = "";

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
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

  async function setFlagOverride(flagKey: string, enabled: boolean) {
    await bypass(async () => {
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
         VALUES ($1,$2::uuid,$3,$4::uuid)
         ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
         DO UPDATE SET enabled = EXCLUDED.enabled`,
        [flagKey, companyId, enabled, userId]
      );
    });
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `split-vendor-bill-${suffix}@test.local`]
      );
      await db.query(
        `INSERT INTO org.user_company_access (user_id, company_id) VALUES ($1::uuid,$2::uuid) ON CONFLICT (user_id, company_id) DO NOTHING`,
        [userId, companyId]
      );
      for (const key of [
        "BANK_TX_SPLIT_ENABLED",
        "BANK_TX_SPLIT_GL_POSTING_ENABLED",
        "BILL_GL_POSTING_ENABLED",
        "BILL_PAYMENT_GL_POSTING_ENABLED",
      ]) {
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key=$1 AND operating_company_id=$2::uuid`, [key, companyId]);
      }
      const mkAccount = (id: string, code: string, name: string, type: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$4::uuid,$2,$3,$5,true)`,
          [id, `${code}${suffix}`, name, companyId, type]
        );
      await mkAccount(glAccountId, "SPV1", "Split Vendor Line 1 Test", "Expense");
      await mkAccount(otherGlAccountId, "SPV2", "Split Vendor Line 2 Test", "Expense");
      await mkAccount(bankGlAccountId, "SPBK", "Split Bank GL Test", "Asset");
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id, is_active, current_balance_cents)
         VALUES ($1::uuid,$2::uuid,'Split Test Bank',$3::uuid,true,0)`,
        [bankAccountId, companyId, bankGlAccountId]
      );
      txnId = randomUUID();
      await db.query(
        `INSERT INTO banking.bank_transactions
           (id, bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, status, description)
         VALUES ($1::uuid,$2::uuid,$3::uuid, CURRENT_DATE, -50000, false, 'pending_categorization', 'split vendor-bill test')`,
        [txnId, bankAccountId, companyId]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(
          `DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type IN ('bill','bill_payment')`,
          [[...createdBillIds, ...createdPaymentIds]]
        );
        await db.query(
          `DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1) AND linked_object_type IN ('bill','bill_payment')`,
          [[...createdBillIds, ...createdPaymentIds]]
        );
        await db.query(
          `DELETE FROM accounting.posting_batches WHERE source_transaction_id = ANY($1) AND source_transaction_type IN ('bill','bill_payment')`,
          [[...createdBillIds, ...createdPaymentIds]]
        );
        await db.query(`DELETE FROM accounting.bill_payments WHERE id = ANY($1::uuid[])`, [createdPaymentIds]);
        await db.query(`DELETE FROM accounting.bill_lines WHERE bill_id = ANY($1::uuid[])`, [createdBillIds]);
        await db.query(`DELETE FROM accounting.bills WHERE id = ANY($1::uuid[])`, [createdBillIds]);
        await db.query(`DELETE FROM banking.bank_transaction_splits WHERE bank_transaction_id = $1::uuid`, [txnId]);
        await db.query(`DELETE FROM banking.bank_transactions WHERE id = $1::uuid`, [txnId]);
        await db.query(`DELETE FROM banking.bank_accounts WHERE id = $1::uuid`, [bankAccountId]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [[glAccountId, otherGlAccountId, bankGlAccountId]]);
        for (const key of [
          "BANK_TX_SPLIT_ENABLED",
          "BANK_TX_SPLIT_GL_POSTING_ENABLED",
          "BILL_GL_POSTING_ENABLED",
          "BILL_PAYMENT_GL_POSTING_ENABLED",
        ]) {
          await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key=$1 AND operating_company_id=$2::uuid`, [key, companyId]);
        }
        await db.query(`DELETE FROM org.user_company_access WHERE user_id=$1::uuid AND company_id=$2::uuid`, [userId, companyId]);
      });
    } catch {
      /* best-effort cleanup */
    }
    await db.end();
  });

  it("vendor-bill line books PAID-IN-FULL + posts DR its OWN chosen account / CR ap_control, then DR ap_control / CR the real bank; re-commit is a no-op (RE-POST GUARD)", async () => {
    await setFlagOverride(BANK_TX_SPLIT_FLAG_KEY, true);
    await setFlagOverride(BANK_TX_SPLIT_GL_POSTING_FLAG_KEY, true);
    await setFlagOverride("BILL_GL_POSTING_ENABLED", true);
    await setFlagOverride("BILL_PAYMENT_GL_POSTING_ENABLED", true);

    await saveSplitDraft(companyId, userId, txnId, "multi_vendor", [
      { amount_cents: 30_000, vendor_id: vendorId, gl_account_id: glAccountId, category_kind: "supplies" },
      { amount_cents: 20_000, gl_account_id: otherGlAccountId, category_kind: "supplies" }, // no vendor -> neither branch eligible
    ]);

    const first = await commitSplit(companyId, userId, "Owner", txnId);
    const line1 = first.results.find((r) => r.line_no === 1)!;
    expect(line1.posted).toBe(true);
    expect(line1.bill_id).toBeTruthy();
    createdBillIds.push(line1.bill_id!);

    const billRow = await scopedRead<{ status: string; amount_cents: string; paid_cents: string }>(
      `SELECT status, amount_cents::text, paid_cents::text FROM accounting.bills WHERE id = $1::uuid`,
      [line1.bill_id!]
    );
    expect(billRow[0]?.status).toBe("paid");
    expect(billRow[0]?.paid_cents).toBe("30000");

    const paymentRow = await scopedRead<{ id: string; from_bank_account_id: string; amount_cents: string }>(
      `SELECT id::text, from_bank_account_id::text, amount_cents::text FROM accounting.bill_payments WHERE bill_id = $1::uuid`,
      [line1.bill_id!]
    );
    expect(paymentRow).toHaveLength(1);
    createdPaymentIds.push(paymentRow[0]!.id);
    expect(paymentRow[0]?.from_bank_account_id).toBe(bankAccountId);
    expect(paymentRow[0]?.amount_cents).toBe("30000");

    // Bill posts DR the OPERATOR'S OWN chosen account (glAccountId, Tier-1 explicit override) / CR ap_control.
    const billLines = await scopedRead<{ account_id: string; debit_or_credit: string; amount_cents: string }>(
      `SELECT account_id::text, debit_or_credit, amount_cents::text FROM accounting.journal_entry_postings
        WHERE source_transaction_id = $1 AND source_transaction_type = 'bill' ORDER BY line_sequence ASC`,
      [line1.bill_id!]
    );
    const billDebit = billLines.find((l) => l.debit_or_credit === "debit");
    expect(billDebit?.account_id).toBe(glAccountId);
    expect(Number(billDebit?.amount_cents)).toBe(30_000);

    // Payment posts CR the REAL bank ledger (tie-out).
    const paymentLines = await scopedRead<{ account_id: string; debit_or_credit: string; amount_cents: string }>(
      `SELECT account_id::text, debit_or_credit, amount_cents::text FROM accounting.journal_entry_postings
        WHERE source_transaction_id = $1 AND source_transaction_type = 'bill_payment' ORDER BY line_sequence ASC`,
      [paymentRow[0]!.id]
    );
    const paymentCredit = paymentLines.find((l) => l.debit_or_credit === "credit");
    expect(paymentCredit?.account_id).toBe(bankGlAccountId);
    expect(Number(paymentCredit?.amount_cents)).toBe(30_000);

    // Line 2 (no vendor, not a driver-advance) — tags stay, nothing posted.
    const line2 = first.results.find((r) => r.line_no === 2)!;
    expect(line2.posted).toBe(false);
    expect(line2.reason).toBe("no_vendor_or_driver_advance_account");

    // RE-POST GUARD — re-committing must NOT re-insert the bill (no duplicate row) and must report the
    // line's already-posted state as-is, not re-attempt the branch.
    const billCountBefore = (
      await scopedRead<{ c: string }>(`SELECT count(*)::text AS c FROM accounting.bills WHERE source_bank_transaction_id = $1::uuid`, [txnId])
    )[0]?.c;
    const second = await commitSplit(companyId, userId, "Owner", txnId);
    const line1Again = second.results.find((r) => r.line_no === 1)!;
    expect(line1Again.reason).toBe("already_posted");
    const billCountAfter = (
      await scopedRead<{ c: string }>(`SELECT count(*)::text AS c FROM accounting.bills WHERE source_bank_transaction_id = $1::uuid`, [txnId])
    )[0]?.c;
    expect(billCountAfter).toBe(billCountBefore); // no duplicate bill from the re-commit
  });
});
