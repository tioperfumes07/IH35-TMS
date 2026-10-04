import { assertNoHistoricalJournalCoverage } from "../driver-finance/settlement-historical-attribution.service.js";
// VOID-EVERYWHERE PR-1 — shared void engine (gated behind VOID_ENFORCEMENT_ENABLED, default OFF).
//
// When the flag is ON, voiding an invoice or journal entry posts an equal-and-opposite REVERSING
// journal entry and marks the original VOIDED (with reason + actor + audit). The reversing entry is
// dated per the QuickBooks-grounded rule:
//   - original txn's accounting period OPEN  -> reverse at the original date.
//   - original period CLOSED                 -> reverse in the CURRENT open period (never rewrite a
//                                               closed period; respects the closed-period write-lock).
// VOID = Owner + Accountant only. DELETE = Owner only.
//
// The reversal + the status flip run on the SAME transaction client passed in by the caller, so they
// are atomic. This module does not open its own transaction and does not modify the posting engine.

import { releaseBankLineMatchesWhere } from "../banking/bank-line-release.js";
import { insertPostingLineWithSpineIfNew } from "./posting-line-writer.js";
import { boundJeMemo } from "./je-memo.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
// ACCT-LINK-01 regression fix (GO-1405 Recipe B, 2026-08-29): this void-reversal insert never
// populated journal_entry_type_id -- one of several direct posters contributing to the live
// 46/2214 (2%) density gap. Leaf module (no accounting-service imports) to avoid a cycle with
// journal-entries.service.ts, which already imports FROM this file.
import { hasJournalEntryTypeColumn, resolveJournalEntryTypeId } from "./journal-entry-type-resolver.js";

export const VOID_FLAG_KEY = "VOID_ENFORCEMENT_ENABLED";

// 'expense' reuses the SAME source-linked reversal path as bill/invoice: the expense poster writes GL
// to journal_entry_postings with source_transaction_type='expense' inside a posting batch, so
// readOriginalGlPostings flips those lines with NO new GL math. Lets WO void/cancel reverse a linked
// posted expense on the caller's transaction (atomic) instead of orphaning it.
//
// VOID-EVERYWHERE PR-3 — 'bill_payment' and 'customer_payment' reuse the identical generic
// source-linked path (readOriginalGlPostings' non-journal_entry branch matches ANY
// source_transaction_type recorded by the posting engine — no new query needed). Both types are
// already real source_transaction_type values written by settlement-bill-payment-posting.service.ts
// (bill_payment) and accounting/payments/apply.service.ts (customer_payment). Additive; NO new GL math.
/**
 * ACCT-F331 — `prepaid_purchase` added. accounting.prepaid_assets carries voided_at /
 * voided_by_user_id / void_reason and a 'voided' status value, but had NO void path anywhere in the
 * backend: an unvoidable money document whose A/P credit could never be reversed. The entityType is
 * passed straight through as source_transaction_type by readOriginalGlPostings, so the canonical
 * reverser handles it with no new GL math.
 */
export type VoidableEntityType =
  | "invoice"
  | "journal_entry"
  | "bill"
  | "expense"
  | "bill_payment"
  | "customer_payment"
  | "prepaid_purchase"
  // ACCT-F5640 — 'prepaid_amortization' added. amortization-posting.service.ts posts each amortization
  // period's own JE with source_transaction_type='prepaid_amortization' (a DIFFERENT source type than
  // the original purchase's 'prepaid_purchase'), so voiding a prepaid asset that already had ≥1
  // amortization period posted only ever reversed the original capitalization entry and silently left
  // the already-posted amortization JEs standing — the Prepaid Asset control account landed at a
  // permanent negative balance equal to the amortized-to-date amount, with no repair path (once
  // status='voided', postPrepaidAmortization itself refuses to run). This member lets
  // prepaid-expenses.routes.ts's void route call postVoidReversal a second time to reverse the
  // cumulative amortization-to-date, with NO new GL math — readOriginalGlPostings' generic
  // source_transaction_type/id predicate already handles it.
  | "prepaid_amortization"
  // ROUND 125/126 (Lead) — 'fuel_event' and 'driver_reimbursement' added. Both already post with a
  // real source_transaction_type/source_transaction_id on their journal_entry_postings rows (live-
  // verified: 'fuel_event' -> fuel.fuel_transactions.id, 'driver_reimbursement' ->
  // driver_finance.driver_reimbursements.id) and both have a real document row with void columns
  // (fuel_transactions/driver_reimbursements are 2 of the 7 VoidDocumentFamily members,
  // void-document-stamp.service.ts) — engine #1 (postVoidReversal) used exactly as designed for any
  // typed entity, NOT a 7th engine. This also gets fuel its BANK-ORPHAN-01 match release for free:
  // unmatchBankTransactionsForVoid's FORWARD check (linked_entity_id = entityId) is unconditional on
  // entityType (same as 'expense', which also has no BANK_MATCH_REVERSE_TABLE entry) — calling
  // postVoidReversal with entityId = the fuel_transaction's OWN id (not the JE's id) is what makes
  // the release fire; the bare-JE-id path (reverseJournalEntryNoFlip on the JE alone) does NOT, since
  // it calls postVoidReversal with entityType:'journal_entry', entityId:<je id>, which never matches
  // banking.bank_transactions.linked_entity_id = <fuel_transaction id>. Verified by reading
  // unmatchBankTransactionsForVoid + postVoidReversal + readOriginalGlPostings directly, not assumed.
  | "fuel_event"
  | "driver_reimbursement"
  // BANK-F-FACTORING-VOID-NO-REVERSAL (2026-09-30, CC-2) — 'factoring_advance' added. Already
  // supported at RUNTIME (readOriginalGlPostings' generic source_transaction_type/id predicate
  // handles any string; AUTH-165 this same session called postVoidReversal with this exact
  // entityType via a dynamic import + as-any-cast ops script and it correctly found/reversed 4
  // live duplicate factoring postings) but absent from this TYPE, so any strictly-typed caller
  // (e.g. governance/void-cancel-executors.ts's executeFactoringAdvance) could not call it without
  // a cast. Adding it here closes that gap for good — the type now matches what the function has
  // always actually done.
  | "factoring_advance";

type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type GlPostingRow = {
  /** ROUND 86 (Lead, 2026-09-23) -- the original posting line's own id, needed to link the
   *  reversal at the LINE level (reversal_of_line_id / reversed_by_line_id), the same way
   *  posting-engine.service.ts's own reversal path already does. Previously absent from this
   *  type entirely, so postVoidReversal (used by invoice/bill/payment/journal-entry/loan-payment
   *  voids -- six callers) could never write those columns, no matter how balanced/atomic its
   *  JE-level reversal was: a "stranded posting" — the original line's own reversed_by_line_id
   *  stays NULL forever, even though its JE is correctly marked reversed_by_je_id. Any consumer
   *  checking line-level liveness (the same five-column predicate this session's own E8 guard
   *  uses) reads it as still live. */
  id: string;
  account_id: string;
  class_id: string | null;
  entity_uuid: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string | null;
  line_sequence: number;
};

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested) — this is the logic GUARD verifies vs QuickBooks.
// ---------------------------------------------------------------------------

