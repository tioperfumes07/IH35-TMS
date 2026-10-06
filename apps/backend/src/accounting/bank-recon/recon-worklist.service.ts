// BANK-F30015 (2026-09-09, CC-2): every banking.bank_transactions read in this file now excludes
// voided (reversed/superseded) rows -- the same class of gap already fixed in
// banking/reconciliation.routes.ts (BANK-F30012). This is a SIBLING, parallel reconciliation
// system (banking.reconciliation_matches / match_state, distinct from reconciliation_sessions /
// reconciliation_cleared), and it had the identical gap independently. Live-confirmed: all 699
// voided bank_transactions rows on prod are neither voided-aware-excluded nor
// reconciliation_matches-linked, so every one of them was surfacing as a live, clickable
// "unmatched, needs review" item in this worklist -- an operator working this queue would see 699
// phantom line items for transactions that were already superseded and need no action at all.
export { unmatchBankTransactionOnClient, type UnmatchOnClientResult } from "./unmatch-bank-transaction.service.js";
import { attachReleaseReversals, releaseBankLineMatches, releasedInThisTransaction, type BankLineReleaseKind } from "../../banking/bank-line-release.js";
import type { PoolClient } from "pg";
import { withLuciaBypass } from "../../auth/db.js";
import { reverseJournalEntryNoFlip } from "../journal-entries.service.js";
import { acceptMatchWithResolveDifference, previewMatchVariance, type LedgerEntryKind } from "./match.service.js";

const ZERO_VARIANCE_ACCOUNT_ID = "00000000-0000-4000-8000-000000000000";

type WorklistRow = {
  id: string;
  transaction_date: string;
  amount_cents: number;
  description: string | null;
  merchant_name: string | null;
  is_credit: boolean;
};

function confirmedStateWhere() {
  // ROUND 360 — a voided match row (an unmatch, or a void of the document) no longer covers the line.
  return `rm.voided_at IS NULL AND rm.match_state IN ('auto_matched', 'user_matched', 'rejected')`;
}

