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

export type SupersedePlaidPendingResult =
  | { superseded: false; reason: "pending_not_found" | "no_exact_posted_candidate" | "multiple_exact_posted_candidates" | "financially_linked" }
  | { superseded: true; pending_id: string; posted_id: string };

/**
 * ROUND 274 item 53 — when a Plaid pending row is retired into its posted survivor, any live
 * banking.reconciliation_matches still pointing at the pending row must move to the survivor.
 * Measured live (USMCA): match `2d1f3f73-52c7-4249-944a-3e9ceec1ee8c` stayed on superseded pending
 * `f5bbddce-7690-4594-803e-a90fff840dff` while survivor `52c51c10-bd54-44bf-b734-f79a1811cefd` held
 * none. UNIQUE (bank_transaction_id, ledger_entry_kind, ledger_entry_id) — skip re-point when the
 * survivor already carries an identical live triple (void the pending's duplicate instead).
 */
export async function repointReconciliationMatchesOnPlaidMerge(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }> },
  args: { pendingId: string; survivorId: string; operatingCompanyId: string }
): Promise<{ repointed: number; voided_duplicates: number }> {
  const voidedDup = await client.query(
    `
      UPDATE banking.reconciliation_matches AS pending_rm
         SET voided_at = COALESCE(pending_rm.voided_at, now()),
             void_reason = COALESCE(pending_rm.void_reason, 'plaid_pending_merge_duplicate_on_survivor'),
             updated_at = now()
        FROM banking.reconciliation_matches AS survivor_rm
       WHERE pending_rm.bank_transaction_id = $1::uuid
         AND pending_rm.operating_company_id = $3::uuid
         AND pending_rm.voided_at IS NULL
         AND survivor_rm.bank_transaction_id = $2::uuid
         AND survivor_rm.operating_company_id = $3::uuid
         AND survivor_rm.voided_at IS NULL
         AND survivor_rm.ledger_entry_kind = pending_rm.ledger_entry_kind
         AND survivor_rm.ledger_entry_id IS NOT DISTINCT FROM pending_rm.ledger_entry_id
      RETURNING pending_rm.id
    `,
    [args.pendingId, args.survivorId, args.operatingCompanyId]
  );

  const repointed = await client.query(
    `
      UPDATE banking.reconciliation_matches
         SET bank_transaction_id = $2::uuid,
             updated_at = now()
       WHERE bank_transaction_id = $1::uuid
         AND operating_company_id = $3::uuid
         AND voided_at IS NULL
      RETURNING id
    `,
    [args.pendingId, args.survivorId, args.operatingCompanyId]
  );

  // Carry matched_* + categorized_by_user_id from the pending onto the survivor so control-totals
  // does not see a system-written matched_* with no user (verify-control-totals).
  await client.query(
    `
      UPDATE banking.bank_transactions AS survivor
         SET matched_invoice_id = COALESCE(survivor.matched_invoice_id, pending.matched_invoice_id),
             matched_bill_id = COALESCE(survivor.matched_bill_id, pending.matched_bill_id),
             matched_payment_id = COALESCE(survivor.matched_payment_id, pending.matched_payment_id),
             matched_settlement_id = COALESCE(survivor.matched_settlement_id, pending.matched_settlement_id),
             matched_expense_id = COALESCE(survivor.matched_expense_id, pending.matched_expense_id),
             matched_bill_payment_id = COALESCE(survivor.matched_bill_payment_id, pending.matched_bill_payment_id),
             matched_transfer_id = COALESCE(survivor.matched_transfer_id, pending.matched_transfer_id),
             matched_journal_entry_id = COALESCE(survivor.matched_journal_entry_id, pending.matched_journal_entry_id),
             matched_load_id = COALESCE(survivor.matched_load_id, pending.matched_load_id),
             matched_advance_id = COALESCE(survivor.matched_advance_id, pending.matched_advance_id),
             matched_factoring_advance_id = COALESCE(survivor.matched_factoring_advance_id, pending.matched_factoring_advance_id),
             matched_fuel_transaction_id = COALESCE(survivor.matched_fuel_transaction_id, pending.matched_fuel_transaction_id),
             matched_relay_fuel_transaction_id = COALESCE(survivor.matched_relay_fuel_transaction_id, pending.matched_relay_fuel_transaction_id),
             matched_deposit_id = COALESCE(survivor.matched_deposit_id, pending.matched_deposit_id),
             categorized_by_user_id = COALESCE(survivor.categorized_by_user_id, pending.categorized_by_user_id),
             categorized_at = COALESCE(survivor.categorized_at, pending.categorized_at),
             updated_at = now()
        FROM banking.bank_transactions AS pending
       WHERE pending.id = $1::uuid
         AND survivor.id = $2::uuid
         AND pending.operating_company_id = $3::uuid
         AND survivor.operating_company_id = $3::uuid
    `,
    [args.pendingId, args.survivorId, args.operatingCompanyId]
  );

  return {
    repointed: repointed.rowCount ?? (repointed.rows?.length ?? 0),
    voided_duplicates: voidedDup.rowCount ?? (voidedDup.rows?.length ?? 0),
  };
}

