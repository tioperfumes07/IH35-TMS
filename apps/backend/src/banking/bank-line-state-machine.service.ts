/**
 * ROUND 360 (CC-2) — THE BANK FEED STATE MACHINE. Spec: docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md
 *
 * One engine for every way a bank line goes back to For review. It reads HOW the line left For review
 * (banking.bank_transactions.resolution_kind, derived by banking.bank_line_classify()) and undoes exactly that:
 *
 *   kind      what the line did                         UNDO
 *   added     categorize CREATED a document / JE        remove it: reverse the categorization JE, void the bills / bill
 *                                                       payments / payments the line created — the account no longer
 *                                                       carries it
 *   split     split CREATED bills + bill payments       void them, void the split rows
 *   matched   LINKED a document that already existed    break the link only (unmatchBankTransactionOnClient): document
 *                                                       untouched, its own flags cleared, back in the match pool
 *   transfer  minted a transfer, or linked one          minted by THIS line (minted_from_bank_transaction_id) -> revoke
 *                                                       it (JE reversed), release both sides; any other -> link only
 *   excluded  —                                         clear the exclusion
 *
 * HARD REQUIREMENTS (contract §"THE FOUR HARD REQUIREMENTS"):
 *   INSTANT       everything runs on the caller's client — one transaction; the caller commits or nothing happened.
 *   NEVER TWICE   a JE already reversed / voided, a document already voided, a transfer already revoked is a GL no-op:
 *                 the link is cleared and the outcome says "already".
 *   NO STRANDING  after the writes the line is re-read; if it is not in For review the whole undo throws and rolls back.
 *   NEVER DELETES a document the line did not create: only kind added/split/minted-transfer removes anything.
 */
import type { PoolClient } from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { reverseJournalEntryNoFlip } from "../accounting/journal-entries.service.js";
import { POSTING_ENGINE_SUPPORTS_REPOST } from "../accounting/posting-engine.service.js";
import { voidDocument } from "../accounting/void-document.service.js";
import { unmatchBankTransactionOnClient } from "../accounting/bank-recon/recon-worklist.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { assertBankTxnNotInReconciledSession } from "./closed-session-immutability.js";
import { RELEASE_TRANSFER_LINK_SET_SQL, revokeTransferInClient } from "./transfers.service.js";
import { attachReleaseReversals, releaseBankLineMatches } from "./bank-line-release.js";

export type BankLineBucket = "for_review" | "categorized" | "excluded";
export type BankLineKind = "added" | "matched" | "transfer" | "split";

export type BankLineUndoOutcome = {
  bank_transaction_id: string;
  from_bucket: BankLineBucket;
  from_kind: BankLineKind | null;
  to_bucket: "for_review";
  /** Journal entries this undo reversed (new reversals only). */
  reversed_journal_entry_ids: string[];
  /** Journal entries that were already reversed or voided — GL untouched, link cleared (never a double reversal). */
  already_reversed_journal_entry_ids: string[];
  /** Documents the line CREATED, voided through the governed void path. */
  voided_documents: Array<{ type: "bill" | "bill_payment" | "customer_payment"; id: string }>;
  /** Pre-existing documents released back to the match pool (kind matched) — untouched. */
  released_documents: Array<{ kind: string; id: string }>;
  revoked_transfer_id: string | null;
  /** Other bank lines released with this one (the other side of a minted transfer). */
  released_bank_transaction_ids: string[];
  noop: boolean;
};

type LineRow = {
  id: string;
  review_bucket: BankLineBucket;
  resolution_kind: BankLineKind | null;
  matched_journal_entry_id: string | null;
  matched_transfer_id: string | null;
  voided_at: string | null;
};

