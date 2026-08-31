import { createHash } from "node:crypto";

export function normalizeBankTransactionDescription(input: string | null | undefined): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 $.\-]/g, "")
    .trim();
}

export type BankTxDedupParts = {
  bank_account_id: string;
  transaction_date: string;
  amount_cents: number;
  normalized_description: string;
};

export function computeBankTransactionDedupHash(parts: BankTxDedupParts): string {
  const amt = Math.abs(Math.round(Number(parts.amount_cents)));
  const payload = `${parts.bank_account_id}|${parts.transaction_date}|${amt}|${parts.normalized_description}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export type MergeManualStubResult =
  | { merged: false; reason: "no_stub" | "multiple_stubs" }
  | { merged: true; stub_id: string };

export type RetirePlaidPendingResult =
  | { retired: false; reason: "no_pending_predecessor" | "financially_linked" }
  | { retired: true; pending_id: string };

/**
 * Plaid gives a posted transaction a new id and points back to the replaced pending id.
 * Preserve the pending row as WORM evidence, but remove it from active cash exactly once.
 */
export async function retirePlaidPendingPredecessor(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }> },
  args: {
    postedRowId: string;
    postedPlaidTransactionId: string;
    pendingPlaidTransactionId: string | null | undefined;
    operatingCompanyId: string;
    bankAccountId: string;
  }
): Promise<RetirePlaidPendingResult> {
  if (!args.pendingPlaidTransactionId) return { retired: false, reason: "no_pending_predecessor" };

  const candidate = await client.query(
    `
      SELECT
        id,
        matched_journal_entry_id,
        reconciled_obligation_id,
        categorization_gl_account_id
      FROM banking.bank_transactions
      WHERE plaid_transaction_id = $1::text
        AND bank_account_id = $2::uuid
        AND operating_company_id = $3::uuid
        AND pending = true
        AND voided_at IS NULL
      LIMIT 1
    `,
    [args.pendingPlaidTransactionId, args.bankAccountId, args.operatingCompanyId]
  );
  const pending = candidate.rows[0] as
    | {
        id: string;
        matched_journal_entry_id: string | null;
        reconciled_obligation_id: string | null;
        categorization_gl_account_id: string | null;
      }
    | undefined;
  if (!pending) return { retired: false, reason: "no_pending_predecessor" };
  if (pending.matched_journal_entry_id || pending.reconciled_obligation_id || pending.categorization_gl_account_id) {
    return { retired: false, reason: "financially_linked" };
  }

  const retired = await client.query(
    `
      UPDATE banking.bank_transactions
      SET
        voided_at = now(),
        voided_reason = 'replaced_by_plaid_posted:' || $2::text,
        merged_into_bank_transaction_id = $3::uuid,
        dedup_hash = NULL,
        updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $4::uuid
        AND bank_account_id = $5::uuid
        AND pending = true
        AND voided_at IS NULL
        AND matched_journal_entry_id IS NULL
        AND reconciled_obligation_id IS NULL
        AND categorization_gl_account_id IS NULL
      RETURNING id
    `,
    [pending.id, args.postedPlaidTransactionId, args.postedRowId, args.operatingCompanyId, args.bankAccountId]
  );
  if ((retired.rowCount ?? 0) === 0) return { retired: false, reason: "financially_linked" };
  return { retired: true, pending_id: pending.id };
}

/** Merge a single manual receipt/intake row into a Plaid-backed row and void the stub (never DELETE). */
export async function mergeManualBankTransactionStub(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }> },
  args: {
    plaidRowId: string;
    operatingCompanyId: string;
    bankAccountId: string;
    transactionDate: string;
    amountCents: number;
    normalizedDescription: string;
  }
): Promise<MergeManualStubResult> {
  const dedupHash = computeBankTransactionDedupHash({
    bank_account_id: args.bankAccountId,
    transaction_date: args.transactionDate,
    amount_cents: args.amountCents,
    normalized_description: args.normalizedDescription,
  });

  const stubRes = await client.query(
    `
      SELECT id
      FROM banking.bank_transactions
      WHERE bank_account_id = $1::uuid
        AND operating_company_id = $2::uuid
        AND dedup_hash = $3
        AND COALESCE(source, 'manual') = 'manual'
        AND plaid_transaction_id IS NULL
        AND voided_at IS NULL
      ORDER BY created_at ASC
      LIMIT 2
    `,
    [args.bankAccountId, args.operatingCompanyId, dedupHash]
  );
  if (stubRes.rows.length === 0) return { merged: false, reason: "no_stub" };
  if (stubRes.rows.length > 1) return { merged: false, reason: "multiple_stubs" };
  const stubId = String((stubRes.rows[0] as { id: string }).id);

  const stubDetail = await client.query(
    `
      SELECT receipt_evidence_r2_key, reconciled_obligation_type, reconciled_obligation_id, notes
      FROM banking.bank_transactions
      WHERE id = $1::uuid
        AND voided_at IS NULL
      LIMIT 1
    `,
    [stubId]
  );
  const stub = stubDetail.rows[0] as {
    receipt_evidence_r2_key: string | null;
    reconciled_obligation_type: string | null;
    reconciled_obligation_id: string | null;
    notes: string | null;
  } | undefined;
  if (!stub) return { merged: false, reason: "no_stub" };

  await client.query(
    `
      UPDATE banking.bank_transactions
      SET
        receipt_evidence_r2_key = COALESCE(receipt_evidence_r2_key, $2::text),
        reconciled_obligation_type = COALESCE(reconciled_obligation_type, $3::text),
        reconciled_obligation_id = COALESCE(reconciled_obligation_id, $4::uuid),
        notes = CASE
          WHEN $5::text IS NOT NULL AND length(trim($5::text)) > 0 THEN trim(BOTH E'\\n' FROM concat_ws(E'\\n', notes, 'merged_manual_stub:' || $5::text))
          ELSE notes
        END,
        dedup_hash = $6::text,
        updated_at = now()
      WHERE id = $1::uuid
        AND voided_at IS NULL
    `,
    [
      args.plaidRowId,
      stub.receipt_evidence_r2_key,
      stub.reconciled_obligation_type,
      stub.reconciled_obligation_id,
      stub.notes,
      dedupHash,
    ]
  );

  // F9-01 — void stub; retain evidence row. Clear dedup_hash so even pre-partial-index envs cannot collide.
  await client.query(
    `
      UPDATE banking.bank_transactions
      SET
        voided_at = COALESCE(voided_at, now()),
        voided_reason = COALESCE(voided_reason, 'merged_into_plaid'),
        merged_into_bank_transaction_id = $2::uuid,
        dedup_hash = NULL,
        updated_at = now()
      WHERE id = $1::uuid
        AND voided_at IS NULL
    `,
    [stubId, args.plaidRowId]
  );
  return { merged: true, stub_id: stubId };
}