/** Operator remediation for historical rows ingested before pending_transaction_id was honored. */
export async function supersedePlaidPendingByExactPostedCandidate(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }> },
  args: { pendingRowId: string; operatingCompanyId: string }
): Promise<SupersedePlaidPendingResult> {
  const pendingRes = await client.query(
    `
      SELECT id, bank_account_id, transaction_date, amount_cents, is_credit,
             matched_journal_entry_id, reconciled_obligation_id, categorization_gl_account_id
      FROM banking.bank_transactions
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND source = 'plaid'
        AND pending = true
        AND voided_at IS NULL
      FOR UPDATE
    `,
    [args.pendingRowId, args.operatingCompanyId]
  );
  const pending = pendingRes.rows[0] as
    | {
        id: string;
        bank_account_id: string;
        transaction_date: string;
        amount_cents: number;
        is_credit: boolean;
        matched_journal_entry_id: string | null;
        reconciled_obligation_id: string | null;
        categorization_gl_account_id: string | null;
      }
    | undefined;
  if (!pending) return { superseded: false, reason: "pending_not_found" };
  if (pending.matched_journal_entry_id || pending.reconciled_obligation_id || pending.categorization_gl_account_id) {
    return { superseded: false, reason: "financially_linked" };
  }

  const candidates = await client.query(
    `
      SELECT id, plaid_transaction_id
      FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid
        AND bank_account_id = $2::uuid
        AND id <> $3::uuid
        AND source = 'plaid'
        AND pending = false
        AND voided_at IS NULL
        AND amount_cents = $4
        AND is_credit = $5
        AND transaction_date BETWEEN $6::date - INTERVAL '7 days' AND $6::date + INTERVAL '7 days'
      ORDER BY transaction_date, id
      LIMIT 2
    `,
    [args.operatingCompanyId, pending.bank_account_id, pending.id, pending.amount_cents, pending.is_credit, pending.transaction_date]
  );
  if (candidates.rows.length === 0) return { superseded: false, reason: "no_exact_posted_candidate" };
  if (candidates.rows.length > 1) return { superseded: false, reason: "multiple_exact_posted_candidates" };
  const posted = candidates.rows[0] as { id: string };

  const retired = await client.query(
    `
      UPDATE banking.bank_transactions
      SET voided_at = now(),
          voided_reason = 'operator_confirmed_plaid_pending_replacement:' || $2::text,
          merged_into_bank_transaction_id = $2::uuid,
          dedup_hash = NULL,
          updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $3::uuid
        AND pending = true
        AND voided_at IS NULL
        AND matched_journal_entry_id IS NULL
        AND reconciled_obligation_id IS NULL
        AND categorization_gl_account_id IS NULL
      RETURNING id
    `,
    [pending.id, posted.id, args.operatingCompanyId]
  );
  if ((retired.rowCount ?? 0) !== 1) return { superseded: false, reason: "financially_linked" };
  // ROUND 274 item 53 — carry live matches to the posted survivor (never leave them on voided pending).
  await repointReconciliationMatchesOnPlaidMerge(client, {
    pendingId: pending.id,
    survivorId: posted.id,
    operatingCompanyId: args.operatingCompanyId,
  });
  return { superseded: true, pending_id: pending.id, posted_id: posted.id };
}

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
  // ROUND 274 item 53 — carry live matches to the posted survivor (never leave them on voided pending).
  await repointReconciliationMatchesOnPlaidMerge(client, {
    pendingId: pending.id,
    survivorId: args.postedRowId,
    operatingCompanyId: args.operatingCompanyId,
  });
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
