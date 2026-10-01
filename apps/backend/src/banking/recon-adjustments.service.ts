/**
 * BANK-ECON-04 / Lead ruling 2026-10-01 17:20Z —
 * Recon Finish adjustments:
 *   - Service charge = EXPENSE document (vendor = bank, category = fee account,
 *     paid-from = bank GL) through the expense posting engine. Never a bare cost JE.
 *   - Interest earned = income JE (Dr bank / Cr income) — not a 5xxx/6xxx cost, so JE is correct.
 *
 * Idempotent: if the session already carries a JE FK for that leg, skip re-post.
 */
import type { QueryableClient } from "../accounting/journal-entry-type-resolver.js";
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { nextExpenseDisplayId } from "../accounting/display-id.js";

export type ReconAdjustmentInput = {
  operating_company_id: string;
  session_id: string;
  bank_ledger_account_id: string;
  /** Optional banking.bank_accounts id — used to resolve payee vendor by account display name. */
  bank_account_id?: string | null;
  service_charge_cents: number;
  service_charge_date: string | null;
  service_charge_account_id: string | null;
  service_charge_journal_entry_id: string | null;
  /** When set, service charge already has its expense document — skip re-create. */
  service_charge_expense_id?: string | null;
  interest_earned_cents: number;
  interest_earned_date: string | null;
  interest_earned_account_id: string | null;
  interest_earned_journal_entry_id: string | null;
};

export type ReconAdjustmentResult = {
  service_charge_journal_entry_id: string | null;
  service_charge_expense_id: string | null;
  interest_earned_journal_entry_id: string | null;
};

function requirePositiveCents(n: number, label: string) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label}_must_be_non_negative_integer`);
}

async function resolveBankVendorId(
  client: QueryableClient,
  operatingCompanyId: string,
  bankLedgerAccountId: string,
  bankAccountId: string | null | undefined
): Promise<string | null> {
  // Prefer an exact vendor match on the bank account's display / account name (QBO payee = bank).
  if (bankAccountId) {
    const ba = await client.query<{ payee: string | null }>(
      `SELECT COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(account_name), ''), NULLIF(TRIM(institution_name), '')) AS payee
         FROM banking.bank_accounts
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        LIMIT 1`,
      [bankAccountId, operatingCompanyId]
    );
    const payee = ba.rows[0]?.payee ?? null;
    if (payee) {
      const v = await client.query<{ id: string }>(
        `SELECT id::text AS id
           FROM mdata.vendors
          WHERE operating_company_id = $1::uuid
            AND deactivated_at IS NULL
            AND COALESCE(is_sample_data, false) IS NOT TRUE
            AND lower(vendor_name) = lower($2)
          LIMIT 1`,
        [operatingCompanyId, payee]
      );
      if (v.rows[0]?.id) return v.rows[0].id;
    }
  }

  const acct = await client.query<{ account_name: string | null }>(
    `SELECT account_name
       FROM catalogs.accounts
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1`,
    [bankLedgerAccountId, operatingCompanyId]
  );
  const accountName = acct.rows[0]?.account_name?.trim() || null;
  if (!accountName) return null;

  const byAcct = await client.query<{ id: string }>(
    `SELECT id::text AS id
       FROM mdata.vendors
      WHERE operating_company_id = $1::uuid
        AND deactivated_at IS NULL
        AND COALESCE(is_sample_data, false) IS NOT TRUE
        AND lower(vendor_name) = lower($2)
      LIMIT 1`,
    [operatingCompanyId, accountName]
  );
  return byAcct.rows[0]?.id ?? null;
}

/**
 * Create + post a driverless company expense for the recon service charge.
 * Returns expense id + the JE the expense engine minted (source_transaction_type = expense).
 */
async function createAndPostServiceChargeExpense(
  client: QueryableClient,
  input: {
    operating_company_id: string;
    session_id: string;
    bank_ledger_account_id: string;
    bank_account_id?: string | null;
    service_charge_cents: number;
    service_charge_date: string;
    service_charge_account_id: string;
  },
  actor: { userId: string; role: string }
): Promise<{ expense_id: string; journal_entry_id: string }> {
  const vendorId = await resolveBankVendorId(
    client,
    input.operating_company_id,
    input.bank_ledger_account_id,
    input.bank_account_id
  );

  const memo = `Bank reconciliation service charge · session ${input.session_id}`;
  const expenseNumber = await nextExpenseDisplayId(
    client as never,
    input.operating_company_id,
    new Date(`${input.service_charge_date}T00:00:00.000Z`)
  );

  // Idempotent re-entry: an expense already minted for this session memo + amount.
  const existing = await client.query<{ id: string; journal_entry_id: string | null }>(
    `SELECT id::text AS id, journal_entry_id::text AS journal_entry_id
       FROM accounting.expenses
      WHERE operating_company_id = $1::uuid
        AND memo = $2
        AND total_amount_cents = $3::bigint
        AND voided_at IS NULL
        AND status <> 'void'
      ORDER BY created_at DESC
      LIMIT 1`,
    [input.operating_company_id, memo, input.service_charge_cents]
  );
  if (existing.rows[0]?.journal_entry_id) {
    return {
      expense_id: existing.rows[0].id,
      journal_entry_id: existing.rows[0].journal_entry_id,
    };
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO accounting.expenses (
        operating_company_id, status, posting_status, transaction_date, total_amount_cents,
        memo, expense_number, vendor_uuid, payment_account_uuid,
        is_sample_data, is_company_expense, is_reimbursable
      ) VALUES (
        $1::uuid, 'draft', 'unposted', $2::date, $3::bigint,
        $4, $5, $6::uuid, $7::uuid,
        false, true, false
      )
      RETURNING id::text AS id`,
    [
      input.operating_company_id,
      input.service_charge_date,
      input.service_charge_cents,
      memo,
      expenseNumber,
      vendorId,
      input.bank_ledger_account_id,
    ]
  );
  const expenseId = inserted.rows[0]?.id;
  if (!expenseId) throw new Error("recon_service_charge_expense_insert_failed");

  await client.query(
    `INSERT INTO accounting.expense_lines (
        operating_company_id, expense_id, line_sequence, amount, amount_cents,
        description, load_required, expense_account_uuid
      ) VALUES (
        $1::uuid, $2::uuid, 1, $3::numeric, $4::bigint,
        $5, false, $6::uuid
      )`,
    [
      input.operating_company_id,
      expenseId,
      input.service_charge_cents / 100,
      input.service_charge_cents,
      "Bank service charge",
      input.service_charge_account_id,
    ]
  );

  const posting = await postSourceTransactionInClientTx(
    client as never,
    {
      operating_company_id: input.operating_company_id,
      source_transaction_type: "expense",
      source_transaction_id: expenseId,
    },
    { userId: actor.userId }
  );

  await client.query(
    `UPDATE accounting.expenses
        SET status = 'posted',
            posting_status = 'posted',
            posted_at = now(),
            journal_entry_id = $2::uuid,
            updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $3::uuid`,
    [expenseId, posting.journal_entry_id, input.operating_company_id]
  );

  return { expense_id: expenseId, journal_entry_id: posting.journal_entry_id };
}