/** VOID = Owner + Accountant only (Administrator excluded, per Jorge 2026-06-14). */
export function canVoid(role: string | null | undefined): boolean {
  return role === "Owner" || role === "Accountant";
}

/** DELETE = Owner only. */
export function canDelete(role: string | null | undefined): boolean {
  return role === "Owner";
}

/**
 * Grounded reversal-date rule. `closedThrough` is accounting.closed_period_cutoff (MAX closed period_end),
 * or null if nothing is closed. All dates are ISO `YYYY-MM-DD` strings (lexical compare == date compare).
 *   - original period open (originalDate > closedThrough, or nothing closed) -> reverse at originalDate.
 *   - original period closed (originalDate <= closedThrough)                 -> reverse at currentDate.
 */
export function resolveReversalDate(
  originalDate: string,
  closedThrough: string | null,
  currentDate: string
): string {
  if (closedThrough && originalDate <= closedThrough) return currentDate;
  return originalDate;
}

/** True when the reversal lands in a different (current) period than the original — i.e. closed-period void. */
export function isClosedPeriodReversal(originalDate: string, reversalDate: string): boolean {
  return reversalDate !== originalDate;
}

/** Flip every posting to the opposite side, preserving account/class/entity/amount. Balanced original -> balanced reversal.
 *  ROUND 86 -- carries `original_line_id` through (the row it flipped) so the caller can link the
 *  new reversal line back to it (reversal_of_line_id / reversed_by_line_id), never dropping it
 *  silently the way this function did before. */
export function flipPostingsForReversal(
  rows: GlPostingRow[]
): Array<Omit<GlPostingRow, "line_sequence" | "id"> & { original_line_id: string }> {
  return rows.map((row) => ({
    original_line_id: row.id,
    account_id: row.account_id,
    class_id: row.class_id,
    entity_uuid: row.entity_uuid,
    debit_or_credit: row.debit_or_credit === "debit" ? "credit" : "debit",
    amount_cents: row.amount_cents,
    description: row.description ? `Void reversal: ${row.description}` : "Void reversal",
  }));
}

/** Balance-or-fail: total debits must equal total credits and be > 0. Mirrors createJournalEntry's guard. */
export function assertBalanced(rows: Array<{ debit_or_credit: "debit" | "credit"; amount_cents: number }>): void {
  const debits = rows.filter((r) => r.debit_or_credit === "debit").reduce((s, r) => s + Number(r.amount_cents || 0), 0);
  const credits = rows.filter((r) => r.debit_or_credit === "credit").reduce((s, r) => s + Number(r.amount_cents || 0), 0);
  if (debits <= 0 || credits <= 0) throw new Error("void_reversal_requires_debit_and_credit");
  if (debits !== credits) throw new Error("void_reversal_not_balanced");
}

/** Today's date as ISO YYYY-MM-DD (the "current open period" anchor for closed-period reversals). */
export function todayIso(): string {
  return companyBusinessDate();
}

/**
 * ACCT-F5026 / LV-BILLVOID class — coerce a pg DATE/timestamp column into ISO `YYYY-MM-DD`.
 *
 * node-postgres returns DATE as a JS `Date`. `String(date).slice(0, 10)` yields `"Thu Aug 06"` and
 * that string reaches `$2::date` as a literal → Postgres `invalid input syntax for type date`.
 * Prefer selecting `col::text` at the SQL boundary; this helper is the fail-closed fallback when a
 * caller still has a Date/string mix (payment void, prepaid, invoice send).
 */
export function pgDateColumnToIsoDay(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  throw Object.assign(new Error(`void_original_date_unreadable: ${raw.slice(0, 40)}`), {
    code: "void_original_date_unreadable",
  });
}

/** Fail closed before any ::date bind — never hand Postgres `"Thu Aug 06"`. */
export function assertIsoDay(originalDate: string, label = "originalDate"): string {
  const day = String(originalDate ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw Object.assign(new Error(`void_original_date_unreadable: ${label}=${day.slice(0, 40)}`), {
      code: "void_original_date_unreadable",
    });
  }
  return day;
}

// ---------------------------------------------------------------------------
// DB orchestration (runs on the caller's transaction client -> atomic).
// ---------------------------------------------------------------------------

/** Is the void engine enabled for this company/user? */
export async function isVoidEnforcementEnabled(
  client: QueryableClient,
  operatingCompanyId: string,
  userUuid: string
): Promise<boolean> {
  return isEnabled(client, VOID_FLAG_KEY, {
    operating_company_id: operatingCompanyId,
    user_uuid: userUuid,
  });
}

async function closedPeriodCutoff(client: QueryableClient, operatingCompanyId: string): Promise<string | null> {
  const res = await client.query<{ cutoff: string | null }>(
    `SELECT accounting.closed_period_cutoff($1::uuid)::text AS cutoff`,
    [operatingCompanyId]
  );
  return res.rows[0]?.cutoff ?? null;
}

/**
 * REINSTATE-VOIDJE-REVERSAL-SEVERS-SOURCE-LINKAGE (2026-09-30, Lead ruling) — resolve the TRUE
 * source document a reversal should be tagged with, instead of blindly tagging it with whatever
 * (entityType, entityId) the caller passed in.
 *
 * Every reversal line is tagged with (params.entityType, params.entityId) below, by design (see
 * that comment) — correct for a direct void of a typed document (invoice/bill/expense/factoring_
 * advance/etc). But `reverseJournalEntryNoFlip` (the reinstate-restore path, `voidJournalEntry`'s
 * Option-1 implementation) always calls this with entityType:'journal_entry' and entityId:<the JE
 * being reversed>, EVEN WHEN that JE is itself a reversal that already correctly carries the real
 * source document's own type/id on its own posting lines (tagged by THIS same rule, one call
 * earlier). Left unresolved, a reversal-of-a-reversal gets tagged 'journal_entry'/<the first
 * reversal's own id> — severing the chain from the real document. Live-confirmed on FAC-2026-00140
 * (a factoring_advance reinstate) and independently on a real pre-existing case (expense
 * 9b5fcc6c-6d8c-4e14-83ab-49c79c9132e9, AUTH-117/118, 2026-09-28): any standard "find live postings
 * for document X" query (verify-no-voided-doc-has-live-postings.mjs, readOriginalGlPostings below,
 * several guards shipped the same day) returns a false negative for a reinstated-then-still-live
 * document, even though the money is real and correct.
 *
 * FIX (Lead's explicit preference: carry the source document, don't make every predicate walk the
 * chain): when entityType is 'journal_entry', look at the JE's OWN posting lines for a real,
 * already-resolved source_transaction_type (one that is itself not 'journal_entry' and not null) —
 * the same "ONE representative posting per JE" pattern this file's JE_SOURCE_TRANSACTION_TYPE_SQL
 * (journal-entries.service.ts) already uses for the LIST PAGE's own source-link display. If found,
 * every future reversal in the chain inherits the TRUE origin directly, no matter how many hops
 * deep — a single JOIN answers "does document X have live postings," never a chain walk. A
 * genuinely hand-keyed JE with no typed source (no posting carries a non-null, non-'journal_entry'
 * source_transaction_type) falls back to 'journal_entry'/entityId exactly as before — unchanged,
 * correct for that case.
 */
