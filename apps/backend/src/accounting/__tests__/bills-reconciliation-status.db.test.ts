/**
 * BANKREC-LISTSTATUS-01 — Match/Unmatched status on Bills + Bill-Payments LIST endpoints (real Postgres).
 *
 * Proves the derived `is_reconciled` field added to listBills / listAllBillsForCompany /
 * listBillPayments / listBillPaymentsForBill in bills.service.ts is a REAL join against
 * bank.reconciliation_matches, not a hardcoded value:
 *   - A bill_payment with an ACTIVE match (match_state IN auto_matched|user_matched) → matched.
 *     The bill rolls that up (a Bill is never matched directly — 'bill' is not a valid
 *     ledger_entry_kind; see 202607011600_bank_recon_expense_match_part2a.sql comment).
 *   - A bill_payment with only a 'rejected' match (the reversed/void analog on this table — no
 *     reversed_at/voided_at column exists) → still unmatched.
 *   - A bill_payment with an ACTIVE match row that belongs to ANOTHER entity (operating_company_id
 *     mismatch) → NOT counted (entity isolation), even though ledger_entry_kind/id line up.
 * Bills/bill_payments are seeded directly via SQL (not the createBill/payBill service calls) —
 * matches the existing convention in bill-payment-gl-posting.db.test.ts in this directory, and
 * avoids createBill's unrelated QBO-connection dependency (enqueueSyncJob requires an authorized
 * QBO connection per company, which is out of scope for this read-only status query).
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, ensureSecondEntityLoad } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { listBillPayments, listBillPaymentsForBill, listBills } from "../bills.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("BANKREC-LISTSTATUS-01 bills/bill-payments reconciliation status (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  let foreignCompanyId: string;
  const suffix = randomUUID().slice(0, 8);
  let ownBankTxnId: string;
  let foreignBankTxnId: string;

  // FORCE RLS is enabled on banking.bank_accounts / bank_transactions / accounting.bills /
  // accounting.bill_payments / bank.reconciliation_matches (see
  // 202606281050_force_rls_financial_tables.sql), so app.bypass_rls='lucia' alone does NOT skip
  // their policies for a non-owner role — the policy predicate is purely
  // operating_company_id = current_setting('app.operating_company_id'). Set BOTH so writes for a
  // given scopeCompanyId are actually permitted.
  async function bypass<T>(scopeCompanyId: string, fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [scopeCompanyId]);
    try {
      const result = await fn();
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function seedBill(scopeCompanyId: string, amountCents: number, memo: string): Promise<string> {
    const id = randomUUID();
    await bypass(scopeCompanyId, async () => {
      await db.query(
        `INSERT INTO accounting.bills
           (id, operating_company_id, vendor_id, bill_date, amount_cents, total_amount, paid_cents, paid_amount, status, memo)
         VALUES ($1::uuid, $2::uuid, $3, CURRENT_DATE, $4, $5, $4, $5, 'paid', $6)`,
        [id, scopeCompanyId, `bankrec-vendor-${suffix}`, amountCents, amountCents / 100, memo]
      );
    });
    return id;
  }

  async function seedPayment(scopeCompanyId: string, billId: string, amountCents: number): Promise<string> {
    const id = randomUUID();
    await bypass(scopeCompanyId, async () => {
      await db.query(
        `INSERT INTO accounting.bill_payments
           (id, operating_company_id, bill_id, payment_date, amount_cents, amount, payment_method, status, created_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, CURRENT_DATE, $4, $5, 'cash', 'posted', $6::uuid)`,
        [id, scopeCompanyId, billId, amountCents, amountCents / 100, TEST_OWNER_USER_ID]
      );
    });
    return id;
  }

  async function seedMatch(
    scopeCompanyId: string,
    bankTransactionId: string,
    ledgerEntryId: string,
    matchState: "auto_matched" | "rejected"
  ): Promise<void> {
    await bypass(scopeCompanyId, async () => {
      await db.query(
        `INSERT INTO bank.reconciliation_matches
           (operating_company_id, bank_transaction_id, ledger_entry_kind, ledger_entry_id, match_state)
         VALUES ($1::uuid, $2::uuid, 'bill_payment', $3::uuid, $4)`,
        [scopeCompanyId, bankTransactionId, ledgerEntryId, matchState]
      );
    });
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const second = await ensureSecondEntityLoad();
    foreignCompanyId = second.companyId;

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!;
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    // Seed one bank account + bank transaction per entity — bank.reconciliation_matches.bank_transaction_id
    // is a required FK into banking.bank_transactions.
    ownBankTxnId = await bypass(companyId, async () => {
      const acct = await db.query<{ id: string }>(
        `INSERT INTO banking.bank_accounts (operating_company_id, account_name, account_type)
         VALUES ($1::uuid, $2, 'checking') RETURNING id`,
        [companyId, `BANKREC-LISTSTATUS own ${suffix}`]
      );
      const txn = await db.query<{ id: string }>(
        `INSERT INTO banking.bank_transactions (bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, description)
         VALUES ($1::uuid, $2::uuid, CURRENT_DATE, 5000, false, $3) RETURNING id`,
        [acct.rows[0]!.id, companyId, `BANKREC-LISTSTATUS own tx ${suffix}`]
      );
      return txn.rows[0]!.id;
    });

    foreignBankTxnId = await bypass(foreignCompanyId, async () => {
      const acct = await db.query<{ id: string }>(
        `INSERT INTO banking.bank_accounts (operating_company_id, account_name, account_type)
         VALUES ($1::uuid, $2, 'checking') RETURNING id`,
        [foreignCompanyId, `BANKREC-LISTSTATUS foreign ${suffix}`]
      );
      const txn = await db.query<{ id: string }>(
        `INSERT INTO banking.bank_transactions (bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, description)
         VALUES ($1::uuid, $2::uuid, CURRENT_DATE, 5000, false, $3) RETURNING id`,
        [acct.rows[0]!.id, foreignCompanyId, `BANKREC-LISTSTATUS foreign tx ${suffix}`]
      );
      return txn.rows[0]!.id;
    });
  });

  afterAll(async () => {
    await db.end();
  });

  it("derives is_reconciled from a REAL active match, excludes rejected + cross-entity matches", async () => {
    // Bill A: paid, and its payment gets an ACTIVE match → expect matched.
    const billA = await seedBill(companyId, 12345, `BANKREC-LISTSTATUS bill A ${suffix}`);
    const paymentA = await seedPayment(companyId, billA, 12345);

    // Bill B: paid, its payment gets ONLY a rejected match + a same-id match under a FOREIGN
    // entity → expect still unmatched (neither counts).
    const billB = await seedBill(companyId, 6789, `BANKREC-LISTSTATUS bill B ${suffix}`);
    const paymentB = await seedPayment(companyId, billB, 6789);

    // Bill C: paid, payment has NO match row at all → expect unmatched.
    const billC = await seedBill(companyId, 4321, `BANKREC-LISTSTATUS bill C ${suffix}`);
    await seedPayment(companyId, billC, 4321);

    // Active match for payment A — this is the ONLY row that should flip is_reconciled true.
    await seedMatch(companyId, ownBankTxnId, paymentA, "auto_matched");
    // Rejected match for payment B — must NOT count as matched (the reversed/void analog).
    await seedMatch(companyId, ownBankTxnId, paymentB, "rejected");
    // Active match for payment B, but under the FOREIGN entity — must NOT count (entity isolation).
    await seedMatch(foreignCompanyId, foreignBankTxnId, paymentB, "auto_matched");

    // --- Bills list rolls the payment-level match up to the bill ---
    const bills = await listBills(TEST_OWNER_USER_ID, companyId, { limit: 200, offset: 0 });
    const rowA = bills.find((r) => r.id === billA);
    const rowB = bills.find((r) => r.id === billB);
    const rowC = bills.find((r) => r.id === billC);
    expect(rowA).toBeTruthy();
    expect(rowB).toBeTruthy();
    expect(rowC).toBeTruthy();
    expect(rowA!.is_reconciled).toBe(true);
    expect(rowB!.is_reconciled).toBe(false);
    expect(rowC!.is_reconciled).toBe(false);

    // --- Bill-payments list (GET /api/v1/accounting/bill-payments) ---
    const payments = await listBillPayments(TEST_OWNER_USER_ID, companyId, { limit: 200, offset: 0 });
    const payRowA = payments.find((r) => r.id === paymentA);
    const payRowB = payments.find((r) => r.id === paymentB);
    expect(payRowA).toBeTruthy();
    expect(payRowB).toBeTruthy();
    expect(payRowA!.is_reconciled).toBe(true);
    expect(payRowB!.is_reconciled).toBe(false);

    // --- Bill detail payments sub-list (GET /api/v1/accounting/bills/:id/payments) ---
    const paymentsForBillA = await listBillPaymentsForBill(TEST_OWNER_USER_ID, companyId, billA);
    expect(paymentsForBillA).toBeTruthy();
    expect(paymentsForBillA!.find((r) => r.id === paymentA)?.is_reconciled).toBe(true);

    // --- Sanity: the FOREIGN entity's own view of that match row shows IT as matched (it's a real
    // match for ITS payment id — proves this isn't a query bug, just correctly entity-scoped). The
    // foreign entity never created a bill_payment with this id, so there is nothing to roll up to,
    // but the raw match row is confirmed to exist and be active from that entity's own RLS context.
    await bypass(foreignCompanyId, async () => {
      const foreignMatch = await db.query(
        `SELECT match_state FROM bank.reconciliation_matches
         WHERE operating_company_id = $1::uuid AND ledger_entry_id = $2::uuid AND ledger_entry_kind = 'bill_payment'`,
        [foreignCompanyId, paymentB]
      );
      expect(foreignMatch.rows[0]?.match_state).toBe("auto_matched");
    });
  });
});
