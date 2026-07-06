/**
 * CHAIN-04 — bill -> bill_payment -> bank_transaction tie-out proof (real Postgres).
 *
 * Read-only proof: exercises the exact SQL in scripts/verify-chain-04-bill-payment-bank-tieout.mjs
 * (kept in lockstep manually — see docs/specs/qbo-parity/CHAIN-04-BANK-TIEOUT-PROOF.md §4/§6) against
 * seeded data, proving (a) a clean chain produces zero violations and (b) each assertion actually
 * catches the defect it is designed to catch (the guard is not a no-op).
 *
 * This test does NOT exercise any write path — it seeds rows directly (bypass-RLS) exactly as the
 * existing manual Pay-Bill + bank-match flows would produce them today. "Part 2b" (the accept-bill
 * write path) is design-only per that doc — not built, not tested here.
 *
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

// Kept in lockstep with scripts/verify-chain-04-bill-payment-bank-tieout.mjs's ASSERTIONS object.
const ASSERTIONS = {
  legA_billVsPaymentsDrift: `
    SELECT b.id AS bill_id
      FROM accounting.bills b
      LEFT JOIN accounting.bill_payments bp
        ON bp.bill_id = b.id AND bp.revoked_at IS NULL
     WHERE b.revoked_at IS NULL
       AND b.id = ANY($1::uuid[])
     GROUP BY b.id, b.paid_cents
    HAVING b.paid_cents <> COALESCE(SUM(bp.amount_cents), 0)`,
  legB_amountOrDirectionMismatch: `
    SELECT bt.id AS bank_transaction_id
      FROM banking.bank_transactions bt
      JOIN accounting.bill_payments bp ON bp.id = bt.matched_bill_payment_id
     WHERE bp.revoked_at IS NULL
       AND bt.id = ANY($1::uuid[])
       AND (ABS(bt.amount_cents) <> bp.amount_cents OR bt.is_credit = true)`,
  legC_duplicateBankClaim: `
    SELECT matched_bill_payment_id
      FROM banking.bank_transactions
     WHERE matched_bill_payment_id = ANY($1::uuid[])
     GROUP BY matched_bill_payment_id
    HAVING COUNT(*) > 1`,
};

describeIntegration("CHAIN-04 bill -> bill_payment -> bank_transaction tie-out proof (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 6);
  const bankAccountId = randomUUID();
  const billIds: string[] = [];
  const paymentIds: string[] = [];
  const bankTxnIds: string[] = [];

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function seedBill(amountCents: number, paidCents: number): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.bills (id, operating_company_id, bill_date, status, amount_cents, paid_cents, total_amount, paid_amount, bill_number)
         VALUES ($1::uuid,$2::uuid,CURRENT_DATE,'unpaid',$3,$4,$5,$6,$7)`,
        [id, companyId, amountCents, paidCents, amountCents / 100, paidCents / 100, `T04-BILL-${suffix}-${billIds.length + 1}`]
      );
    });
    billIds.push(id);
    return id;
  }

  async function seedPayment(billId: string, amountCents: number): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.bill_payments
           (id, operating_company_id, bill_id, payment_date, amount_cents, amount, payment_method, from_bank_account_id, status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,$4,$5,'ach',$6::uuid,'posted')`,
        [id, companyId, billId, amountCents, amountCents / 100, bankAccountId]
      );
    });
    paymentIds.push(id);
    return id;
  }

  async function seedBankTxn(opts: { matchedBillPaymentId: string; amountCents: number; isCredit: boolean }): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO banking.bank_transactions
           (id, bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, matched_bill_payment_id, review_state)
         VALUES ($1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,$4,$5,$6::uuid,'matched')`,
        [id, bankAccountId, companyId, opts.amountCents, opts.isCredit, opts.matchedBillPaymentId]
      );
    });
    bankTxnIds.push(id);
    return id;
  }

  async function run<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    return bypass(async () => (await db.query(sql, params)).rows as T[]);
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
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, is_active)
         VALUES ($1::uuid,$2::uuid,'Chain-04 Tie-Out Test Bank',true)`,
        [bankAccountId, companyId]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM banking.bank_transactions WHERE id = ANY($1::uuid[])`, [bankTxnIds]);
        await db.query(`DELETE FROM accounting.bill_payments WHERE id = ANY($1::uuid[])`, [paymentIds]);
        await db.query(`DELETE FROM accounting.bills WHERE id = ANY($1::uuid[])`, [billIds]);
        await db.query(`DELETE FROM banking.bank_accounts WHERE id = $1::uuid`, [bankAccountId]);
      });
    } catch {
      /* best-effort cleanup */
    }
    await db.end();
  });

  it("Leg A — a clean bill (paid_cents == sum of its own payments) produces zero drift rows", async () => {
    const billId = await seedBill(50_000, 50_000);
    await seedPayment(billId, 50_000);
    const rows = await run(ASSERTIONS.legA_billVsPaymentsDrift, [[billId]]);
    expect(rows).toHaveLength(0);
  });

  it("Leg A — catches drift when bill.paid_cents disagrees with the live sum of its payments", async () => {
    const billId = await seedBill(50_000, 30_000); // header says $300 paid...
    await seedPayment(billId, 50_000); // ...but the payment row says $500 paid. Drift.
    const rows = await run<{ bill_id: string }>(ASSERTIONS.legA_billVsPaymentsDrift, [[billId]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].bill_id).toBe(billId);
  });

  it("Leg B — a bank line matched to a bill_payment with the same amount + is_credit=false ties out clean", async () => {
    const billId = await seedBill(75_000, 75_000);
    const paymentId = await seedPayment(billId, 75_000);
    const txnId = await seedBankTxn({ matchedBillPaymentId: paymentId, amountCents: 75_000, isCredit: false });
    const rows = await run(ASSERTIONS.legB_amountOrDirectionMismatch, [[txnId]]);
    expect(rows).toHaveLength(0);
  });

  it("Leg B — catches a penny amount mismatch between the bank line and the bill_payment", async () => {
    const billId = await seedBill(10_000, 10_000);
    const paymentId = await seedPayment(billId, 10_000);
    const txnId = await seedBankTxn({ matchedBillPaymentId: paymentId, amountCents: 10_001, isCredit: false }); // 1 cent off
    const rows = await run<{ bank_transaction_id: string }>(ASSERTIONS.legB_amountOrDirectionMismatch, [[txnId]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].bank_transaction_id).toBe(txnId);
  });

  it("Leg B — catches a direction defect (bill payment linked to a deposit, is_credit=true)", async () => {
    const billId = await seedBill(20_000, 20_000);
    const paymentId = await seedPayment(billId, 20_000);
    const txnId = await seedBankTxn({ matchedBillPaymentId: paymentId, amountCents: 20_000, isCredit: true }); // wrong direction
    const rows = await run<{ bank_transaction_id: string }>(ASSERTIONS.legB_amountOrDirectionMismatch, [[txnId]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].bank_transaction_id).toBe(txnId);
  });

  it("Leg C — catches two bank lines both claiming the same bill_payment (bijection break)", async () => {
    const billId = await seedBill(40_000, 40_000);
    const paymentId = await seedPayment(billId, 40_000);
    await seedBankTxn({ matchedBillPaymentId: paymentId, amountCents: 40_000, isCredit: false });
    await seedBankTxn({ matchedBillPaymentId: paymentId, amountCents: 40_000, isCredit: false });
    // legC_duplicateBankClaim groups by matched_bill_payment_id (no per-row id filter in the production
    // query, since a duplicate claim is a defect regardless of which bank_transaction ids are involved);
    // scope this assertion to just our test payment id so it can't see cross-test noise.
    const rows = await run<{ matched_bill_payment_id: string }>(ASSERTIONS.legC_duplicateBankClaim, [[paymentId]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].matched_bill_payment_id).toBe(paymentId);
  });
});