async function resolveTrueReversalSource(
  client: QueryableClient,
  operatingCompanyId: string,
  entityType: VoidableEntityType,
  entityId: string
): Promise<{ trueType: VoidableEntityType | string; trueId: string }> {
  if (entityType !== "journal_entry") return { trueType: entityType, trueId: entityId };
  const res = await client.query<{ source_transaction_type: string | null; source_transaction_id: string | null }>(
    `
      SELECT source_transaction_type, source_transaction_id
        FROM accounting.journal_entry_postings
       WHERE operating_company_id = $1::uuid
         AND journal_entry_uuid = $2::uuid
         AND source_transaction_type IS NOT NULL
         AND source_transaction_type <> 'journal_entry'
         AND source_transaction_id IS NOT NULL
       LIMIT 1
    `,
    [operatingCompanyId, entityId]
  );
  const found = res.rows[0];
  if (found?.source_transaction_type && found.source_transaction_id) {
    return { trueType: found.source_transaction_type, trueId: found.source_transaction_id };
  }
  return { trueType: entityType, trueId: entityId };
}

/** Read the original posted GL lines for the entity being voided. */
async function readOriginalGlPostings(
  client: QueryableClient,
  operatingCompanyId: string,
  entityType: VoidableEntityType,
  entityId: string,
  /** ACCT-F397 — only the reinstate-restore path may reverse a JE that is itself a reversal. */
  allowReversalOfReversal = false
): Promise<GlPostingRow[]> {
  if (entityType === "journal_entry") {
    // ACCT-F397 — THE SAME P0 THE SOURCE-LINKED BRANCH BELOW ALREADY CLOSED, STILL OPEN HERE.
    //
    // The 2026-09-23 fix added the canonical 4-column liveness predicate
    // (status='posted' AND voided_at IS NULL AND reversed_by_je_id IS NULL AND reverses_je_id IS NULL)
    // to the source-linked branch, so an already-dead JE's postings can never be pulled back into a
    // later reversal. This branch -- entityType 'journal_entry', i.e. voiding a JE directly -- got
    // NONE of it: it selected every posting on the header unconditionally. So voiding a JE that was
    // itself a reversal reversed it again (credit -> debit -> CREDIT AGAIN), and voiding an
    // already-reversed JE reversed it twice.
    //
    // MEASURED LIVE ON USMCA (bypass_rls, read-only), the day this was written:
    //   61  journal_entries reverse an entry that is ITSELF a reversal
    //       (a.reverses_je_id -> b WHERE b.reverses_je_id IS NOT NULL)
    //   122 posting lines reverse a line that was itself a reversal
    //       (x.reversal_of_line_id -> y WHERE y.reversal_of_line_id IS NOT NULL)
    //   $5,955.26 across those 122 lines -- $2,977.63 per side.
    // That is the A/P 2000 contamination: 60 credit-only journal_entry lines carrying $2,976.63
    // whose memos read "Void reversal: REVERSAL: Expense EXP-...". Not a projection. The ledger
    // still balances (debits = credits = $2,181,835.64) because a double reversal is balanced --
    // which is exactly why it was invisible to a trial-balance check and had to be found on the FK
    // chain.
    //
    // WHY THIS FAILS CLOSED INSTEAD OF FILTERING. The source-linked branch can safely filter,
    // because it fans out over many JE headers and dropping a dead one still leaves the live ones.
    // Here there is exactly ONE target. Filtering it away would return zero rows, and
    // postVoidReversal treats zero rows as "nothing to reverse" and returns SUCCESS with
    // reversal_journal_entry_id: null -- a silent no-op reported as a completed void on a money
    // surface. That is a fake green. It throws, and the error names which condition failed.
    //
    // Reversal-of-a-reversal IS legitimate on exactly one path: reinstate-restore (see
    // resolveTrueReversalSource). That caller declares the intent with
    // allowReversalOfReversal: true; nothing else may.
    const live = await client.query<{
      status: string | null;
      voided: boolean;
      already_reversed: boolean;
      is_itself_a_reversal: boolean;
    }>(
      `
        SELECT je.status,
               (je.voided_at IS NOT NULL) AS voided,
               (je.reversed_by_je_id IS NOT NULL) AS already_reversed,
               (je.reverses_je_id IS NOT NULL) AS is_itself_a_reversal
        FROM accounting.journal_entries je
        WHERE je.operating_company_id = $1::uuid AND je.id = $2::uuid
      `,
      [operatingCompanyId, entityId]
    );
    const je = live.rows[0];
    if (!je) throw new Error(`void_reversal_journal_entry_not_found: ${entityId}`);
    if (je.status !== "posted") throw new Error(`void_reversal_je_not_posted: ${entityId} status=${je.status ?? "null"}`);
    if (je.voided) throw new Error(`void_reversal_je_already_voided: ${entityId}`);
    if (je.already_reversed) throw new Error(`void_reversal_je_already_reversed: ${entityId}`);
    if (je.is_itself_a_reversal && !allowReversalOfReversal) {
      throw new Error(`void_reversal_je_is_itself_a_reversal: ${entityId}`);
    }

    const res = await client.query<GlPostingRow>(
      `
        SELECT id::text, account_id::text, class_id::text, entity_uuid::text,
               debit_or_credit, amount_cents::bigint AS amount_cents, description, line_sequence
        FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid AND journal_entry_uuid = $2::uuid
        ORDER BY line_sequence ASC
      `,
      [operatingCompanyId, entityId]
    );
    return res.rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
  }
  // invoice / bill / …: at least one posting carries source_transaction_type/id. Live VOID-10
  // (L-20260830-0020 invoice 35ce61d1…): the A/R debit was tagged `invoice` but the income credit
  // on the SAME journal_entry_uuid was untagged — source-only SELECT returned one side, flip
  // failed assertBalanced with void_reversal_requires_debit_and_credit, and the UI Void button
  // could not complete. ACCT-F10181: expand to EVERY posting on those JE headers (same opco).
  // ACCT-F331: do NOT require posting_batch_id (sub-ledger posters use idempotency_key).
  //
  // P0 FIX (Lead-directed, live production corruption found and confirmed 2026-09-23): the inner
  // subquery used to select EVERY journal_entry_uuid carrying a posting tagged this
  // source_transaction_type/id, with no filter for "already reversed." A document whose
  // (source_transaction_type, source_transaction_id) pair is shared by MORE THAN ONE original JE
  // (measured live: 464/624 USMCA fuel.fuel_transactions have 2-4 distinct original JEs each,
  // NOT a rare edge case) and had already had SOME of those JEs reversed by an earlier call would
  // have every one of THOSE already-reversed JEs' postings pulled back in and reversed A SECOND
  // TIME by the next call — a real, confirmed, non-zero net GL misstatement, not a projection:
  // live-verified on production, 130 of 222 already-voided fuel_transactions carry a non-zero net
  // balance across their combined original+reversal postings, $72,676.56 total absolute
  // misstatement. Fixed by filtering the inner subquery to only the JE headers that are THEMSELVES
  // still live (the same 4-column liveness predicate this codebase already uses everywhere else --
  // e.g. e10-void-runner-01-usmca.ts's own candidate queries, loadHasLiveLinkedJes) -- an
  // already-reversed JE's postings are never pulled back into a later reversal again. The
  // ACCT-F10181 "expand to every posting on the JE header" behavior is preserved exactly for any
  // JE that IS still live; only already-dead JEs are now excluded.
  const res = await client.query<GlPostingRow>(
    `
      SELECT id::text, account_id::text, class_id::text, entity_uuid::text,
             debit_or_credit, amount_cents::bigint AS amount_cents, description, line_sequence
      FROM accounting.journal_entry_postings
      WHERE operating_company_id = $1::uuid
        AND journal_entry_uuid IN (
          SELECT DISTINCT jep.journal_entry_uuid
          FROM accounting.journal_entry_postings jep
          JOIN accounting.journal_entries je
            ON je.id = jep.journal_entry_uuid AND je.operating_company_id = jep.operating_company_id
          WHERE jep.operating_company_id = $1::uuid
            AND jep.source_transaction_type = $3
            AND jep.source_transaction_id = $2
            AND je.status = 'posted'
            AND je.voided_at IS NULL
            AND je.reversed_by_je_id IS NULL
            AND je.reverses_je_id IS NULL
        )
      ORDER BY line_sequence ASC
    `,
    [operatingCompanyId, entityId, entityType]
  );
  return res.rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
}