/** Every categorization field a bank line carries, cleared together (BANK-UNDO-01's release set, kept whole). */
export const RELEASE_CATEGORIZATION_SET_SQL = `
            status = 'pending_categorization',
            matched_load_id = NULL,
            matched_invoice_id = NULL,
            matched_bill_id = NULL,
            matched_expense_id = NULL,
            matched_payment_id = NULL,
            matched_bill_payment_id = NULL,
            matched_transfer_id = NULL,
            matched_settlement_id = NULL,
            matched_advance_id = NULL,
            matched_factoring_advance_id = NULL,
            matched_fuel_transaction_id = NULL,
            matched_relay_fuel_transaction_id = NULL,
            matched_journal_entry_id = NULL,
            category = NULL,
            category_kind = NULL,
            split_mode = NULL,
            coa_account_id = NULL,
            linked_entity_id = NULL,
            categorization_customer_id = NULL,
            categorization_vendor_id = NULL,
            categorization_gl_account_id = NULL,
            categorization_project_id = NULL,
            categorization_memo = NULL,
            categorization_driver_id = NULL,
            categorization_unit_id = NULL,
            categorization_load_id = NULL,
            categorization_recover_from_driver = false,
            categorization_recover_deduction_type = NULL,
            categorization_deduction_id = NULL,
            categorization_item_id = NULL,
            categorization_trailer_id = NULL,
            categorization_class_id = NULL,
            categorization_location = NULL,
            skip_reason = NULL,
            excluded_reason = NULL,
            investigate_note = NULL,
            categorized_at = NULL,
            categorized_by_user_id = NULL,
            review_state = 'for_review',
            updated_at = now()`;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Reverse a JE through the existing reversal primitive unless it is already reversed / voided / not posted.
 * Returns "reversed" | "already". A JE that no longer exists is "already" (nothing on the books to remove).
 */