export async function getReconWorklist(input: {
  operating_company_id: string;
  account_id: string;
  period_start: string;
  period_end: string;
}) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const unmatched = await client.query<WorklistRow>(
      `
        SELECT
          bt.id::text,
          bt.transaction_date::text,
          bt.amount_cents::int,
          bt.description,
          bt.merchant_name,
          bt.is_credit
        FROM banking.bank_transactions bt
        WHERE bt.operating_company_id = $1::uuid
          AND bt.bank_account_id = $2::uuid
          AND bt.transaction_date BETWEEN $3::date AND $4::date
          AND bt.voided_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM banking.reconciliation_matches rm
            WHERE rm.bank_transaction_id = bt.id
              AND rm.operating_company_id = bt.operating_company_id
              AND ${confirmedStateWhere()}
          )
        ORDER BY bt.transaction_date ASC, bt.created_at ASC
      `,
      [input.operating_company_id, input.account_id, input.period_start, input.period_end]
    );

    const autoMatched = await client.query<
      WorklistRow & { ledger_entry_kind: LedgerEntryKind; ledger_entry_id: string; match_score: number; match_state: string }
    >(
      `
        SELECT
          bt.id::text,
          bt.transaction_date::text,
          bt.amount_cents::int,
          bt.description,
          bt.merchant_name,
          bt.is_credit,
          rm.ledger_entry_kind::text AS ledger_entry_kind,
          rm.ledger_entry_id::text AS ledger_entry_id,
          rm.match_score::numeric::float8 AS match_score,
          rm.match_state::text AS match_state
        FROM banking.reconciliation_matches rm
        JOIN banking.bank_transactions bt ON bt.id = rm.bank_transaction_id
        WHERE rm.operating_company_id = $1::uuid
          AND bt.bank_account_id = $2::uuid
          AND bt.transaction_date BETWEEN $3::date AND $4::date
          AND rm.match_state = 'auto_matched'
          -- RECON-ACCEPT-DEAD-CANDIDATE — a bank line resolved via direct Categorize (Banking →
          -- Transactions) already sets bt.review_state = 'matched' when it posts its JE. The same JE
          -- also scores as a reconciliation_matches auto_matched candidate for this line (this is the
          -- suggestion engine working as designed — the JE genuinely is the best match). Without this
          -- filter, that already-resolved line kept surfacing here as a live, clickable "Accept"
          -- candidate that acceptMatchWithResolveDifference's own idempotency guard
          -- (match.service.ts: if txn.review_state === "matched", throw new Error
          -- "bank_transaction_already_matched") can never actually accept — every click 500s. The
          -- line is already correctly reconciled (confirmedStateWhere() already counts its
          -- auto_matched row toward progress); it just has nothing left for the user to accept, so it
          -- must not be offered as an outstanding action item. Live-reproduced 2026-08-22: categorized
          -- USMCA bank_transaction 438fb0c5 (Wire Transfer Fee, $15.00) -> JE 1f8ef271 posted+balanced
          -- -> worklist correctly showed it as an auto-match candidate -> Accept 500'd
          -- ("bank_transaction_already_matched") on every attempt, live-Chrome-confirmed via a direct
          -- fetch to /api/v1/bank-recon/accept-match, not just a client-side guess.
          AND bt.review_state <> 'matched'
          AND bt.voided_at IS NULL
        ORDER BY bt.transaction_date ASC, bt.created_at ASC
      `,
      [input.operating_company_id, input.account_id, input.period_start, input.period_end]
    );

    const varianceResolved = await client.query<{
      journal_entry_id: string;
      entry_date: string;
      /** Sourced from journal_entries.memo — there is no reference_no column; name kept for the payload contract. */
      reference_no: string | null;
      /** Canonical JE label (memo IS the JE's identity — no number/ref column exists on the table). */
      memo: string | null;
      variance_cents: number;
    }>(
      `
        SELECT
          je.id::text AS journal_entry_id,
          je.entry_date::text,
          -- LV-JE-LABEL-IGNORES-POPULATED-MEMO / phantom column: accounting.journal_entries has NO
          -- reference_no column — verified against information_schema, it does not exist on that
          -- table or ANY table in the database. This query named it in the SELECT *and* the WHERE, so
          -- it raised 42703 every time it ran; Postgres resolves columns at parse time, so it failed
          -- regardless of how many rows existed. The writer settles where the tag actually lives:
          -- match.service.ts:654 inserts bank-recon:<bank_transaction_id> into **memo**. Repointed to
          -- memo rather than guessed. AS reference_no is retained deliberately so the existing payload
          -- contract (apps/frontend/src/api/banking.ts:204) keeps working; je.memo is also selected as
          -- the canonical JE label so this payload can no longer render "Journal entry - not visible".
          je.memo::text AS reference_no,
          je.memo,
          COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::int AS variance_cents
        FROM accounting.journal_entries je
        LEFT JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
        WHERE je.operating_company_id = $1::uuid
          -- DISP-F6XXX -- match.service.ts's postDifferenceJournalEntry now inserts source='auto'
          -- (the only two valid values are 'manual'/'auto' per journal_entries_source_check; the
          -- literal 'bank_reconciliation' this filter used to check for was never a legal value, so
          -- this read has never matched a real row -- the INSERT it was meant to find always 500'd
          -- before writing one). The memo LIKE filter below is this query's real, sufficient
          -- discriminator (only this one function ever writes that exact 'bank-recon:' prefix); kept
          -- as defense-in-depth, updated to match the now-correct insert.
          AND je.source = 'auto'
          AND je.entry_date BETWEEN $2::date AND $3::date
          AND COALESCE(je.memo, '') LIKE 'bank-recon:%'
        GROUP BY je.id
        ORDER BY je.entry_date DESC, je.created_at DESC
      `,
      [input.operating_company_id, input.period_start, input.period_end]
    );

    const progress = await client.query<{ total_count: number; matched_count: number }>(
      `
        WITH period_tx AS (
          SELECT id
          FROM banking.bank_transactions
          WHERE operating_company_id = $1::uuid
            AND bank_account_id = $2::uuid
            AND transaction_date BETWEEN $3::date AND $4::date
            AND voided_at IS NULL
        )
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM banking.reconciliation_matches rm
              WHERE rm.bank_transaction_id = period_tx.id
                AND rm.operating_company_id = $1::uuid
                AND ${confirmedStateWhere()}
            )
          )::int AS matched_count
        FROM period_tx
      `,
      [input.operating_company_id, input.account_id, input.period_start, input.period_end]
    );
    const total = Number(progress.rows[0]?.total_count ?? 0);
    const matched = Number(progress.rows[0]?.matched_count ?? 0);
    const progressPct = total > 0 ? Number(((matched / total) * 100).toFixed(2)) : 100;

    return {
      unmatched_transactions: unmatched.rows,
      auto_matched_candidates: autoMatched.rows,
      variance_resolved_entries: varianceResolved.rows,
      progress: {
        total_transactions: total,
        matched_or_skipped_transactions: matched,
        percent: progressPct,
      },
    };
  });
}

export async function acceptReconMatch(input: {
  operating_company_id: string;
  bank_transaction_id: string;
  actor_user_uuid: string;
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_id: string;
  variance_account_id?: string;
}) {
  const preview = await previewMatchVariance({
    operating_company_id: input.operating_company_id,
    bank_transaction_id: input.bank_transaction_id,
    ledger_entry_kind: input.ledger_entry_kind,
    ledger_entry_id: input.ledger_entry_id,
  });
  if (preview.variance_cents !== 0 && !input.variance_account_id) {
    throw new Error("variance_account_id_required");
  }
  return acceptMatchWithResolveDifference({
    operating_company_id: input.operating_company_id,
    bank_transaction_id: input.bank_transaction_id,
    actor_user_uuid: input.actor_user_uuid,
    ledger_entry_kind: input.ledger_entry_kind,
    ledger_entry_id: input.ledger_entry_id,
    difference_account_id: input.variance_account_id ?? ZERO_VARIANCE_ACCOUNT_ID,
  });
}