/**
 * ACCT-F211 — is the entry being reversed SAMPLE money?
 *
 * A reversal must carry the same sample flag as the entry it reverses, or the books contradict
 * themselves: the original is excluded from a real-money report while its reversal is included, so the
 * reversal shows up as a standalone real entry with no matching original — unexplained money in the GL,
 * created by the act of cleaning up test data.
 *
 * Derived from the ORIGINAL entry, never guessed and never string-matched. Both branches mirror
 * readOriginalGlPostings exactly: a journal_entry reverses itself; every other type resolves through
 * the postings the posting engine linked to it.
 *
 * ANY source entry being sample makes the reversal sample. A reversal spanning a sample and a real
 * entry is not a situation this codebase can create — one voided document has one origin — and if it
 * ever arises, marking the reversal sample is the safe direction: it keeps test money out of the real
 * books rather than letting it in.
 */
async function readOriginalIsSampleData(
  client: QueryableClient,
  operatingCompanyId: string,
  entityType: VoidableEntityType,
  entityId: string
): Promise<boolean> {
  if (entityType === "journal_entry") {
    const res = await client.query<{ is_sample_data: boolean }>(
      `
        SELECT COALESCE(is_sample_data, false) AS is_sample_data
        FROM accounting.journal_entries
        WHERE operating_company_id = $1::uuid AND id = $2::uuid
        LIMIT 1
      `,
      [operatingCompanyId, entityId]
    );
    return res.rows[0]?.is_sample_data === true;
  }
  const res = await client.query<{ any_sample: boolean }>(
    `
      SELECT bool_or(COALESCE(je.is_sample_data, false)) AS any_sample
      FROM accounting.journal_entry_postings p
      JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
       AND je.operating_company_id = p.operating_company_id
      WHERE p.operating_company_id = $1::uuid
        AND p.source_transaction_type = $3
        AND p.source_transaction_id = $2
        AND p.posting_batch_id IS NOT NULL
    `,
    [operatingCompanyId, entityId, entityType]
  );
  return res.rows[0]?.any_sample === true;
}

export type VoidReversalResult = {
  reversal_journal_entry_id: string | null;
  reversal_date: string | null;
  closed_period_reversal: boolean;
  reversed_line_count: number;
};

// ---------------------------------------------------------------------------
// BANK-ORPHAN-01 — un-match on void (owner ruling, 2026-08-31).
//
// "Voiding a transaction MUST automatically un-categorize / un-match its bank transaction and
// return it to the review worklist. QuickBooks behavior and the correct one: the match is a
// property of the transaction, so it dies with it." Live proof it was broken: 4
// banking.bank_transactions stayed status='categorized' while the accounting.payments rows they
// point to were voided (8b944104…$1,200.00, 2bdef3a9…$1,000.00, 8521d332…$1,000.00,
// 5404b1cb…$2,500.00) — same orphan shape as VOID-REVERSAL-SOURCE-TAG, one level down the chain.
//
// Two independent, NON-implying pointer shapes exist and both must be checked:
//   REVERSE — <entity table>.source_bank_transaction_id -> banking.bank_transactions.id
//             (accounting.payments, accounting.bill_payments, accounting.bills). This is the ONLY
//             link the 4 live orphans above carried — their bank_transactions row had
//             linked_entity_id = NULL, so a forward-only search would have missed every one.
//   FORWARD — banking.bank_transactions.linked_entity_id -> <entity>.id (the categorize-as-expense
//             / categorize-as-bill flows; accounting.expenses has NO reverse column at all, so
//             FORWARD is its ONLY link for that type).
// Reset targets EITHER shape in one statement; a bank_transactions row with neither pointer set is
// a no-op (0 rows, no error) — most voided entities were never bank-matched at all.
const BANK_MATCH_REVERSE_TABLE: Partial<Record<VoidableEntityType, string>> = {
  bill: "accounting.bills",
  bill_payment: "accounting.bill_payments",
  customer_payment: "accounting.payments",
};

// ROUND 373 / 368.2(b) — the bank line's OWN pointer to the document being voided. The cascade used to find lines only by
// linked_entity_id or the document's source_bank_transaction_id, so a line MATCHED to an expense / fill / invoice / JE /
// factoring advance (matched_*_id) kept naming a voided document — the "matched to nothing" state. Fixed column names
// from a closed map, never input.
const BANK_LINE_MATCHED_COLUMN: Partial<Record<VoidableEntityType, string>> = {
  invoice: "matched_invoice_id",
  journal_entry: "matched_journal_entry_id",
  bill: "matched_bill_id",
  expense: "matched_expense_id",
  bill_payment: "matched_bill_payment_id",
  customer_payment: "matched_payment_id",
  fuel_event: "matched_fuel_transaction_id",
  factoring_advance: "matched_factoring_advance_id",
};