async function reverseOnceOnClient(
  client: PoolClient,
  input: { operatingCompanyId: string; journalEntryId: string; actorUserId: string; reason: string }
): Promise<"reversed" | "already"> {
  const jeRes = await client.query<{ status: string; reversed_by_je_id: string | null }>(
    `SELECT status::text, reversed_by_je_id::text
       FROM accounting.journal_entries
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [input.journalEntryId, input.operatingCompanyId]
  );
  const je = jeRes.rows[0];
  if (!je || je.status !== "posted" || je.reversed_by_je_id) return "already";
  // BANK-F03 — never reverse what the poster cannot re-post: a corrected categorization would silently return the
  // original batch and the expense would vanish from the books. Refuse BEFORE reversing.
  if (!POSTING_ENGINE_SUPPORTS_REPOST) throw new Error("repost_unsupported");
  const enabled = await isEnabled(client as never, "MONEY_CONTROL_VOID_REVERSAL_ENABLED", {
    operating_company_id: input.operatingCompanyId,
    user_uuid: input.actorUserId,
  });
  if (!enabled) throw new Error("void_reversal_disabled");
  await reverseJournalEntryNoFlip(client, {
    operatingCompanyId: input.operatingCompanyId,
    journalEntryId: input.journalEntryId,
    reason: input.reason,
    actorUserId: input.actorUserId,
  });
  return "reversed";
}

/**
 * Void, through the governed void path, every document THIS line created (bills + bill payments from split / bulk
 * "post as bills", customer payments recorded from the line). Bill payments go first so a bill is never voided under a
 * live payment. Already-voided documents are skipped (never a second reversal).
 */
async function voidDocumentsCreatedByLine(
  client: PoolClient,
  input: { operatingCompanyId: string; bankTransactionId: string; actorUserId: string; reason: string },
  outcome: BankLineUndoOutcome
): Promise<void> {
  const created = await client.query<{ type: "bill" | "bill_payment" | "customer_payment"; id: string }>(
    `SELECT 'bill_payment'::text AS type, id::text FROM accounting.bill_payments
      WHERE operating_company_id = $1::uuid AND source_bank_transaction_id = $2::uuid AND voided_at IS NULL AND revoked_at IS NULL
     UNION ALL
     SELECT 'customer_payment', id::text FROM accounting.payments
      WHERE operating_company_id = $1::uuid AND source_bank_transaction_id = $2::uuid AND voided_at IS NULL
     UNION ALL
     SELECT 'bill', id::text FROM accounting.bills
      WHERE operating_company_id = $1::uuid AND source_bank_transaction_id = $2::uuid AND voided_at IS NULL AND revoked_at IS NULL`,
    [input.operatingCompanyId, input.bankTransactionId]
  );
  for (const doc of created.rows) {
    await voidDocument(client as never, {
      operatingCompanyId: input.operatingCompanyId,
      type: doc.type,
      id: doc.id,
      reason: input.reason,
      actor: { userId: input.actorUserId },
      currentBusinessDate: todayIso(),
    });
    outcome.voided_documents.push(doc);
  }
}

/**
 * UNMATCH — reverse ONLY the journal entries the MATCH ITSELF created (QuickBooks creates a Bank Deposit when a matched
 * receipt sits in Undeposited Funds, and Undo deletes that deposit). The document that was matched is untouched:
 *   - deposit sweep of a matched customer payment / factoring advance (Dr bank / Cr 1090 or cash_clearing)
 *   - bank-reconciliation variance JE posted with the match (transaction_source_links role bank_reconciliation_variance)
 *   - Faro Rsv Deposit JEs posted on the payment match (and the Faro register lines they categorized are released)
 * (Fuel / Relay fill and factoring chargeback JEs are reversed by unmatchBankTransactionOnClient itself.)
 * Each through reverseOnceOnClient: an entry already reversed is a GL no-op, never a second reversal.
 */
async function reverseMatchCreatedEntries(
  client: PoolClient,
  input: { operatingCompanyId: string; bankTransactionId: string; actorUserId: string },
  released: Array<{ kind: string; id: string }>,
  outcome: BankLineUndoOutcome
): Promise<void> {
  const created = await client.query<{ je_id: string; why: string }>(
    `SELECT DISTINCT je.id::text AS je_id, 'deposit_sweep'::text AS why
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
      WHERE p.operating_company_id = $1::uuid
        AND je.status = 'posted' AND je.reversed_by_je_id IS NULL
        AND ((p.source_transaction_type = 'customer_payment_deposit' AND p.source_transaction_id::text = ANY($2::text[]))
          OR (p.source_transaction_type = 'factoring_advance_deposit' AND p.source_transaction_id::text = ANY($3::text[])))
     UNION
     SELECT DISTINCT p.journal_entry_uuid::text, 'variance'
       FROM accounting.transaction_source_links l
       JOIN accounting.journal_entry_postings p ON p.id = l.journal_entry_posting_id
      WHERE l.operating_company_id = $1::uuid
        AND l.linked_object_type = 'bank_transaction' AND l.linked_object_id::text = $4
        AND l.relationship_role = 'bank_reconciliation_variance'`,
    [
      input.operatingCompanyId,
      released.filter((r) => r.kind === "payment").map((r) => r.id),
      released.filter((r) => r.kind === "factoring_advance").map((r) => r.id),
      input.bankTransactionId,
    ]
  );
  // Faro Rsv Deposits posted on this payment match: other (Faro register) lines carrying the same payment + their JE.
  const faro = await client.query<{ je_id: string; line_id: string; entry_id: string }>(
    `SELECT bt.matched_journal_entry_id::text AS je_id, bt.id::text AS line_id, e.id::text AS entry_id
       FROM banking.bank_transactions bt
       JOIN accounting.faro_reserve_entries e ON e.bank_transaction_id = bt.id AND e.journal_entry_id = bt.matched_journal_entry_id
      WHERE bt.operating_company_id = $1::uuid
        AND bt.id <> $2::uuid
        AND bt.matched_payment_id::text = ANY($3::text[])`,
    [input.operatingCompanyId, input.bankTransactionId, released.filter((r) => r.kind === "payment").map((r) => r.id)]
  );
  const jes = [...created.rows.map((r) => r.je_id), ...faro.rows.map((r) => r.je_id)];
  for (const jeId of [...new Set(jes)]) {
    const r = await reverseOnceOnClient(client, {
      operatingCompanyId: input.operatingCompanyId,
      journalEntryId: jeId,
      actorUserId: input.actorUserId,
      reason: `Unmatch bank line ${input.bankTransactionId} — reverse what the match created`,
    });
    (r === "reversed" ? outcome.reversed_journal_entry_ids : outcome.already_reversed_journal_entry_ids).push(jeId);
  }
  for (const f of faro.rows) {
    // ROUND 363-CC3-B — the Faro register line lets go of its match too: record the release before its pointers clear.
    await releaseBankLineMatches(client, {
      bankTransactionId: f.line_id,
      kind: "undo",
      reason: `released with bank line ${input.bankTransactionId} (Faro Rsv Deposit reversed)`,
      actorUserId: input.actorUserId,
    });
    await client.query(
      `UPDATE accounting.faro_reserve_entries SET journal_entry_id = NULL, posted_at = NULL, posted_by_user_id = NULL
        WHERE id = $1::uuid AND journal_entry_id = $2::uuid`,
      [f.entry_id, f.je_id]
    );
    await client.query(
      `UPDATE banking.bank_transactions SET ${RELEASE_CATEGORIZATION_SET_SQL}
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [f.line_id, input.operatingCompanyId]
    );
    outcome.released_bank_transaction_ids.push(f.line_id);
  }
}

