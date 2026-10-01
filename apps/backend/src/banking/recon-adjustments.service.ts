/**
 * BANK-ECON-04 — post recon service charge + interest through createJournalEntryOnClient.
 *
 * QBO reconcile Finish: service charge = Dr expense / Cr bank; interest = Dr bank / Cr income.
 * Source document = the reconciliation session (source_transaction_type = bank_reconciliation).
 * Idempotent: if the session already carries a JE FK for that leg, skip re-post.
 */
import type { QueryableClient } from "../accounting/journal-entry-type-resolver.js";
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";

export type ReconAdjustmentInput = {
  operating_company_id: string;
  session_id: string;
  bank_ledger_account_id: string;
  service_charge_cents: number;
  service_charge_date: string | null;
  service_charge_account_id: string | null;
  service_charge_journal_entry_id: string | null;
  interest_earned_cents: number;
  interest_earned_date: string | null;
  interest_earned_account_id: string | null;
  interest_earned_journal_entry_id: string | null;
};

export type ReconAdjustmentResult = {
  service_charge_journal_entry_id: string | null;
  interest_earned_journal_entry_id: string | null;
};

function requirePositiveCents(n: number, label: string) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label}_must_be_non_negative_integer`);
}

export async function postReconciliationAdjustments(
  client: QueryableClient,
  input: ReconAdjustmentInput,
  actor: { userId: string; role: string }
): Promise<ReconAdjustmentResult> {
  requirePositiveCents(input.service_charge_cents, "service_charge_cents");
  requirePositiveCents(input.interest_earned_cents, "interest_earned_cents");

  let serviceChargeJeId = input.service_charge_journal_entry_id;
  let interestJeId = input.interest_earned_journal_entry_id;

  if (input.service_charge_cents > 0) {
    if (!input.service_charge_date) throw new Error("service_charge_date_required");
    if (!input.service_charge_account_id) throw new Error("service_charge_account_required");
    if (!serviceChargeJeId) {
      const je = await createJournalEntryOnClient(
        client,
        {
          operating_company_id: input.operating_company_id,
          entry_date: input.service_charge_date,
          memo: `Bank reconciliation service charge · session ${input.session_id}`,
          source: "auto",
          journal_entry_type_code: "GENERAL",
          source_transaction_type: "bank_reconciliation",
          source_transaction_id: input.session_id,
          postings: [
            {
              account_id: input.service_charge_account_id,
              debit_or_credit: "debit",
              amount_cents: input.service_charge_cents,
              description: "Bank service charge",
              source_transaction_type: "bank_reconciliation",
              source_transaction_id: input.session_id,
            },
            {
              account_id: input.bank_ledger_account_id,
              debit_or_credit: "credit",
              amount_cents: input.service_charge_cents,
              description: "Bank service charge",
              source_transaction_type: "bank_reconciliation",
              source_transaction_id: input.session_id,
            },
          ],
        },
        actor
      );
      serviceChargeJeId = je.id;
    }
  }

  if (input.interest_earned_cents > 0) {
    if (!input.interest_earned_date) throw new Error("interest_earned_date_required");
    if (!input.interest_earned_account_id) throw new Error("interest_earned_account_required");
    if (!interestJeId) {
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
    interest_earned_journal_entry_id: interestJeId,
  };
}