// LINKAGE-INTEGRITY-LAW (board, owner paste 2026-09-01) — this reset used to clear ONLY the
// categorize-as-X link fields (linked_entity_id/category*), never the SEPARATE reconciliation-session
// pointer family (matched_load_id/matched_bill_id/matched_settlement_id/matched_expense_id/
// matched_transfer_id/matched_payment_id/matched_bill_payment_id) reconciliation.routes.ts's own
// /match route writes. A bill matched via a reconciliation session, then voided, kept a stale
// matched_bill_id forever — the exact "one-sided pointer that dies with the entity" gap the law
// names, one level deeper than the original BANK-ORPHAN-01 categorization-only fix. Extended here so
// void releases EVERY match family on the bank-transaction side, not just one of two.
//
// Mirrors banking.routes.ts's undo-categorization reset exactly (same columns, same target status)
// EXCEPT it does not touch/require reversing matched_journal_entry_id's own JE: the entity being
// voided already had ITS journal entry reversed by postVoidReversal above (or by the caller, for a
// direct GL void) before this runs, so clearing the pointer here cannot orphan a live, unreversed
// JE — it only clears a categorization/link field on the bank-transaction side.
//
// ACC-20 (owner-defect register 2026-09-03, "no automatic un-categorize in either direction when a
// match is reversed"): this reset used to leave `review_state` completely untouched — every
// matched_*_id/categorization_* field cleared and status flipped to 'pending_categorization', but a
// row whose review_state was 'matched' (or 'categorized') stayed exactly that, forever. Two real
// consumers read review_state as authoritative, not status: match.service.ts's confirm-match
// idempotency guard (`if (txn.review_state === "matched") throw`) would permanently refuse to
// re-match a transaction this exact reset just released, and reconciliation.routes.ts's own manual
// /unmatch route (the ONLY other place a match is released) already resets review_state = 'for_review'
// for the identical "match reversed" concept — this was the one inconsistent path. Bringing it in
// line: 'for_review' is the correct "back in the queue" state (session-scoped comment above already
// established this same fact for the sibling route); 'unmatched' is not a legal review_state per the
// CHECK constraint.
const BANK_TX_UNMATCH_RESET_SQL = `
  UPDATE banking.bank_transactions
     SET status = 'pending_categorization',
         review_state = 'for_review',
         matched_journal_entry_id = NULL,
         matched_load_id = NULL,
         matched_bill_id = NULL,
         matched_settlement_id = NULL,
         matched_expense_id = NULL,
         matched_transfer_id = NULL,
         matched_payment_id = NULL,
         matched_bill_payment_id = NULL,
         matched_factoring_advance_id = NULL,
         matched_fuel_transaction_id = NULL,
         matched_relay_fuel_transaction_id = NULL,
         matched_invoice_id = NULL,
         matched_advance_id = NULL,
         matched_deposit_id = NULL,
         linked_entity_id = NULL,
         category = NULL,
         category_kind = NULL,
         categorization_customer_id = NULL,
         categorization_vendor_id = NULL,
         categorization_gl_account_id = NULL,
         categorization_project_id = NULL,
         categorization_memo = NULL,
         categorization_driver_id = NULL,
         categorization_unit_id = NULL,
         categorization_load_id = NULL,
         -- BANK-ORPHAN-01 live-catch, 2026-09-01: categorization_recover_from_driver is
         -- NOT NULL DEFAULT false on prod (confirmed via information_schema, not assumed) --
         -- setting it to NULL threw "null value ... violates not-null constraint" the first
         -- time this reset actually ran against a row that had it set, which every prior
         -- selftest/guard pass missed because none of them execute real SQL against a live
         -- schema. Reset to its own default, not NULL.
         categorization_recover_from_driver = false,
         categorization_recover_deduction_type = NULL,
         categorization_deduction_id = NULL,
         categorization_item_id = NULL,
         categorization_trailer_id = NULL,
         categorization_class_id = NULL,
         categorization_location = NULL,
         suggested_match_invoice_id = NULL,
         suggested_match_bill_id = NULL,
         categorized_at = NULL,
         updated_at = now()
   WHERE operating_company_id = $1::uuid
`;

// ROUND 363-CC3-B — the release of every match a reset clears is recorded BEFORE the reset, through
// banking.release_bank_line_matches() (bank-line-release.ts). The trail this file used to write after the reset
// (recordVoidedMatches) read the matched_* ids from the UPDATE's RETURNING row — Postgres returns the NEW values, which
// the reset had just set to NULL — so it recorded nothing on every void.

/**
 * BANK-ORPHAN-01 shared primitive #1: reset ONE bank_transactions row (known by its own id) back to
 * the review worklist. Callers that already hold a bank_transaction_id directly (a column that is not
 * one of the four VoidableEntityType-linked tables below, e.g. driver_settlements.paid_via_bank_txn_id)
 * call this instead of duplicating the reset SQL.
 */
export async function unmatchBankTransactionById(
  client: QueryableClient,
  operatingCompanyId: string,
  bankTransactionId: string,
  actor?: { userId: string; reason: string }
): Promise<boolean> {
  await releaseBankLineMatchesWhere(client, `operating_company_id = $1::uuid AND id = $2::uuid`, [operatingCompanyId, bankTransactionId], {
    kind: "void",
    reason: actor?.reason ?? "unmatched via unmatchBankTransactionById",
    actorUserId: actor?.userId ?? null,
  });
  const res = await client.query<{ id: string }>(
    `${BANK_TX_UNMATCH_RESET_SQL} AND id = $2::uuid
     RETURNING id`,
    [operatingCompanyId, bankTransactionId]
  );
  return Boolean(res.rows[0]);
}

/**
 * BANK-ORPHAN-01 shared primitive #2: resolve + reset every bank_transactions row matched against a
 * VoidableEntityType entity (both pointer shapes above), in one statement. Called unconditionally from
 * postVoidReversal so every existing caller — direct void routes, the load-cancel cascade, the
 * governance void/cancel executors, the settlement reversal path — gets this for free, per the owner's
 * instruction: "Build it into the void cascade, not as a cleanup job."
 */
/**
 * ROUND 368.2(b) — every path that makes a document stop being live releases the bank lines that still NAME it
 * through a matched_* pointer, in the same transaction, before the 26 document-side refusals
 * (202615360600, disarmed by 202615360700 until this held) can see a dead link. The release is recorded first
 * (banking.release_bank_line_matches — LAW 363.9, the match is kept), then the line goes back to For review with the
 * shared reset. The column is checked against the closed list of the 13 pointers, never interpolated from input.
 */