export async function rejectReconMatch(input: {
  operating_company_id: string;
  bank_transaction_id: string;
  actor_user_uuid: string;
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_id: string;
}) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    await client.query(
      `
        INSERT INTO banking.reconciliation_matches (
          operating_company_id,
          bank_transaction_id,
          ledger_entry_kind,
          ledger_entry_id,
          match_score,
          match_state,
          matched_at,
          matched_by_user_uuid
        )
        VALUES ($1::uuid, $2::uuid, $3::text, $4::uuid, 0, 'rejected', now(), $5::uuid)
        ON CONFLICT (bank_transaction_id, ledger_entry_kind, ledger_entry_id) WHERE match_state <> 'released'
        DO UPDATE SET
          match_score = 0,
          match_state = 'rejected',
          matched_at = now(),
          matched_by_user_uuid = EXCLUDED.matched_by_user_uuid
      `,
      [
        input.operating_company_id,
        input.bank_transaction_id,
        input.ledger_entry_kind,
        input.ledger_entry_id,
        input.actor_user_uuid,
      ]
    );
    return { ok: true };
  });
}

// BANK-F9998 F5 — the reconciliation.routes.ts unmatch endpoint requires an active reconciliation
// session covering the transaction's date. MatchDrawer's own accept-match flow (this file) needs
// no session at all, so a bare MatchDrawer confirm had no direct undo without first standing up a
// session for that period. This mirrors that session-scoped handler's release logic (all
// matched_*_id columns, 'rejected' reconciliation_matches rows, JE reversal — same as F6) without
// the session/date-range gate, reachable from wherever an ad-hoc accept-match was made.
//
// BNK-11 (ACC-20, 2026-09-07) — this handler only ever cleared 6 of the 8 matched_*_id columns
// acceptMatchWithResolveDifference() can actually set (match.service.ts's MATCHED_COLUMN_BY_KIND
// includes 'payment' -> matched_payment_id and 'bill_payment' -> matched_bill_payment_id — neither
// was in this function's UPDATE, SELECT, or its rejectedKinds list). So unmatching a bank line that
// had been matched to a payment or a bill payment left banking.bank_transactions.matched_payment_id
// / matched_bill_payment_id pointing at the ledger row FOREVER, while review_state correctly reset
// to 'for_review' — a bank line simultaneously "back in the queue" and "still linked" to a payment
// it no longer represents. Worse: acceptMatchWithResolveDifference's own payment/bill_payment branch
// (lines ~1179-1259) stamps the REVERSE pointer on the ledger side too — accounting.payments
// .source_bank_transaction_id and accounting.bill_payments.source_bank_transaction_id /
// from_bank_account_id — and this function never cleared those either. Fixed on both sides: clear
// matched_payment_id/matched_bill_payment_id here (mirroring the other 6 columns exactly), and
// null out the ledger-side back-pointer ONLY when it still points at THIS bank transaction (so a
// payment/bill_payment later re-linked to a DIFFERENT bank line, or independently posted straight
// to the bank, is never clobbered by an unmatch of a stale, no-longer-relevant link).
export async function unmatchBankTransaction(input: {
  operating_company_id: string;
  bank_transaction_id: string;
  actor_user_uuid: string;
}): Promise<{ ok: boolean }> {
  // ROUND 360 — every unmatch goes through the bank-line state machine (one transaction, by resolution_kind).
  // Imported lazily: the state machine imports unmatchBankTransactionOnClient from this module.
  const { undoBankLineOnClient } = await import("../../banking/bank-line-state-machine.service.js");
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    await undoBankLineOnClient(client, {
      operatingCompanyId: input.operating_company_id,
      bankTransactionId: input.bank_transaction_id,
      actorUserId: input.actor_user_uuid,
      reason: "bank_transaction_unmatched",
    });
    return { ok: true };
  });
}

export async function closeReconPeriod(input: {
  operating_company_id: string;
  account_id: string;
  period_end: string;
  actor_user_uuid: string;
}) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const coverage = await client.query<{ total_count: number; covered_count: number }>(
      `
        WITH period_tx AS (
          SELECT id
          FROM banking.bank_transactions
          WHERE operating_company_id = $1::uuid
            AND bank_account_id = $2::uuid
            AND transaction_date <= $3::date
            AND voided_at IS NULL
        )
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM banking.reconciliation_matches rm
              WHERE rm.bank_transaction_id = period_tx.id
                AND rm.operating_company_id = $1::uuid
                AND ${confirmedStateWhere()}
            )
          )::int AS covered_count
        FROM period_tx
      `,
      [input.operating_company_id, input.account_id, input.period_end]
    );
    const total = Number(coverage.rows[0]?.total_count ?? 0);
    const covered = Number(coverage.rows[0]?.covered_count ?? 0);
    if (total > 0 && covered < total) {
      throw new Error("period_not_100pct_reconciled");
    }

    const lockRes = await client.query<{ closed_through: string | null }>(
      `
        SELECT accounting.closed_period_cutoff($1::uuid)::text AS closed_through
      `,
      [input.operating_company_id]
    );

    return {
      ok: true,
      covered_transactions: covered,
      total_transactions: total,
      closed_period_cutoff: lockRes.rows[0]?.closed_through ?? null,
    };
  });
}