export async function postReconciliationAdjustments(
  client: QueryableClient,
  input: ReconAdjustmentInput,
  actor: { userId: string; role: string }
): Promise<ReconAdjustmentResult> {
  requirePositiveCents(input.service_charge_cents, "service_charge_cents");
  requirePositiveCents(input.interest_earned_cents, "interest_earned_cents");

  let serviceChargeJeId = input.service_charge_journal_entry_id;
  let serviceChargeExpenseId = input.service_charge_expense_id ?? null;
  let interestJeId = input.interest_earned_journal_entry_id;

  if (input.service_charge_cents > 0) {
    if (!input.service_charge_date) throw new Error("service_charge_date_required");
    if (!input.service_charge_account_id) throw new Error("service_charge_account_required");
    if (!serviceChargeJeId) {
      const posted = await createAndPostServiceChargeExpense(
        client,
        {
          operating_company_id: input.operating_company_id,
          session_id: input.session_id,
          bank_ledger_account_id: input.bank_ledger_account_id,
          bank_account_id: input.bank_account_id,
          service_charge_cents: input.service_charge_cents,
          service_charge_date: input.service_charge_date,
          service_charge_account_id: input.service_charge_account_id,
        },
        actor
      );
      serviceChargeJeId = posted.journal_entry_id;
      serviceChargeExpenseId = posted.expense_id;
    }
  }

  if (input.interest_earned_cents > 0) {
    if (!input.interest_earned_date) throw new Error("interest_earned_date_required");
    if (!input.interest_earned_account_id) throw new Error("interest_earned_account_required");
    if (!interestJeId) {
      // Interest is income (Dr bank / Cr income) — not a cost document. JE via canonical poster.
      const je = await createJournalEntryOnClient(
        client,
        {
          operating_company_id: input.operating_company_id,
          entry_date: input.interest_earned_date,
          memo: `Bank reconciliation interest earned · session ${input.session_id}`,
          source: "auto",
          journal_entry_type_code: "GENERAL",
          source_transaction_type: "bank_reconciliation",
          source_transaction_id: input.session_id,
          postings: [
            {
              account_id: input.bank_ledger_account_id,
              debit_or_credit: "debit",
              amount_cents: input.interest_earned_cents,
              description: "Interest earned",
              source_transaction_type: "bank_reconciliation",
              source_transaction_id: input.session_id,
            },
            {
              account_id: input.interest_earned_account_id,
              debit_or_credit: "credit",
              amount_cents: input.interest_earned_cents,
              description: "Interest earned",
              source_transaction_type: "bank_reconciliation",
              source_transaction_id: input.session_id,
            },
          ],
        },
        actor
      );
      interestJeId = je.id;
    }
  }

  return {
    service_charge_journal_entry_id: serviceChargeJeId,
    service_charge_expense_id: serviceChargeExpenseId,
    interest_earned_journal_entry_id: interestJeId,
  };
}