const RELEASABLE_POINTER_COLUMNS = new Set([
  "matched_load_id", "matched_bill_id", "matched_settlement_id", "matched_expense_id", "matched_transfer_id",
  "matched_payment_id", "matched_bill_payment_id", "matched_journal_entry_id", "matched_factoring_advance_id",
  "matched_invoice_id", "matched_fuel_transaction_id", "matched_relay_fuel_transaction_id", "matched_advance_id",
]);
export async function releaseBankLinesNamingDocument(
  client: QueryableClient,
  params: { operatingCompanyId: string; pointerColumn: string; documentId: string },
  actor: { userId: string | null; reason: string }
): Promise<number> {
  if (!RELEASABLE_POINTER_COLUMNS.has(params.pointerColumn)) throw new Error(`not_a_bank_line_pointer: ${params.pointerColumn}`);
  const where = `operating_company_id = $1::uuid AND voided_at IS NULL AND ${params.pointerColumn} = $2::uuid`;
  await releaseBankLineMatchesWhere(client, where, [params.operatingCompanyId, params.documentId], {
    kind: "void",
    reason: actor.reason,
    actorUserId: actor.userId,
  });
  const res = await client.query<{ id: string }>(
    `${BANK_TX_UNMATCH_RESET_SQL} AND voided_at IS NULL AND ${params.pointerColumn} = $2::uuid RETURNING id`,
    [params.operatingCompanyId, params.documentId]
  );
  return res.rows.length;
}

export async function unmatchBankTransactionsForVoid(
  client: QueryableClient,
  params: { operatingCompanyId: string; entityType: VoidableEntityType; entityId: string },
  actor?: { userId: string }
): Promise<number> {
  const reverseTable = BANK_MATCH_REVERSE_TABLE[params.entityType];
  const reverseIdSql = reverseTable
    ? `(SELECT source_bank_transaction_id FROM ${reverseTable} WHERE id = $2::uuid AND operating_company_id = $1::uuid)`
    : `NULL::uuid`;
  const matchedCol = BANK_LINE_MATCHED_COLUMN[params.entityType];
  const byMatched = matchedCol ? ` OR ${matchedCol} = $2::uuid` : "";
  await releaseBankLineMatchesWhere(
    client,
    `operating_company_id = $1::uuid AND (linked_entity_id = $2::uuid OR id = ${reverseIdSql}${byMatched})`,
    [params.operatingCompanyId, params.entityId],
    { kind: "void", reason: `void: ${params.entityType} ${params.entityId}`, actorUserId: actor?.userId ?? null }
  );
  const res = await client.query<{ id: string }>(
    `${BANK_TX_UNMATCH_RESET_SQL}
       AND (linked_entity_id = $2::uuid OR id = ${reverseIdSql}${byMatched})
     RETURNING id`,
    [params.operatingCompanyId, params.entityId]
  );
  return res.rows.length;
}

/**
 * Post the reversing journal entry for a void on the SAME client (atomic with the caller's status flip).
 * Returns null reversal id when the entity had no posted GL lines (e.g. a draft invoice) — nothing to reverse.
 * A balanced standalone JE (source='auto', no source linkage) is inserted; the closed-period DB trigger is the
 * final safety net (reversalDate is always computed into an open period).
 */