/**
 * UNDO one bank line on the caller's transaction. Returns what it did; throws (and the caller's transaction rolls back)
 * if the line cannot be returned to For review cleanly.
 */
export async function undoBankLineOnClient(
  client: PoolClient,
  input: { operatingCompanyId: string; bankTransactionId: string; actorUserId: string; reason?: string }
): Promise<BankLineUndoOutcome> {
  const reason = input.reason?.trim() || "bank_line_undo";
  await assertBankTxnNotInReconciledSession(client, input.bankTransactionId, input.operatingCompanyId);

  const lineRes = await client.query<LineRow>(
    `SELECT id::text, review_bucket, resolution_kind, matched_journal_entry_id::text, matched_transfer_id::text,
            voided_at::text
       FROM banking.bank_transactions
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [input.bankTransactionId, input.operatingCompanyId]
  );
  const line = lineRes.rows[0];
  if (!line) throw new Error("bank_transaction_not_found");
  if (line.voided_at) throw new Error("bank_transaction_voided");

  const outcome: BankLineUndoOutcome = {
    bank_transaction_id: line.id,
    from_bucket: line.review_bucket,
    from_kind: line.resolution_kind,
    to_bucket: "for_review",
    reversed_journal_entry_ids: [],
    already_reversed_journal_entry_ids: [],
    voided_documents: [],
    released_documents: [],
    revoked_transfer_id: null,
    released_bank_transaction_ids: [],
    noop: false,
  };

  if (line.review_bucket === "for_review") {
    outcome.noop = true;
    return outcome;
  }

  // ROUND 363-CC3-B / LAW 363.9 — a send-back KEEPS the accepted match: every match this line carries is recorded as
  // released (who, when, why) BEFORE any branch below clears a pointer. trg_send_back_keeps_the_match refuses the
  // commit otherwise. The unmatch branch calls the same function again; by then there is nothing left to release.
  await releaseBankLineMatches(client, {
    bankTransactionId: line.id,
    kind: "undo",
    reason,
    actorUserId: input.actorUserId,
  });

  if (line.review_bucket === "excluded") {
    await client.query(
      `UPDATE banking.bank_transactions
          SET excluded_reason = NULL,
              skip_reason = NULL,
              status = CASE WHEN status = 'skipped' THEN 'pending_categorization' ELSE status END,
              review_state = 'for_review',
              updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [line.id, input.operatingCompanyId]
    );
  } else if (line.resolution_kind === "matched") {
    // MATCH linked a document that already existed: break the link only. Never reverse, never void.
    const unmatched = await unmatchBankTransactionOnClient(client, {
      operating_company_id: input.operatingCompanyId,
      bank_transaction_id: line.id,
      actor_user_uuid: input.actorUserId,
    });
    outcome.released_documents.push(...unmatched.released);
    if (unmatched.reversed_match_journal_entry_id) outcome.reversed_journal_entry_ids.push(unmatched.reversed_match_journal_entry_id);
    await reverseMatchCreatedEntries(
      client,
      { operatingCompanyId: input.operatingCompanyId, bankTransactionId: line.id, actorUserId: input.actorUserId },
      unmatched.released,
      outcome
    );
    // Anything the unmatch leaves linked (a load / invoice / settlement pointer, a categorization account) is released
    // too: a For-review line carries no document.
    await client.query(
      `UPDATE banking.bank_transactions SET ${RELEASE_CATEGORIZATION_SET_SQL}
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [line.id, input.operatingCompanyId]
    );
  } else if (line.resolution_kind === "transfer") {
    const transferRes = line.matched_transfer_id
      ? await client.query<{ id: string; revoked_at: string | null; minted_from_bank_transaction_id: string | null }>(
          `SELECT id::text, revoked_at::text, minted_from_bank_transaction_id::text
             FROM banking.transfers
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            LIMIT 1 FOR UPDATE`,
          [line.matched_transfer_id, input.operatingCompanyId]
        )
      : { rows: [] as Array<{ id: string; revoked_at: string | null; minted_from_bank_transaction_id: string | null }> };
    const transfer = transferRes.rows[0];
    // Only a transfer this line provably CREATED is removed with it; any other transfer (entered directly, or with no
    // recorded origin) existed before the line and only its link breaks — never delete what the line did not create.
    // (Measured 2026-10-03: USMCA has 0 live transfers, so no pre-ROUND-360 minted transfer lacks its origin.)
    const createdByThisLine = Boolean(transfer && transfer.minted_from_bank_transaction_id === line.id);
    if (transfer && createdByThisLine && !transfer.revoked_at) {
      const revoked = await revokeTransferInClient(client, transfer.id, input.operatingCompanyId, reason, input.actorUserId);
      outcome.revoked_transfer_id = transfer.id;
      outcome.released_bank_transaction_ids = revoked.released_bank_transaction_ids.filter((id) => id !== line.id);
    } else if (transfer) {
      outcome.released_documents.push({ kind: "transfer", id: transfer.id });
    }
    await client.query(
      `UPDATE banking.bank_transactions SET ${RELEASE_TRANSFER_LINK_SET_SQL}
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [line.id, input.operatingCompanyId]
    );
    // The paired line on the other account pointed at THIS line; it never pointed at a transfer it keeps.
    await client.query(
      `UPDATE banking.bank_transactions SET paired_transaction_id = NULL, updated_at = now()
        WHERE operating_company_id = $1::uuid AND paired_transaction_id = $2::uuid AND matched_transfer_id IS NULL`,
      [input.operatingCompanyId, line.id]
    );
  } else {
    // added / split — the line CREATED what it carries. Release the line first (so no void cascade can find it by its
    // links), then remove every document and journal entry it created.
    await client.query(
      `UPDATE banking.bank_transactions SET ${RELEASE_CATEGORIZATION_SET_SQL}
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [line.id, input.operatingCompanyId]
    );
    if (line.resolution_kind === "split") {
      await client.query(
        `UPDATE banking.bank_transaction_splits
            SET voided_at = now(), posting_status = 'void', updated_at = now(), updated_by_user_id = $3::uuid
          WHERE bank_transaction_id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL`,
        [line.id, input.operatingCompanyId, input.actorUserId]
      );
    }
    if (line.matched_journal_entry_id) {
      const r = await reverseOnceOnClient(client, {
        operatingCompanyId: input.operatingCompanyId,
        journalEntryId: line.matched_journal_entry_id,
        actorUserId: input.actorUserId,
        reason: `Undo bank categorization — release bank_transaction ${line.id}`,
      });
      (r === "reversed" ? outcome.reversed_journal_entry_ids : outcome.already_reversed_journal_entry_ids).push(
        line.matched_journal_entry_id
      );
    }
    await voidDocumentsCreatedByLine(
      client,
      { operatingCompanyId: input.operatingCompanyId, bankTransactionId: line.id, actorUserId: input.actorUserId, reason },
      outcome
    );
  }

  // A Faro reserve entry posted for this line points at the entry its JE came from; released with the line, so a later
  // match / post of the same line runs the poster again instead of skipping an entry that looks already posted.
  if (line.matched_journal_entry_id) {
    await client.query(
      `UPDATE accounting.faro_reserve_entries SET journal_entry_id = NULL, posted_at = NULL, posted_by_user_id = NULL
        WHERE operating_company_id = $1::uuid AND bank_transaction_id = $2::uuid AND journal_entry_id = $3::uuid`,
      [input.operatingCompanyId, line.id, line.matched_journal_entry_id]
    );
  }

  // ROUND 363-CC3-B — every reversal this undo produced names the bank line (released rows + the reversal's postings).
  await attachReleaseReversals(client, line.id, outcome.reversed_journal_entry_ids);

  // NO STRANDING — the line must now be in For review with no document; otherwise nothing of this undo commits.
  const after = await client.query<{ review_bucket: string; resolution_kind: string | null }>(
    `SELECT review_bucket, resolution_kind FROM banking.bank_transactions WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [line.id, input.operatingCompanyId]
  );
  if (after.rows[0]?.review_bucket !== "for_review" || after.rows[0]?.resolution_kind !== null) {
    throw new Error(`bank_line_undo_left_line_in_${after.rows[0]?.review_bucket ?? "unknown"}`);
  }

  await appendCrudAudit(
    client,
    input.actorUserId,
    "banking.bank_line.undone",
    {
      resource_type: "banking.bank_transactions",
      resource_id: line.id,
      operating_company_id: input.operatingCompanyId,
      reason,
      ...outcome,
    },
    "warning",
    "ROUND-360-BANK-LINE-STATE-MACHINE"
  );
  return outcome;
}

/**
 * Bulk UNDO — each line in its own SAVEPOINT: one line's failure rolls back that line only (never half a line), and the
 * rest still commit with the caller's transaction.
 */
export async function undoBankLinesOnClient(
  client: PoolClient,
  input: { operatingCompanyId: string; bankTransactionIds: string[]; actorUserId: string; reason?: string }
): Promise<{ succeeded: BankLineUndoOutcome[]; failed: Array<{ id: string; reason: string }> }> {
  const succeeded: BankLineUndoOutcome[] = [];
  const failed: Array<{ id: string; reason: string }> = [];
  for (const id of input.bankTransactionIds) {
    await client.query("SAVEPOINT bank_line_undo");
    try {
      succeeded.push(
        await undoBankLineOnClient(client, {
          operatingCompanyId: input.operatingCompanyId,
          bankTransactionId: id,
          actorUserId: input.actorUserId,
          reason: input.reason,
        })
      );
      await client.query("RELEASE SAVEPOINT bank_line_undo");
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT bank_line_undo");
      const e = err as { code?: string; message?: string };
      failed.push({ id, reason: e.code === "reconciled_session_locked" ? e.code : String(e.message ?? "undo_failed") });
    }
  }
  return { succeeded, failed };
}