export async function postVoidReversal(
  client: QueryableClient,
  params: {
    operatingCompanyId: string;
    entityType: VoidableEntityType;
    entityId: string;
    originalDate: string;
    memo: string;
    currentDate?: string;
    /**
     * ACCT-F397 — declare, explicitly, that this call is the reinstate-restore path and is
     * REVERSING A REVERSAL on purpose. Every other caller leaves this unset and gets a thrown
     * `void_reversal_je_is_itself_a_reversal` instead of a second, money-moving reversal.
     */
    allowReversalOfReversal?: boolean;
  },
  actor: { userId: string }
): Promise<VoidReversalResult> {
  // Lock the same original journals that readOriginalGlPostings reverses, before any bank
  // unmatch or posting. Historical attribution captures those journal locks too.
  const journals = await client.query<{ id: string }>(`SELECT je.id::text FROM accounting.journal_entries je
    WHERE je.operating_company_id = $1::uuid AND (
      ($3 = 'journal_entry' AND je.id::text = $2) OR
      ($3 <> 'journal_entry' AND je.id IN (SELECT p.journal_entry_uuid FROM accounting.journal_entry_postings p
        WHERE p.operating_company_id = $1::uuid AND p.source_transaction_type = $3 AND p.source_transaction_id = $2)))
    ORDER BY je.id FOR UPDATE`, [params.operatingCompanyId, params.entityId, params.entityType]);
  for (const journal of journals.rows) await assertNoHistoricalJournalCoverage(client, params.operatingCompanyId, journal.id);

  // BANK-ORPHAN-01 — runs before the "nothing to reverse" early return
  // below. A bank match is a property of the entity being voided, not of its GL postings — a draft
  // document with zero posted lines could still (in principle) carry a bank match, and the owner's
  // rule has no "only if something reversed" exception: "no voided document may leave a bank
  // transaction categorized against it."
  await unmatchBankTransactionsForVoid(client, {
    operatingCompanyId: params.operatingCompanyId,
    entityType: params.entityType,
    entityId: params.entityId,
  }, actor);

  const originalLines = await readOriginalGlPostings(
    client,
    params.operatingCompanyId,
    params.entityType,
    params.entityId,
    params.allowReversalOfReversal === true
  );
  if (originalLines.length === 0) {
    return { reversal_journal_entry_id: null, reversal_date: null, closed_period_reversal: false, reversed_line_count: 0 };
  }

  // REINSTATE-VOIDJE-REVERSAL-SEVERS-SOURCE-LINKAGE fix — tag the NEW reversal lines with the true
  // source document, not blindly with (entityType, entityId), so a reversal-of-a-reversal (the
  // reinstate-restore path) stays traceable back to the real document at every hop. See
  // resolveTrueReversalSource's own comment for the full incident this closes.
  const { trueType, trueId } = await resolveTrueReversalSource(
    client,
    params.operatingCompanyId,
    params.entityType,
    params.entityId
  );

  // ACCT-F211 — inherit the sample flag from the entry being reversed, before anything is written.
  const originalIsSample = await readOriginalIsSampleData(
    client,
    params.operatingCompanyId,
    params.entityType,
    params.entityId
  );

  // ACCT-F5026 — refuse non-ISO originalDate before any `$n::date` bind (LV-BILLVOID class).
  const originalDateIso = assertIsoDay(params.originalDate, `${params.entityType}.originalDate`);

  const cutoff = await closedPeriodCutoff(client, params.operatingCompanyId);
  const currentDate = params.currentDate ?? todayIso();
  const reversalDate = resolveReversalDate(originalDateIso, cutoff, currentDate);
  const closedPeriod = isClosedPeriodReversal(originalDateIso, reversalDate);

  const reversalLines = flipPostingsForReversal(originalLines);
  assertBalanced(reversalLines);

  // ACCT-LINK-01 regression fix: a reversal of a typed source (bill/invoice/etc.) inherits the same
  // catalog code -- more useful for reporting than a blanket GENERAL, same "never a guess dressed up
  // as a specific type" rule journal-entry-type-resolver.ts already applies elsewhere.
  const VOID_ENTITY_TYPE_TO_JE_TYPE_CODE: Partial<Record<VoidableEntityType, string>> = {
    invoice: "SALES_INVOICE",
    bill: "BILL",
    bill_payment: "BILL_PAYMENT",
    customer_payment: "PAYMENT_RECEIPT",
  };
  const typeColPresent = await hasJournalEntryTypeColumn(client);
  const typeId = typeColPresent
    ? await resolveJournalEntryTypeId(client, {
        journal_entry_type_code: VOID_ENTITY_TYPE_TO_JE_TYPE_CODE[params.entityType],
        source: "auto",
        memo: params.memo,
      })
    : null;

  const header = typeColPresent
    ? await client.query<{ id: string }>(
        `
      INSERT INTO accounting.journal_entries
        (operating_company_id, entry_date, memo, status, source, journal_entry_type_id, created_by_user_id, qbo_sync_pending,
         is_sample_data)
      VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, $5::uuid, true, $6)
      RETURNING id::text
    `,
        [params.operatingCompanyId, reversalDate, boundJeMemo(params.memo), typeId, actor.userId, originalIsSample]
      )
    : await client.query<{ id: string }>(
        `
      INSERT INTO accounting.journal_entries
        (operating_company_id, entry_date, memo, status, source, created_by_user_id, qbo_sync_pending,
         is_sample_data)
      VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, true, $5)
      RETURNING id::text
    `,
        [params.operatingCompanyId, reversalDate, boundJeMemo(params.memo), actor.userId, originalIsSample]
      );
  const reversalJeId = header.rows[0]!.id;

  let seq = 1;
  for (const line of reversalLines) {
    // ROUND 393.3 — the line and its spine row through the ONE writer (posting-line-writer.ts), in this transaction.
    // Every value is what this door wrote before:
    //   idempotency_key  BLOCK 2: `void:<type>:<id>` — a second void of the same entity is a no-op (uq_jep_company_idempotency_line);
    //   source           trueType/trueId (REINSTATE-VOIDJE-REVERSAL-SEVERS-SOURCE-LINKAGE: a reinstate hop stays tagged to the
    //                    true document, so a source-typed sum sees both legs and nets to zero — LV-BILLPAY-VOID-NO-REVERSAL);
    //   reversal_of_line_id  ROUND 86 line-level FK back to the original (its load is the original's load);
    //   spine            CODER-12: the voided entity, role 'reversal_of' — so a purge can tell a reversed document from an
    //                    unreversed one. A conflict no-op writes neither the line nor a link.
    const reversalPostingId = await insertPostingLineWithSpineIfNew(client as never, {
      operating_company_id: params.operatingCompanyId,
      journal_entry_uuid: reversalJeId,
      line_sequence: seq++,
      account_id: line.account_id,
      class_id: line.class_id,
      entity_uuid: line.entity_uuid,
      debit_or_credit: line.debit_or_credit,
      amount_cents: line.amount_cents,
      description: line.description,
      idempotency_key: `void:${params.entityType}:${params.entityId}`,
      source_transaction_type: trueType,
      source_transaction_id: trueId,
      reversal_of_line_id: line.original_line_id,
      relationship_role: "reversal_of",
      spine_link: { linked_object_type: params.entityType, linked_object_id: params.entityId },
    });
    if (reversalPostingId) {
      // ROUND 86 — the other half of the line-level link: point the ORIGINAL line forward at
      // this new reversal line. Without this, the original stays a "stranded posting" — its own
      // JE correctly shows reversed_by_je_id, but any reader keyed on the LINE-level column
      // (e.g. this session's own E8 guard's five-column liveness predicate) still sees it live.
      await client.query(
        `
          UPDATE accounting.journal_entry_postings
             SET reversed_by_line_id = $2::uuid,
                 updated_at = now()
           WHERE id = $1::uuid AND operating_company_id = $3::uuid
        `,
        [line.original_line_id, reversalPostingId, params.operatingCompanyId]
      );
    }
  }

  // CODER-12 audit-spine: write the immutable audit event for the reversal posting to
  // audit.audit_events (canonical, DB-trigger immutable per the blueprint) — atomic with the GL write
  // and guaranteed inside the poster (not caller-dependent). NOT events.log_event (its valid_subject_type
  // CHECK rejects accounting subjects -> would fail-loud + roll back the reversal). The per-line links
  // above carry the source->reversal traceability.
  await appendCrudAudit(
    client,
    actor.userId,
    "accounting.journal_entry.reversed",
    {
      reversal_journal_entry_id: reversalJeId,
      reversed_entity_type: params.entityType,
      reversed_entity_id: params.entityId,
      reversed_line_count: reversalLines.length,
    },
    "info",
    "CODER-12-VOID-SPINE"
  );

  // ACCT-F268 — write the JOURNAL-ENTRY-level reversal FK here, in the shared primitive.
  //
  // postVoidReversal has SIX callers (bills, invoices, payments, journal-entries, loan-payment,
  // void.service itself) and only journal-entries.service.ts wrote reverses_je_id / reversed_by_je_id
  // afterwards. Every other void therefore produced a reversal linked to its original ONLY by the memo
  // string `Reversal of …` — which is how JE 8fd32bec (a bill-payment void made that same day) ended up
  // discoverable only by parsing prose.
  //
  // Why the FK is load-bearing: `journal_entries WHERE voided_at IS NOT NULL` is 0 on prod. No JE is
  // ever voided in place — reversal-by-new-JE is the only mechanism WORM permits — so this FK is the
  // ONLY machine-readable link between a reversal and its original. ACCT-F256 fixed the posting-engine
  // path; this closes the other five by putting it in the one place they all pass through, rather than
  // asking six callers to remember (the ACCT-F265 lesson).
  //
  // LINKED ONLY WHEN UNAMBIGUOUS. A void reverses an ENTITY, and an entity may have been posted across
  // more than one journal entry; pointing a single FK at one of several would assert something false.
  // When the source resolves to exactly one JE we link both directions; otherwise the per-line
  // reversal_of_line_id / reversed_by_line_id links above remain the record, and nothing is invented.
  //
  // ACCT-F5723 (measured live, prod, USMCA, 2026-09-07): this lookup used to require
  // `p.posting_batch_id IS NOT NULL`, but readOriginalGlPostings() above — the function that actually
  // finds the lines this same call just flipped — was already fixed under ACCT-F331 to NOT require
  // posting_batch_id, because sub-ledger posters (e.g. the revenue-recognition two-event latch in
  // revrec-delivery-posting/poster.service.ts) tag their postings with source_transaction_type/id but
  // never populate posting_batch_id (they write directly, outside the posting-engine batch flow). The
  // two functions had drifted out of sync: readOriginalGlPostings found and flipped the latch's "bill"
  // JE correctly (net GL effect = $0, proven live), but THIS lookup's stricter filter matched zero rows,
  // so reversed_by_je_id/reverses_je_id were silently never written on the original latch JE.
  //
  // Consequence, proven live on load ebf7e233-b78e-48f3-bbec-2d5fdd887274 (invoice 13541 void-and-reissue,
  // owner rate correction $3,500 -> $2,500): standingLatchJePredicate (ACCT-F66, invoice-gl.service.ts)
  // keys ONLY on journal_entries.reversed_by_je_id IS NULL to decide whether a revrec latch is still
  // "standing". With the FK never written, the fully-reversed, net-zero old latch JE still read as
  // standing, so the ACCT-F205 interlock refused to let the corrected reissued invoice
  // (INV-2026-00002, $2,500) post its own A/R — the exact "reversed latch blocks recognition forever"
  // trap ACCT-F66's own header already documents for the read side (loadHasStandingBillLatch /
  // loadHasStandingInvoiceGl), now confirmed on the WRITE side of the same FK. Removing the
  // posting_batch_id filter here — the same fix already applied to readOriginalGlPostings — closes it at
  // the source instead of teaching every reader of reversed_by_je_id a second, inconsistent test.
  if (reversalJeId) {
    // ROUND 134.1 FIX (Lead, P0 -- called "bookkeeping-only" in ACCT-F2026092326's own report; it
    // is not): this used to run ONLY when exactly one other original JE shared this
    // (source_transaction_type, source_transaction_id) pair (`LIMIT 2` + `rows.length === 1`), so
    // it silently no-op'd on every multi-JE document -- the common case for fuel (464/624 USMCA
    // fuel_transactions have 2-4 distinct original JEs). Live proof this was already load-bearing,
    // not cosmetic: 1665 reversing JEs / 1665 distinct originals / 0 doubles found BY LINKAGE, while
    // the account-level net-balance scan (verify-no-double-reversed-fuel-postings.mjs) found 122
    // real corrupted rows the SAME linkage could not see -- remediation needed a net-balance scan
    // instead of a join specifically because this write never ran for them. `reversed_by_je_id` is
    // now written on EVERY original JE in the set, not only when the set size is 1, in the SAME
    // transaction as the reversal. `reverses_je_id` (a single-value column on the reversal JE
    // itself) can only ever name ONE original when several are reversed together -- it is set to
    // the first (lowest id) original for continuity with the existing single-original behavior;
    // the exhaustive, load-bearing signal for "is this original reversed" is `reversed_by_je_id` on
    // the ORIGINAL side, which this fix makes complete for every original, not just the lone one.
    // DISTINCT + ORDER BY must use the same expression (Postgres 42P10). Cast once in SELECT
    // and order by the alias — ORDER BY p.journal_entry_uuid (uuid) with ::text in SELECT fails.
    const src = await client.query<{ je_id: string }>(
      `
        SELECT DISTINCT p.journal_entry_uuid::text AS je_id
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je2 ON je2.id = p.journal_entry_uuid
        WHERE p.operating_company_id = $1::uuid
          AND p.source_transaction_type = $3
          AND p.source_transaction_id = $2
          AND p.journal_entry_uuid <> $4::uuid
          AND je2.status = 'posted' AND je2.voided_at IS NULL AND je2.reversed_by_je_id IS NULL
        ORDER BY 1 ASC
      `,
      [params.operatingCompanyId, params.entityId, params.entityType, reversalJeId]
    );
    if (src.rows.length > 0) {
      const firstOriginalJeId = String(src.rows[0]!.je_id);
      await client.query(
        `UPDATE accounting.journal_entries SET reverses_je_id = $2::uuid, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $3::uuid AND reverses_je_id IS NULL`,
        [reversalJeId, firstOriginalJeId, params.operatingCompanyId]
      );
      for (const row of src.rows) {
        // ROUND 368.2(b) — a bank line that names this original JE goes back to For review before the JE dies.
        await releaseBankLinesNamingDocument(client, { operatingCompanyId: params.operatingCompanyId, pointerColumn: "matched_journal_entry_id", documentId: String(row.je_id) }, {
          userId: actor.userId,
          reason: `journal entry ${String(row.je_id)} reversed by ${reversalJeId}`,
        });
        await client.query(
          `UPDATE accounting.journal_entries SET reversed_by_je_id = $2::uuid, updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $3::uuid AND reversed_by_je_id IS NULL`,
          [String(row.je_id), reversalJeId, params.operatingCompanyId]
        );
      }
    }
  }

  return {
    reversal_journal_entry_id: reversalJeId,
    reversal_date: reversalDate,
    closed_period_reversal: closedPeriod,
    reversed_line_count: reversalLines.length,
  };
}

/** Emit the audit-spine row for a void (reason + actor + reversal linkage). */
export async function auditVoid(
  client: QueryableClient,
  actorUserId: string,
  entityType: VoidableEntityType,
  params: {
    operatingCompanyId: string;
    entityId: string;
    reason: string;
    reversal: VoidReversalResult;
  }
): Promise<void> {
  const resourceTypeByEntity: Record<VoidableEntityType, string> = {
    invoice: "accounting.invoices",
    journal_entry: "accounting.journal_entries",
    bill: "accounting.bills",
    expense: "accounting.expenses",
    bill_payment: "accounting.bill_payments",
    customer_payment: "accounting.payments",
    // ACCT-F331 — the audit row must name the table an auditor would open, not the posting source type.
    prepaid_purchase: "accounting.prepaid_assets",
    // ACCT-F5640 — same table; the amortization-to-date reversal still targets the prepaid asset record.
    prepaid_amortization: "accounting.prepaid_assets",
    // ROUND 125/126 — the audit row names the real document table, same convention as every other member.
    fuel_event: "fuel.fuel_transactions",
    driver_reimbursement: "driver_finance.driver_reimbursements",
    factoring_advance: "accounting.factoring_advances",
  };
  const resourceType = resourceTypeByEntity[entityType];
  await appendCrudAudit(
    client,
    actorUserId,
    `${resourceType}.voided`,
    {
      resource_type: resourceType,
      resource_id: params.entityId,
      operating_company_id: params.operatingCompanyId,
      void_reason: params.reason,
      reversal_journal_entry_id: params.reversal.reversal_journal_entry_id,
      reversal_date: params.reversal.reversal_date,
      closed_period_reversal: params.reversal.closed_period_reversal,
      voided_by_user_id: actorUserId,
      engine: "VOID-EVERYWHERE-PR2",
    },
    "warning",
    "VOID-EVERYWHERE-PR2"
  );
}
