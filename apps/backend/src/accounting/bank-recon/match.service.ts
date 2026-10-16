import { withLuciaBypass } from "../../auth/db.js";
import { checkFactoringPurchaseOwner, FactoringPurchaseOwnerOnlyError } from "../../factoring/owner-only-purchase.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import {
  bankAccountHiddenFilterSql,
  bankTransactionHiddenFilterSql,
  isBankAccountHideEnabled,
} from "../../banking/bank-account-visibility.js";
import { insertPostingLineWithSpine } from "../posting-line-writer.js";
import { applyCashBasisSuppression, type CashBasisEntry } from "../cash-basis/engine.js";
import { backlinkBankTransactionToInvoice } from "../payments/bank-invoice-backlink.service.js";
import { backlinkBankTransactionToBill } from "../payments/bank-bill-backlink.service.js";
import { assertBankTxnNotInReconciledSession } from "../../banking/closed-session-immutability.js";
import { operatorVisibleMatchText } from "../../banking/operator-visible-match-text.js";
// ACCT-LINK-01 regression fix (GO-1405 Recipe B, 2026-08-29): this variance-JE insert never
// populated journal_entry_type_id -- one of several direct posters contributing to the live
// 46/2214 (2%) density gap. Leaf module, no accounting-service imports.
import { hasJournalEntryTypeColumn, resolveJournalEntryTypeId } from "../journal-entry-type-resolver.js";
// ACCT-PERIOD-CLOSE-01: this variance-JE insert had no closed-period check at all.
// GO-CLOSE-188 DEFECT A: matching a payment to its real bank_transaction is the ONLY place that learns
// "this collection really landed at this real bank account" — fire the deposit-sweep JE (Dr real bank /
// Cr the payment's original holding account) right here, reusing the shared idempotent/period-gated poster.
import { ensureOpenPeriod, postSourceTransactionInClientTx, PostingEngineError } from "../posting-engine.service.js";
import {
  loadExactLinkedChargebackAmountsOnClient,
  postFactoringChargebackEvent,
} from "../factoring-posting/poster.service.js";
import {
  SQL_BILL_IS_SETTLEMENT_BORN,
  SQL_BILL_PAYMENT_IS_CASH_SETTLEMENT_BORN,
} from "./settlement-born-candidates.js";
import { postFuelFillOnBankMatch } from "./bank-match-fuel-post.service.js";
import {
  isFaroReserveBankAccount,
  loadFaroReserveEntryForBankTxn,
  postFaroReserveRowOnBankMatch,
  postFaroRsvDepositsOnPaymentMatch,
} from "./bank-match-faro-reserve-post.service.js";
import {
  bankLineHasLiveDocumentPointer,
  bankLinePointerSelectSql,
} from "../../banking/bank-line-match-pointer.js";
import { RELAY_FUEL_WALLET_AMOUNT_SQL } from "./relay-bank-match.service.js";
import {
  RELAY_DEPOSIT_CHARGED_AMOUNT_SQL,
  RELAY_DEPOSIT_FEE_AMOUNT_SQL,
  RELAY_DEPOSIT_MATCHABLE_SQL,
  RELAY_DEPOSIT_WALLET_AMOUNT_SQL,
} from "./relay-deposit-match-math.js";
import { RELAY_USMCA_DATA_FLOOR } from "../../integrations/relay-payments/relay-usmca-date-floor.js";

/**
 * ROUND 157-C / 156 MASTER SPEC — THIS FILE OWNS THE BANKING MATCH SURFACE.
 * One engine: findCandidates / computeMatchScore / acceptMatchWithResolveDifference.
 * link-suggestion-engine.ts and obligation-reconcile.logic suggestionConfidence() do NOT
 * own this surface — they stay for their own routes. Guard: verify-one-match-engine-owns-this-surface.mjs
 *
 * Candidate universe = settlement-born only (see settlement-born-candidates.ts). BUILD NO TYPE FILTER.
 */

// 443.100: LedgerEntryKind lives in the type-only leaf ledger-entry-kind.type.ts so the one unmatch writer can name it
// without importing this engine (verify-no-circular-dependencies).
import type { LedgerEntryKind } from "./ledger-entry-kind.type.js";
export type { LedgerEntryKind };
export type MatchState = "auto_matched" | "user_matched" | "rejected";

// banking.reconciliation_matches.ledger_entry_kind has a CHECK constraint. Migration
// 202607011600_bank_recon_expense_match_part2a.sql widened it to permit 'expense' (BLOCK-01
// Part 2a: expense-link accept). Lead extended production CHECK 2026-09-28 for factoring_advance /
// fuel_transaction / invoice / driver_bill / settlement / load (ROUND 186 bulk-accept).
// ROUND 186 counterparties: relay_fuel + matched_fuel_transaction_id clear-column (202614520000).
// 'bill' remains NON-persistable: recording a bill payment with no GL JE is an orphan write —
// that's Part 2b (BLOCK-02 CHAIN-04), still gated.
export const PERSISTABLE_MATCH_KINDS: ReadonlySet<LedgerEntryKind> = new Set<LedgerEntryKind>([
  "payment",
  "bill_payment",
  "transfer",
  "je",
  "expense",
  "factoring_advance",
  "fuel_transaction",
  "relay_fuel",
  // ROUND 186 addendum — driver settlement net_pay ↔ BoA debit. Wider date window (10d) lives in
  // the bulk runner, not findCandidates (settlement-born candidate universe stays bill_payment/bill).
  "settlement",
  "deposit",
  "relay_deposit",
]);

// Denormalized convenience FK on banking.bank_transactions (migration 0182 + Part 2a's
// matched_expense_id) set to 'matched' on accept, so the Accounting Bills/Expenses lists and the
// worklist can show clear status without re-deriving from banking.reconciliation_matches.
// NOTE: matched_advance_id references driver_finance.driver_advances — NEVER reuse it for
// factoring_advance. ROUND 186 added matched_factoring_advance_id for that.
const MATCHED_COLUMN_BY_KIND: Partial<Record<LedgerEntryKind, string>> = {
  payment: "matched_payment_id",
  bill_payment: "matched_bill_payment_id",
  transfer: "matched_transfer_id",
  je: "matched_journal_entry_id",
  expense: "matched_expense_id",
  factoring_advance: "matched_factoring_advance_id",
  settlement: "matched_settlement_id",
  fuel_transaction: "matched_fuel_transaction_id",
  relay_fuel: "matched_relay_fuel_transaction_id",
  deposit: "matched_deposit_id",
  relay_deposit: "matched_relay_deposit_id",
};

// ROUND 141.4 — A kind that findCandidates can RETURN but that cannot be accepted
// (not in PERSISTABLE_MATCH_KINDS) must be explicitly declared here with a reason.
// This prevents the defect where 'bill' was queried as a candidate, rendered, was
// selectable, and accept threw match_kind_not_acceptable:bill — the owner would have
// walked into a wall. No third state: every returnable kind is EITHER persistable OR
// view-only-declared. Guard: scripts/verify-every-match-kind-is-acceptable-or-declared.mjs
export const VIEW_ONLY_MATCH_KINDS: Partial<Record<LedgerEntryKind, string>> = {
  // LEAD 443.155 (owner ruling 2026-09-30: the candidate universe is EVERY document the company creates) — an open A/R
  // invoice is shown on a money-in line so the owner sees what the deposit pays, but a match links an EXISTING record and
  // creates no journal entry (CHAIN-05 §10.2); an invoice is settled by its receive-payment, which is then the match.
  invoice: "Open A/R invoices are shown so the owner sees what the deposit pays; a match links an existing record and posts nothing, so the invoice is settled by recording its receive-payment, which is then matched. Accept throws match_kind_not_acceptable:invoice by design.",
  bill: "Open bills are shown as candidates so the user can see them, but accepting a bill payment with no GL JE is an orphan write — Part 2b (BLOCK-02 CHAIN-04), still gated. Accept throws match_kind_not_acceptable:bill by design.",
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type BankTxn = {
  id: string;
  bank_account_id: string;
  operating_company_id: string;
  transaction_date: string;
  amount_cents: number;
  is_credit: boolean;
  description: string | null;
  merchant_name: string | null;
  notes: string | null;
  review_state: string | null;
  status: string | null;
  transfer_kind: string | null;
} & Record<string, unknown>;

export type MatchCounterpartyKind = "vendor" | "customer" | null;

export type MatchCandidate = {
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_id: string;
  amount_cents: number;
  event_date: string;
  memo: string;
  /**
   * BANK-MATCH-QBO (owner 2026-09-06: "BY VENDOR, OR CUSTOMER … IT DOES NOT SHOW THE TYPE DESCRIPTION"):
   * the QuickBooks "Find match" columns — Payee (vendor / customer), Ref no. (our document number),
   * Description (the record's memo), Open balance (bills only — what is still owed on the document).
   * Null when the source has no such field (a transfer has no payee; only a bill has an open balance).
   */
  counterparty_kind: MatchCounterpartyKind;
  counterparty_id: string | null;
  counterparty_name: string | null;
  reference: string | null;
  description: string | null;
  open_balance_cents: number | null;
  /** How strongly the PAYEE name matches the bank line (0..1) — the "Holiday Inn → Holiday Inn expense" signal. */
  payee_similarity: number;
  amount_gap_cents: number;
  date_gap_days: number;
  memo_similarity: number;
  match_score: number;
  auto_match: boolean;
  /**
   * FAIL-BM2 — true when the candidate's amount equals the bank line to the cent. Exposed so the UI can
   * badge it, and used as the PRIMARY sort key so an exact amount can never rank below a near one.
   */
  exact_amount: boolean;
  /** ROUND 443.29-B — Relay deposit wallet leg (total_amount_cents) when kind = relay_deposit. */
  relay_deposit_wallet_cents?: number;
  /** ROUND 443.29-B — Relay deposit 3.25% fee leg when kind = relay_deposit. */
  relay_deposit_fee_cents?: number;
};

export type ResolveDifferenceInput = {
  operating_company_id: string;
  bank_transaction_id: string;
  actor_user_uuid: string;
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_id: string;
  difference_account_id: string;
};

export type ResolveDifferenceResult = {
  variance_cents: number;
  difference_posted: boolean;
  journal_entry_id: string | null;
  cash_basis_revenue_cents: number;
};

export type MatchVariancePreview = {
  variance_cents: number;
  bank_amount_cents: number;
  ledger_amount_cents: number;
};

// Q11 tolerance rule for auto-match: max($1.00, 0.01% of amount).
const Q11_FIXED_TOLERANCE_CENTS = 100;
const Q11_PERCENT_TOLERANCE = 0.0001;
const AUTO_MATCH_DATE_WINDOW_DAYS = 5;
/**
 * ACCT-F5604 — the memo bar was calibrated for two organic strings, but one side is a synthetic
 * label the poster itself writes, and 0.8 never accounted for its fixed boilerplate.
 *
 * WHAT WAS BROKEN (measured live, tiny-field-89581227, 2026-08-20; banking.reconciliation_matches
 * has 0 rows database-wide, all entities, for as long as this table has existed): every bank-
 * categorization JE candidate's memo is `posting-engine.service.ts`'s own template —
 * `Bank categorization: ${description} ${sourceId.slice(0,8)} posting` — and `memoSimilarity()`
 * (Jaccard token overlap) scores that template against the bank transaction's own description at
 * ONLY ~0.6, computed directly from this repo's real strings:
 *   memoSimilarity("ACME Invoice 4500", "Bank categorization: ACME Invoice 4500 cb271ba0 posting")
 *   = 0.6 -- the boilerplate words ("bank", "categorization", "posting") and the id suffix dilute
 *   an otherwise EXACT content match below any bar above ~0.67, so 0.8 rejected this candidate
 *   unconditionally regardless of how good the real-content match was underneath the wrapper.
 *   ACCT-F365 (2026-08-12) already fixed the memo to embed the real description instead of a bare
 *   uuid -- this is the residual gap ACCT-F365 didn't reach: embedding real content raised the
 *   score, but not high enough to clear 0.8, so auto-match still never fired even after that fix
 *   landed, confirmed by the still-zero row count 8 days later.
 *
 * THE FIX IS NOT TO DROP THE MEMO CHECK. An existing test
 * (bank-recon/__tests__/match-auto-vs-manual.test.ts, "returns ranked manual candidates when
 * similarity is too low") locks in the real protection this gate provides: an unrelated candidate
 * that happens to share a bank transaction's exact amount and date (a real coincidence risk, e.g.
 * two different invoices for the same round amount posted the same week) scores memoSimilarity 0
 * against dissimilar text and must stay manual. Dropping the gate entirely would auto-match that
 * case too, turning a bad suggestion into a bad posting -- the exact failure mode
 * computeMatchScore's own ACCT-F179 fix (above) was careful never to introduce on the ranking side.
 *
 * RECALIBRATED, NOT REMOVED: lowered to 0.5, chosen from the measured cluster gap, not a round
 * number. Real matches through the synthetic-memo wrapper score 0.6-1.0 (0.6 for the boilerplate-
 * diluted JE case above, 1.0 for a plain payment/bill memo with no wrapper); coincidental overlaps
 * on shared generic banking vocabulary score 0.2-0.36 ("Wire Transfer Fee" vs an unrelated "Bank
 * categorization: Wire Transfer ABC Corp ... posting" = 0.36); genuinely unrelated content scores 0.
 * 0.5 sits in the gap between the two clusters with margin on both sides.
 *
 * KNOWN RESIDUAL GAP, not invented around: a JE candidate whose original bank transaction had an
 * EMPTY description at posting time falls back to `Bank categorization ${sourceId} posting` with no
 * embedded content at all -- similarity 0 regardless of threshold, so that specific candidate still
 * cannot auto-match. That is a data-completeness gap in the poster's fallback label, not a matching-
 * threshold problem, and is out of scope for this fix (see REMAINING in the shipping commit).
 */
// 2026-09-06 (lead, BANK-MATCH-QBO): the constant read 0.8 while the calibration note above and the
// regression test (match-auto-vs-manual: boilerplate-diluted JE, similarity 0.6, must auto-match)
// both say 0.5 — the test was failing on main. Restored to the measured value.
export const AUTO_MATCH_MEMO_SIMILARITY_MIN = 0.5;

function normalizeText(input: string | null | undefined) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string) {
  return input
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function memoSimilarity(aRaw: string | null | undefined, bRaw: string | null | undefined) {
  const a = tokenize(normalizeText(aRaw));
  const b = tokenize(normalizeText(bRaw));
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) overlap += 1;
  }
  return (2 * overlap) / (aSet.size + bSet.size);
}

function daysBetween(aDate: string, bDate: string) {
  const a = new Date(aDate.slice(0, 10));
  const b = new Date(bDate.slice(0, 10));
  const deltaMs = Math.abs(a.getTime() - b.getTime());
  return Math.round(deltaMs / (24 * 60 * 60 * 1000));
}

/**
 * LEAD 443.158 M1c — the relevance floor of the default match search (pure): offered only when the amount is within the
 * resolve-difference tolerance OR the document resembles the line (similarity ≥ AUTO_MATCH_MEMO_SIMILARITY_MIN = 0.5).
 */
export function passesMatchRelevanceFloor(input: { amountGapCents: number; similarity: number; toleranceCents: number }): boolean {
  return input.amountGapCents <= input.toleranceCents || input.similarity >= AUTO_MATCH_MEMO_SIMILARITY_MIN;
}

export function toleranceForAmountCents(amountCents: number) {
  return toleranceForAmount(amountCents);
}

function toleranceForAmount(amountCents: number) {
  return Math.max(Q11_FIXED_TOLERANCE_CENTS, Math.round(Math.abs(amountCents) * Q11_PERCENT_TOLERANCE));
}

/**
 * ACCT-F179 — the amount term must stay MONOTONIC in the gap, not clamp to zero outside tolerance.
 *
 * WHAT WAS BROKEN (observed live on USMCA 2026-08-07, /banking/transactions): the match drawer for a
 * $918.00 Zelle line ranked **#1 a JE off by $853.80** (score 0.202) above a JE off by **$282.00**
 * (0.191), and gaps of $282.00 and $604.10 scored IDENTICALLY. The closest candidate by amount came
 * second.
 *
 * The arithmetic: tolerance is `max($1.00, |amount| × 0.0001)` = **$1.00** on a $918 line, and the old
 * term was `max(0, 1 - gap/tolerance)`. Every real candidate gap ($282–$885) is 282×–885× tolerance,
 * so `1 - gap/tol` is deeply negative and the clamp forced amountScore to **0 for all of them**. The
 * 0.55 weight — the MAJORITY of the score — contributed nothing, every candidate shared a 1-day date
 * gap so dateScore tied too, and the ranking was decided entirely by the 0.25 fuzzy-memo term. A bank
 * reconciliation was choosing its top suggestion by text similarity while ignoring the money.
 *
 * THE FIX IS NOT A WIDER TOLERANCE. Tolerance answers "is this the same transaction?" and $1.00 is
 * correct for that — widening it to make ranking work would start AUTO-MATCHING things that are not
 * the same payment, turning a bad suggestion into a bad posting. Ranking and auto-match are different
 * questions and this only changes ranking; `autoMatch` still keys on `amountGapCents <= toleranceCents`
 * exactly as before.
 *
 * Inside tolerance the score stays 1.0, so an exact match still beats a near one decisively. Outside
 * it, the score decays with the gap RELATIVE TO THE TRANSACTION, which keeps it comparable across a
 * $50 line and a $50,000 one: `1 / (1 + gap/amount)` → gap 0 ⇒ 1.0, gap = amount ⇒ 0.5, gap = 10×
 * amount ⇒ 0.09. It never reaches zero, so a closer amount ALWAYS outranks a farther one and the
 * majority weight always carries information.
 *
 * Recomputed against the four live candidates above: $1,200 (gap $282) 0.765 · $313.90 (gap $604) 0.603
 * · $64.20 (gap $854) 0.518 · $33.40 (gap $885) 0.509 — strictly ordered by closeness, so the $282 gap
 * now ranks first instead of second.
 */
/**
 * FAIL-BM2 — order candidates with amount-exactness as the PRIMARY key, match_score as the tie-break.
 *
 * match_score weights amount at 0.55 and date+memo at 0.45, so the 0.45 can outvote a perfect amount: on a
 * $15.00 line an EXACT candidate with weak memo/date scores 0.590 while a $1-off candidate with perfect
 * memo+date scores 0.966 — the near miss ranks first. On a reconciliation surface that is backwards. Amount
 * equality is the strongest evidence two records are the same transaction; a memo is free text.
 *
 * Ordering rather than re-weighting is deliberate: the weights also feed the PERSISTED match_score, and
 * inflating it for exact matches would change a stored number other code reads. autoMatch is untouched — it
 * still keys on amountGapCents <= toleranceCents.
 */
export function compareCandidatesExactFirst(
  a: { exact_amount: boolean; match_score: number },
  b: { exact_amount: boolean; match_score: number },
): number {
  if (a.exact_amount !== b.exact_amount) return a.exact_amount ? -1 : 1;
  return b.match_score - a.match_score;
}

export function computeMatchScore(input: {
  amountGapCents: number;
  toleranceCents: number;
  dateGapDays: number;
  similarity: number;
  /** Absolute bank-line amount, so the gap can be judged relative to the transaction's own size. */
  txnAmountCents: number;
}) {
  const amountScore =
    input.amountGapCents <= input.toleranceCents
      ? 1
      : 1 / (1 + input.amountGapCents / Math.max(Math.abs(input.txnAmountCents), 1));
  const dateScore = Math.max(0, 1 - input.dateGapDays / AUTO_MATCH_DATE_WINDOW_DAYS);
  const memoScore = Math.max(0, Math.min(input.similarity, 1));
  return Number((0.55 * amountScore + 0.2 * dateScore + 0.25 * memoScore).toFixed(6));
}

/**
 * ACCT-F5647 — `forUpdate` defaults false because this helper is shared by read-only paths
 * (findCandidates' candidate search, previewMatchVariance) as well as the actual accept-match writer.
 * acceptMatchWithResolveDifference is the ONLY caller that passes `forUpdate: true` — locking this
 * bank transaction for the entire accept-match flow below. Previously NONE of the three callers
 * locked the row: acceptMatchWithResolveDifference's only duplicate-match guard was a plain read of
 * review_state, and the final UPDATE (below) was an unconditional blind write with no
 * WHERE review_state <> 'matched' compare-and-swap either — so two near-simultaneous accept-match
 * calls against the SAME bank_transaction_id but DIFFERENT ledger entries could both pass the
 * unlocked check and both commit: two rows in banking.reconciliation_matches for one bank line, two
 * different bill_payments/payments rows stamped with the same source_bank_transaction_id, and (if
 * either match had a variance) two independent difference journal entries posted against the same
 * bank cash account — a silent GL overstatement, with the bank_transactions row itself only ever
 * showing ONE of the two matches (last UPDATE wins), so the duplicate leg is invisible to
 * reconciliation forever. The schema's own uniqueness constraint on reconciliation_matches
 * (bank_transaction_id, ledger_entry_kind, ledger_entry_id) does not catch this either, since it
 * includes the ledger entry id — two DIFFERENT ledger entries matched to the same bank transaction
 * pass it cleanly.
 */
async function loadTransaction(
  client: DbClient,
  operatingCompanyId: string,
  bankTransactionId: string,
  forUpdate = false
): Promise<BankTxn | null> {
  // BANK-ACCOUNT-HIDE: a transaction on an account hidden for THIS entity must be unreachable by the
  // categorization/matching flow (flag OFF by default — see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
  const hideOn = await isBankAccountHideEnabled(client, operatingCompanyId);
  // BANK-F9998 F2 — this was the ONLY row-loader both findCandidates() (Match drawer candidate
  // fetch) and acceptMatchWithResolveDifference() (Match drawer Confirm) use, and it never excluded
  // a voided row. A bank transaction voided as a confirmed duplicate (BANK-F9997, PR #20142 — 48
  // rows) stayed fully reachable: it would still return live match candidates and could still be
  // matched/posted through, silently undoing the void. Excluding it here closes both call sites at
  // once — this is the single choke point, not two separate fixes.
  const txn = await client.query<BankTxn>(
    `
      SELECT
        bt.id::text,
        bt.bank_account_id::text,
        bt.operating_company_id::text,
        bt.transaction_date::text,
        bt.amount_cents::int,
        bt.is_credit,
        bt.description,
        bt.merchant_name,
        bt.notes,
        bt.review_state,
        ${bankLinePointerSelectSql("bt")}
      FROM banking.bank_transactions bt
      WHERE bt.id = $1::uuid
        AND bt.operating_company_id = $2::uuid
        AND bt.voided_at IS NULL
        ${bankTransactionHiddenFilterSql(hideOn, "bt")}
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [bankTransactionId, operatingCompanyId]
  );
  return txn.rows[0] ?? null;
}

type RawLedgerCandidate = {
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_id: string;
  amount_cents: number;
  event_date: string;
  memo: string;
  counterparty_kind: MatchCounterpartyKind;
  counterparty_id: string | null;
  counterparty_name: string | null;
  reference: string | null;
  description: string | null;
  open_balance_cents: number | null;
  relay_deposit_wallet_cents?: number;
  relay_deposit_fee_cents?: number;
};

type RawRow = {
  id: string;
  amount_cents: number;
  event_date: string;
  memo: string | null;
  counterparty_id?: string | null;
  counterparty_name?: string | null;
  reference?: string | null;
  description?: string | null;
  open_balance_cents?: number | null;
  relay_deposit_wallet_cents?: number | null;
  relay_deposit_fee_cents?: number | null;
};

function toCandidate(kind: LedgerEntryKind, row: RawRow, counterpartyKind: MatchCounterpartyKind): RawLedgerCandidate {
  // B7 — Description / memo are operator-visible on the Match register. Never pass a session uuid
  // or raw id fragment through (ROUND 390.3 + 433-CUR B7).
  const memo = operatorVisibleMatchText(row.memo ?? "");
  const descriptionRaw = operatorVisibleMatchText(row.description);
  return {
    ledger_entry_kind: kind,
    ledger_entry_id: row.id,
    amount_cents: Math.abs(Number(row.amount_cents ?? 0)),
    event_date: row.event_date,
    memo,
    counterparty_kind: row.counterparty_id ? counterpartyKind : null,
    counterparty_id: row.counterparty_id ?? null,
    counterparty_name: row.counterparty_name ?? null,
    reference: row.reference ?? null,
    description: descriptionRaw || null,
    open_balance_cents: row.open_balance_cents == null ? null : Math.abs(Number(row.open_balance_cents)),
    ...(row.relay_deposit_wallet_cents != null
      ? { relay_deposit_wallet_cents: Math.abs(Number(row.relay_deposit_wallet_cents)) }
      : {}),
    ...(row.relay_deposit_fee_cents != null
      ? { relay_deposit_fee_cents: Math.abs(Number(row.relay_deposit_fee_cents)) }
      : {}),
  };
}

/**
 * BANK-MATCH date cascade (owner 2026-09-23 LOCKED — ROUND 207):
 * Step 1 = bank −3..+1 → if ZERO candidates, Step 2 = −7..+2 (auto_widened).
 * Never auto-advance past Step 2. Explicit From/To (or other filters) bypass the cascade.
 * Backward-leaning windows: ledger document precedes bank clearing (NetSuite txn date <= bank date);
 * +1/+2 covers late entry only. `windowDays` kept only for rare cron callers — NOT the default path.
 */
export type CandidateFilters = {
  windowDays?: number;
  searchQuery?: string;
  kinds?: LedgerEntryKind[];
  payee?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMinCents?: number;
  amountMaxCents?: number;
};

/** Owner-locked cascade steps — never resurrect QBO_DAYS_BEFORE=90 / AFTER=20. */
export const MATCH_WINDOW_STEPS = {
  step1: { before: 3, after: 1 },
  step2: { before: 7, after: 2 },
} as const;

export type MatchWindowStep = 1 | 2 | "custom";

export type MatchWindowInfo = {
  step: MatchWindowStep;
  from: string;
  to: string;
  auto_widened: boolean;
};

export type FindCandidatesResult = {
  candidates: MatchCandidate[];
  window: MatchWindowInfo;
  /** Abs bank amount (cents) — FE multi-doc Resolve sums selected ledger amounts against this. */
  bank_amount_cents: number;
};

const MAX_CUSTOM_SPAN_DAYS = 730;

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function boundsForStep(txnDate: string, step: 1 | 2): { from: string; to: string } {
  const s = step === 1 ? MATCH_WINDOW_STEPS.step1 : MATCH_WINDOW_STEPS.step2;
  return { from: shiftDate(txnDate, -s.before), to: shiftDate(txnDate, s.after) };
}

/** Clamp an explicit From/To span. ROUND 156 §2 Step 3: typed From/To — no preset, no cap.
 * Only normalizes inverted ranges (from > to). Never truncates a long custom span. */
function clampCustomSpan(from: string, to: string): { from: string; to: string } {
  const fromMs = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const toMs = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return { from, to };
  if (toMs < fromMs) return { from: to, to: from };
  return { from, to };
}

/**
 * Payee-name signal: every meaningful token of the vendor / customer name found in the bank line is a
 * hit ("HOLIDAY INN LAREDO" ↔ vendor "Holiday Inn Express" = 2 of 3 tokens = 0.67; all tokens = 1.0).
 * Tokens shorter than 3 characters and generic corporate suffixes carry no signal.
 */
const PAYEE_NOISE = new Set(["inc", "llc", "ltd", "co", "corp", "the", "and", "of", "de", "sa", "cv"]);
export function payeeSimilarity(bankText: string | null | undefined, payeeName: string | null | undefined) {
  const bank = new Set(tokenize(normalizeText(bankText)));
  const payee = tokenize(normalizeText(payeeName)).filter((t) => t.length >= 3 && !PAYEE_NOISE.has(t));
  if (bank.size === 0 || payee.length === 0) return 0;
  let hits = 0;
  for (const t of payee) if (bank.has(t)) hits += 1;
  return Number((hits / payee.length).toFixed(6));
}

// Open-state list for accounting.bills. accounting.bills.status is plain text with NO
// enum/CHECK constraint (confirmed against 0090_p5_d2_bill_payment_balance.sql), so there is no
// CHECK to read literally. The authoritative open-state set is the one that migration itself uses
// in its partial index idx_accounting_bills_company_due_open AND the accounting.vendor_balances
// view: ('open','partial','partially_paid','unpaid'), gated on a real open balance (amount_cents >
// paid_cents) and revoked_at IS NULL.
const OPEN_BILL_STATUSES = ["open", "partial", "partially_paid", "unpaid"] as const;

/**
 * ROUND 155.24 — settlement-born candidate builder ONLY.
 * Deposits (is_credit) have no settlement-born cash documents in this universe (driver pay is
 * money OUT). Withdrawals fetch cash settlement-born bill_payments + settlement-born open bills.
 * Expenses / JE / transfers / AR payments / non-settlement bills NEVER enter this set.
 * `options.kinds` cannot expand the universe — client type filters are ignored (owner withdrew them).
 * `bankAccountId` retained for call-site parity; settlement-born payments are not account-scoped here.
 */
async function fetchLedgerCandidates(
  client: DbClient,
  operatingCompanyId: string,
  txnDate: string,
  isCredit: boolean,
  _bankAccountId: string,
  options: CandidateFilters = {}
): Promise<RawLedgerCandidate[]> {
  const results: RawLedgerCandidate[] = [];
  const windowDays =
    options.windowDays == null ? null : Math.min(Math.max(Number(options.windowDays) || 7, 1), MAX_CUSTOM_SPAN_DAYS);
  let fromDate =
    options.dateFrom ??
    (windowDays != null ? shiftDate(txnDate, -windowDays) : boundsForStep(txnDate, 2).from);
  let toDate =
    options.dateTo ??
    (windowDays != null ? shiftDate(txnDate, windowDays) : boundsForStep(txnDate, 2).to);
  if (options.dateFrom || options.dateTo) {
    const clamped = clampCustomSpan(fromDate, toDate);
    fromDate = clamped.from;
    toDate = clamped.to;
  }
  const searchNeedle = (options.searchQuery ?? "").trim().toLowerCase();
  const payeeNeedle = (options.payee ?? "").trim().toLowerCase();
  const hasFilters = Boolean(searchNeedle || payeeNeedle || options.amountMinCents != null || options.amountMaxCents != null);
  const rowLimit = hasFilters ? 2000 : 500;
  const likeParam = searchNeedle ? `%${searchNeedle}%` : null;
  const wants = (kind: LedgerEntryKind) => !options.kinds?.length || options.kinds.includes(kind);
  // LEAD 443.155 DEFECT 1 — every candidate belongs to THIS bank line's account (QuickBooks never offers a document that
  // does not land in the register being reconciled): a document qualifies when it moves money through this account's
  // ledger (expense paid from it, payment / bill payment deposited to or paid from it), or is an open clearing item that
  // lands in an operating bank (undeposited receipts, a Faro purchase net, an open invoice / settlement bill). A Relay
  // deposit lands only in the Relay Fuel Wallet. Same scope the deposits branch always had ($6 = the bank account).
  const register = (await client.query<{ ledger_id: string | null; operating: boolean; relay_wallet: boolean; undeposited_id: string | null }>(
    `SELECT ba.ledger_account_id::text AS ledger_id,
            (COALESCE(ca.system_purpose, '') = 'bank_operating' OR COALESCE(ca.account_subtype, '') IN ('Checking', 'Savings')) AS operating,
            COALESCE(ca.system_purpose, '') = 'relay_fuel_wallet' AS relay_wallet,
            (SELECT r.account_id::text FROM accounting.chart_of_accounts_roles r
              WHERE r.operating_company_id = ba.operating_company_id AND r.role = 'undeposited_funds' AND r.is_active LIMIT 1) AS undeposited_id
       FROM banking.bank_accounts ba
       LEFT JOIN catalogs.accounts ca ON ca.id = ba.ledger_account_id AND ca.operating_company_id = ba.operating_company_id
      WHERE ba.id = $1::uuid AND ba.operating_company_id = $2::uuid`,
    [_bankAccountId, operatingCompanyId]
  )).rows[0];
  const ledgerId = register?.ledger_id ?? null;
  const onOperatingBank = Boolean(register?.operating);
  const onRelayWallet = Boolean(register?.relay_wallet);
  const undepositedId = register?.undeposited_id ?? null;

  // Direction branches required by verify-bank-match-candidate-sources (Part 1 Match drawer).
  // ROUND 157-C narrowed bill/bill_payment to settlement-born; ROUND 259 restored expenses +
  // the explicit isCredit / !isCredit shape after that refactor red'd main CI.

  // --- MONEY IN (deposit) — customer payments ------------------------------------
  if (isCredit) {
    if (wants("payment")) {
      const payments = await client.query<RawRow>(
        `
          SELECT p.id::text, p.amount_cents::int, p.payment_date::text AS event_date, p.display_id::text AS memo,
                 p.customer_id::text AS counterparty_id, c.customer_name::text AS counterparty_name,
                 COALESCE(NULLIF(p.reference, ''), p.display_id)::text AS reference,
                 NULL::text AS description, NULL::int AS open_balance_cents
            FROM accounting.payments p
            LEFT JOIN mdata.customers c ON c.id = p.customer_id
           WHERE p.operating_company_id = $1::uuid
             AND p.payment_date BETWEEN $2::date AND $3::date
             AND p.voided_at IS NULL
             -- 443.155: deposited to THIS account, or an undeposited receipt that lands in an operating bank.
             AND (p.deposited_to_account_id::text = $6::text
                  OR ($7::boolean AND (p.deposited_to_account_id IS NULL OR p.deposited_to_account_id::text = $8::text)))
             AND ($4::text IS NULL OR lower(COALESCE(p.display_id, '') || ' ' || COALESCE(p.reference, '') || ' ' || COALESCE(c.customer_name, '')) LIKE $4)
             AND NOT EXISTS (
               SELECT 1 FROM banking.reconciliation_matches m
                WHERE m.ledger_entry_kind = 'payment'
                  AND m.ledger_entry_id = p.id
                  AND m.match_state IN ('auto_matched', 'user_matched')
             )
             -- ROUND 373.4: a receipt already on a live Deposit is matched THROUGH that deposit, never on its own —
             -- matching it directly would move it out of Undeposited Funds a second time.
             AND NOT EXISTS (
               SELECT 1 FROM accounting.deposit_lines dl
                 JOIN accounting.deposits d ON d.id = dl.deposit_id AND d.voided_at IS NULL
                WHERE dl.source_payment_id = p.id
             )
             -- LEAD 443.158 M1b: a document already consumed by a bank line is never a candidate for another line.
             AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions cbt
                              WHERE cbt.matched_payment_id = p.id AND cbt.voided_at IS NULL)
             AND p.source_bank_transaction_id IS NULL
           LIMIT $5
        `,
        [operatingCompanyId, fromDate, toDate, likeParam, rowLimit, ledgerId, onOperatingBank, undepositedId]
      );
      for (const row of payments.rows) results.push(toCandidate("payment", row, "customer"));
    }
    // ROUND 373.4 — Deposit documents: the deposit that already moved its receipts from Undeposited Funds into THIS bank
    // account. Scoped to the line's own bank account (a deposit belongs to one bank), live, posted, not yet matched.
    if (wants("deposit")) {
      const deposits = await client.query<RawRow>(
        `
          SELECT d.id::text, d.amount_deposited_cents::int AS amount_cents, d.deposit_date::text AS event_date,
                 d.display_id::text AS memo, NULL::text AS counterparty_id, NULL::text AS counterparty_name,
                 COALESCE(NULLIF(d.reference_number, ''), d.display_id)::text AS reference,
                 d.memo::text AS description, NULL::int AS open_balance_cents
            FROM accounting.deposits d
           WHERE d.operating_company_id = $1::uuid
             AND d.bank_account_id = $6::uuid
             AND d.deposit_date BETWEEN $2::date AND $3::date
             AND d.voided_at IS NULL
             AND d.posting_status = 'posted'
             AND ($4::text IS NULL OR lower(COALESCE(d.display_id, '') || ' ' || COALESCE(d.reference_number, '') || ' ' || COALESCE(d.memo, '')) LIKE $4)
             AND NOT EXISTS (
               SELECT 1 FROM banking.reconciliation_matches m
                WHERE m.ledger_entry_kind = 'deposit'
                  AND m.ledger_entry_id = d.id
                  AND m.voided_at IS NULL
                  AND m.match_state IN ('auto_matched', 'user_matched')
             )
             -- LEAD 443.158 M1b: already consumed by a bank line.
             AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions cbt
                              WHERE cbt.matched_deposit_id = d.id AND cbt.voided_at IS NULL)
           LIMIT $5
        `,
        [operatingCompanyId, fromDate, toDate, likeParam, rowLimit, _bankAccountId]
      );
      for (const row of deposits.rows) results.push(toCandidate("deposit", row, "customer"));
    }

    // LEAD 443.155 DEFECT 2 — Faro purchases: the Faro wire lands in the operating bank and equals the purchase NET
    // (gross − escrow − discount − wire fee − cash reserve), or the sum of the purchases Faro funded in one wire (same
    // purchase date). Candidate id = the purchase's advance: the EXISTING factoring_advance accept (Owner-only) — the
    // purchase is never re-posted; the match links it.
    if (onOperatingBank && wants("factoring_advance")) {
      const purchases = await client.query<RawRow>(
        `
          WITH open_fp AS (
            SELECT fp.factoring_advance_id, fp.net_to_company_cents, fp.purchase_date, fp.display_id, fp.invoice_count,
                   fp.gross_cents, fp.factoring_company_vendor_id
              FROM accounting.factoring_purchases fp
             WHERE fp.operating_company_id = $1::uuid
               AND fp.status = 'posted'
               AND fp.voided_at IS NULL
               AND fp.factoring_advance_id IS NOT NULL
               AND fp.purchase_date BETWEEN $2::date AND $3::date
               AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions bt
                                WHERE bt.matched_factoring_advance_id = fp.factoring_advance_id AND bt.voided_at IS NULL)
               AND NOT EXISTS (SELECT 1 FROM banking.reconciliation_matches m
                                WHERE m.ledger_entry_kind = 'factoring_advance' AND m.ledger_entry_id = fp.factoring_advance_id
                                  AND m.voided_at IS NULL AND m.match_state IN ('auto_matched', 'user_matched'))
          )
          SELECT fp.factoring_advance_id::text AS id,
                 fp.net_to_company_cents::int AS amount_cents,
                 fp.purchase_date::text AS event_date,
                 ('Faro purchase ' || fp.display_id)::text AS memo,
                 fp.factoring_company_vendor_id::text AS counterparty_id,
                 COALESCE(v.vendor_name, 'Faro')::text AS counterparty_name,
                 fp.display_id::text AS reference,
                 ('Faro purchase ' || fp.display_id || ' — ' || fp.invoice_count || ' invoice(s), gross '
                   || to_char(fp.gross_cents / 100.0, 'FM999,999,990.00')
                   || CASE WHEN w.n > 1 THEN ' — one of ' || w.n || ' purchases on ' || fp.purchase_date::text
                        || ', wire total ' || to_char(w.total / 100.0, 'FM999,999,990.00') ELSE '' END)::text AS description,
                 NULL::int AS open_balance_cents
            FROM open_fp fp
            JOIN (SELECT purchase_date, count(*) AS n, sum(net_to_company_cents) AS total FROM open_fp GROUP BY purchase_date) w
              ON w.purchase_date = fp.purchase_date
            LEFT JOIN mdata.vendors v ON v.id = fp.factoring_company_vendor_id
           WHERE ($4::text IS NULL OR lower(COALESCE(fp.display_id, '') || ' faro purchase ' || COALESCE(v.vendor_name, '')) LIKE $4)
           LIMIT $5
        `,
        [operatingCompanyId, fromDate, toDate, likeParam, rowLimit]
      );
      for (const row of purchases.rows) results.push(toCandidate("factoring_advance", row, "vendor"));
    }

    // LEAD 443.155 DEFECT 2 — open A/R invoices (view-only, see VIEW_ONLY_MATCH_KINDS): a customer's payment lands in the
    // operating bank. Factored invoices are paid to Faro, never to this account — excluded.
    if (onOperatingBank && wants("invoice")) {
      const invoices = await client.query<RawRow>(
        `
          SELECT i.id::text, COALESCE(i.amount_open_cents, i.total_cents)::int AS amount_cents,
                 COALESCE(i.due_date, i.issue_date)::text AS event_date,
                 ('Invoice ' || i.display_id)::text AS memo,
                 i.customer_id::text AS counterparty_id, c.customer_name::text AS counterparty_name,
                 i.display_id::text AS reference, ('Invoice ' || i.display_id)::text AS description,
                 COALESCE(i.amount_open_cents, i.total_cents)::int AS open_balance_cents
            FROM accounting.invoices i
            LEFT JOIN mdata.customers c ON c.id = i.customer_id
           WHERE i.operating_company_id = $1::uuid
             AND i.voided_at IS NULL
             AND i.status::text IN ('sent', 'partial', 'overdue')
             AND COALESCE(i.factoring_status, 'not_factored') = 'not_factored'
             AND COALESCE(i.amount_open_cents, i.total_cents) > 0
             AND COALESCE(i.issue_date, i.created_at::date) <= $2::date
             AND ($3::text IS NULL OR lower(COALESCE(i.display_id, '') || ' ' || COALESCE(c.customer_name, '')) LIKE $3)
           LIMIT $4
        `,
        [operatingCompanyId, toDate, likeParam, rowLimit]
      );
      for (const row of invoices.rows) results.push(toCandidate("invoice", row, "customer"));
    }

    // ROUND 443.66-C — Relay wallet funding deposits land as MONEY IN (credits on 1295).
    // Previously wrongly gated under !isCredit (443.29-B / 443.54), so wallet IN lines never saw them.
    // LEAD 443.155 DEFECT 1 — only on the Relay Fuel Wallet register (a BofA wire in is never a Relay deposit).
    if (onRelayWallet && wants("relay_deposit")) {
      const deposits = await client.query<RawRow>(
        `
          SELECT rd.id::text,
                 ${RELAY_DEPOSIT_CHARGED_AMOUNT_SQL} AS amount_cents,
                 COALESCE(rd.relay_created_at, rd.created_at)::date::text AS event_date,
                 ('Relay deposit ' || rd.deposit_id)::text AS memo,
                 NULL::text AS counterparty_id,
                 'Relay'::text AS counterparty_name,
                 rd.deposit_id::text AS reference,
                 ('Relay deposit ' || rd.deposit_id)::text AS description,
                 NULL::int AS open_balance_cents,
                 ${RELAY_DEPOSIT_WALLET_AMOUNT_SQL} AS relay_deposit_wallet_cents,
                 ${RELAY_DEPOSIT_FEE_AMOUNT_SQL} AS relay_deposit_fee_cents
            FROM integrations.relay_deposits rd
           WHERE rd.operating_company_id = $1::uuid
             AND rd.status = 'settled'
             AND ${RELAY_DEPOSIT_MATCHABLE_SQL}
             AND rd.voided_at IS NULL
             AND COALESCE(rd.is_active, true) = true
             AND COALESCE(rd.relay_created_at, rd.created_at)::date
                   BETWEEN GREATEST($2::date, $6::date) AND $3::date
             AND ($4::text IS NULL OR lower(COALESCE(rd.note_raw, '') || ' ' || COALESCE(rd.deposit_id, '') || ' relay deposit') LIKE $4)
             AND rd.matched_bank_transaction_id IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM banking.bank_transactions bt
                WHERE bt.matched_relay_deposit_id = rd.id AND bt.voided_at IS NULL
             )
           LIMIT $5
        `,
        [operatingCompanyId, fromDate, toDate, likeParam, rowLimit, RELAY_USMCA_DATA_FLOOR]
      );
      for (const row of deposits.rows) results.push(toCandidate("relay_deposit", row, "vendor"));
    }
  }

  // --- MONEY OUT (withdrawal) — settlement-born bill_payments / bills + expenses --
  if (!isCredit) {
    // --- CASH settlement-born bill_payments (primary match targets) ----------------
    if (wants("bill_payment")) {
      const billPayments = await client.query<RawRow>(
        `
          SELECT bp.id::text, bp.amount_cents::int, bp.payment_date::text AS event_date,
                 COALESCE(bp.reference_number, bp.memo)::text AS memo,
                 bp.vendor_id::text AS counterparty_id, v.vendor_name::text AS counterparty_name,
                 COALESCE(NULLIF(bp.check_number, ''), bp.reference_number)::text AS reference,
                 bp.memo::text AS description, NULL::int AS open_balance_cents
            FROM accounting.bill_payments bp
            LEFT JOIN mdata.vendors v ON v.id::text = bp.vendor_id
           WHERE bp.operating_company_id = $1::uuid
             AND bp.payment_date BETWEEN $2::date AND $3::date
             AND bp.revoked_at IS NULL
             AND bp.voided_at IS NULL
             AND ${SQL_BILL_PAYMENT_IS_CASH_SETTLEMENT_BORN}
             AND ($4::text IS NULL OR lower(COALESCE(bp.reference_number, '') || ' ' || COALESCE(bp.memo, '') || ' ' || COALESCE(bp.check_number, '') || ' ' || COALESCE(v.vendor_name, '')) LIKE $4)
             AND NOT EXISTS (
               SELECT 1 FROM banking.reconciliation_matches m
                WHERE m.ledger_entry_kind = 'bill_payment'
                  AND m.ledger_entry_id = bp.id
                  AND m.match_state IN ('auto_matched', 'user_matched')
             )
             AND bp.source_bank_transaction_id IS NULL
             -- LEAD 443.158 M1b: already consumed by a bank line.
             AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions cbt
                              WHERE cbt.matched_bill_payment_id = bp.id AND cbt.voided_at IS NULL)
             -- 443.155: paid from THIS bank account (its own column, or its posting credits this account's ledger).
             AND (bp.from_bank_account_id = $6::uuid
                  OR EXISTS (SELECT 1 FROM accounting.journal_entry_postings jp
                              WHERE jp.operating_company_id = bp.operating_company_id AND jp.source_transaction_type = 'bill_payment'
                                AND jp.source_transaction_id::text = bp.id::text AND jp.account_id = $7::uuid
                                AND jp.reversal_of_line_id IS NULL))
           LIMIT $5
        `,
        [operatingCompanyId, fromDate, toDate, likeParam, rowLimit, _bankAccountId, ledgerId]
      );
      for (const row of billPayments.rows) results.push(toCandidate("bill_payment", row, "vendor"));
    }

    // --- Settlement-born OPEN bills (ROUND 155.25 — stay candidates until balance zero) ---
    // Do NOT drop a bill after one match. Only open_balance > 0 removes it.
    // amount = remaining open balance. Classifier offers record_partial_payment when bill > bank.
    // 443.155: an open settlement bill is paid from an operating bank — never offered on a card or wallet register.
    if (onOperatingBank && wants("bill")) {
      const bills = await client.query<RawRow>(
        `
          SELECT
            b.id::text,
            (COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0))::int AS amount_cents,
            b.bill_date::text AS event_date,
            COALESCE(b.mdata_vendor_id::text, b.vendor_uuid, b.vendor_id)::text AS counterparty_id,
            v.vendor_name::text AS counterparty_name,
            COALESCE(NULLIF(b.bill_number, ''), b.display_id)::text AS reference,
            b.memo::text AS description,
            (COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0))::int AS open_balance_cents,
            COALESCE(NULLIF(b.bill_number, ''), b.display_id, b.memo)::text AS memo
          FROM accounting.bills b
          LEFT JOIN mdata.vendors v ON v.id::text = COALESCE(b.mdata_vendor_id::text, b.vendor_uuid, b.vendor_id)
          WHERE b.operating_company_id = $1::uuid
            AND b.bill_date BETWEEN $2::date AND $4::date
            AND b.revoked_at IS NULL
            AND b.status = ANY($3::text[])
            AND (COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0)) > 0
            AND ${SQL_BILL_IS_SETTLEMENT_BORN}
            AND ($5::text IS NULL OR lower(COALESCE(b.bill_number, '') || ' ' || COALESCE(b.display_id, '') || ' ' || COALESCE(b.memo, '') || ' ' || COALESCE(v.vendor_name, '')) LIKE $5)
          LIMIT $6
        `,
        [operatingCompanyId, fromDate, OPEN_BILL_STATUSES as unknown as string[], toDate, likeParam, rowLimit]
      );
      for (const row of bills.rows) results.push(toCandidate("bill", row, "vendor"));
    }

    // --- Posted expenses (Part 1 Match drawer — money-out; restored ROUND 259) ---
    // Accept path requires status=posted (no new JE on match). Exclude already-matched / voided.
    if (wants("expense")) {
      const expenses = await client.query<RawRow>(
        `
          SELECT
            e.id::text,
            e.total_amount_cents::int AS amount_cents,
            e.transaction_date::text AS event_date,
            COALESCE(e.expense_number, e.memo)::text AS memo,
            e.vendor_uuid::text AS counterparty_id,
            v.vendor_name::text AS counterparty_name,
            COALESCE(NULLIF(e.vendor_document_number, ''), e.expense_number)::text AS reference,
            e.memo::text AS description,
            NULL::int AS open_balance_cents
          FROM accounting.expenses e
          LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid
          WHERE e.operating_company_id = $1::uuid
            AND e.transaction_date BETWEEN $2::date AND $3::date
            AND e.is_active = true
            AND e.voided_at IS NULL
            AND e.status = 'posted'
            -- 443.155: an expense is a candidate only on the account it was paid from.
            AND e.payment_account_uuid = $6::uuid
            AND ($4::text IS NULL OR lower(COALESCE(e.expense_number, '') || ' ' || COALESCE(e.memo, '') || ' ' || COALESCE(e.vendor_document_number, '') || ' ' || COALESCE(v.vendor_name, '')) LIKE $4)
            AND NOT EXISTS (
              SELECT 1 FROM banking.reconciliation_matches m
              WHERE m.ledger_entry_kind = 'expense'
                AND m.ledger_entry_id = e.id
                AND m.match_state IN ('auto_matched', 'user_matched')
            )
            -- LEAD 443.158 M1b: an expense already consumed by a bank line (it is that line's matched expense, or it was
            -- born from a bank line) is never a candidate for another line (owner: EXP-2026-00067 offered on a second line).
            AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions cbt
                             WHERE cbt.matched_expense_id = e.id AND cbt.voided_at IS NULL)
            AND e.source_bank_transaction_id IS NULL
          LIMIT $5
        `,
        [operatingCompanyId, fromDate, toDate, likeParam, rowLimit, ledgerId]
      );
      for (const row of expenses.rows) results.push(toCandidate("expense", row, "vendor"));
    }

    // ROUND 443.54 — Relay fills are paid from wallet 1295, NOT from the bank. They must never
    // appear as bank match candidates (accept/unmatch of an existing pointer still works below).
    // Previously ROUND 441.21-B R5 listed them here; that is retired for the bank Match drawer.
    // ROUND 443.66-C — wallet OUT suggestions go through suggestRelayWalletLine (expense, fee-inclusive);
    // fills themselves stay out of this candidate pool. relay_deposit listing moved to isCredit above.
  }

  const haystack = (r: RawLedgerCandidate) =>
    `${r.memo ?? ""} ${r.reference ?? ""} ${r.description ?? ""} ${r.counterparty_name ?? ""}`.toLowerCase();
  return results.filter((row) => {
    if (searchNeedle && !haystack(row).includes(searchNeedle)) return false;
    if (payeeNeedle && !(row.counterparty_name ?? "").toLowerCase().includes(payeeNeedle)) return false;
    if (options.amountMinCents != null && row.amount_cents < options.amountMinCents) return false;
    if (options.amountMaxCents != null && row.amount_cents > options.amountMaxCents) return false;
    return true;
  });
}

/**
 * ROUND 373.4 — a customer payment or factoring advance that sits on a live Deposit already left Undeposited Funds
 * through that deposit. Matching it directly would sweep it a second time; match the deposit instead.
 */
async function refuseReceiptAlreadyOnADeposit(client: DbClient, operatingCompanyId: string, kind: LedgerEntryKind, entryId: string) {
  if (kind !== "payment" && kind !== "factoring_advance") return;
  const col = kind === "payment" ? "source_payment_id" : "source_factoring_advance_id";
  const res = await client.query<{ display_id: string | null }>(
    `SELECT d.display_id::text
       FROM accounting.deposit_lines dl
       JOIN accounting.deposits d ON d.id = dl.deposit_id AND d.voided_at IS NULL
      WHERE dl.${col} = $1::uuid AND dl.operating_company_id = $2::uuid
      LIMIT 1`,
    [entryId, operatingCompanyId]
  );
  if (res.rows[0]) {
    throw new Error(`receipt_is_on_a_deposit:${res.rows[0].display_id ?? ""} — match the bank line to that deposit, not to the receipt`);
  }
}

/**
 * ENG-SPINE / company+WORM — the one amount reader for 1:1 accept, multi-document
 * accept, and preview. Missing / wrong-company / voided / revoked used to return 0,
 * so 1:1 posted a difference JE for the full bank amount against a ghost document.
 * Candidates already hide those rows. Accept takes raw ids from the route — fail closed.
 */
async function requireLedgerAmountRow(
  res: { rows: Array<{ amount_cents: number }> },
  kind: LedgerEntryKind
): Promise<number> {
  if (!res.rows[0]) throw new Error(`ledger_document_not_found:${kind}`);
  return Math.abs(Number(res.rows[0].amount_cents ?? 0));
}

async function loadLedgerAmountCents(client: DbClient, operatingCompanyId: string, kind: LedgerEntryKind, entryId: string) {
  if (kind === "payment") {
    const res = await client.query<{ amount_cents: number }>(
      `SELECT amount_cents::int FROM accounting.payments
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL
        LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return requireLedgerAmountRow(res, kind);
  }
  if (kind === "bill_payment") {
    const res = await client.query<{ amount_cents: number }>(
      `SELECT amount_cents::int FROM accounting.bill_payments
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
          AND voided_at IS NULL AND revoked_at IS NULL
        LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return requireLedgerAmountRow(res, kind);
  }
  if (kind === "transfer") {
    const res = await client.query<{ amount_cents: number }>(
      `SELECT amount_cents::int FROM banking.transfers
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND revoked_at IS NULL
        LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return requireLedgerAmountRow(res, kind);
  }
  if (kind === "bill") {
    // bill amount = OPEN BALANCE (amount_cents − paid_cents), same basis as the candidate query.
    const res = await client.query<{ amount_cents: number }>(
      `SELECT (COALESCE(amount_cents, 0) - COALESCE(paid_cents, 0))::int AS amount_cents
         FROM accounting.bills
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND revoked_at IS NULL
        LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return requireLedgerAmountRow(res, kind);
  }
  if (kind === "expense") {
    const res = await client.query<{ amount_cents: number }>(
      `SELECT total_amount_cents::int AS amount_cents
         FROM accounting.expenses
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL
        LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return requireLedgerAmountRow(res, kind);
  }
  if (kind === "factoring_advance") {
    // Expected wire net = invoice − reserve − factor fee − wire fee − cash_rsv (ROUND 186 formula).
    const res = await client.query<{ amount_cents: number }>(
      `SELECT (
          COALESCE(invoice_total_cents, 0)
          - COALESCE(reserve_amount_cents, 0)
          - COALESCE(factor_fee_cents, 0)
          - COALESCE(wire_fee_cents, 0)
          - COALESCE(cash_rsv_cents, 0)
        )::int AS amount_cents
         FROM accounting.factoring_advances
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL
        LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return requireLedgerAmountRow(res, kind);
  }
  if (kind === "fuel_transaction") {
    const res = await client.query<{ amount_cents: number }>(
      `SELECT ROUND(COALESCE(total_cost, 0) * 100)::int AS amount_cents
         FROM fuel.fuel_transactions
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL
        LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return requireLedgerAmountRow(res, kind);
  }
  if (kind === "relay_fuel") {
    // F442 / ROUND 441.21-B: wallet drawdown = total_amount_paid + sender_fee (fees[]).
    // Paid alone is fuel-only and misses the $2 fee the bank line carries.
    const res = await client.query<{ amount_cents: number }>(
      `SELECT ${RELAY_FUEL_WALLET_AMOUNT_SQL} AS amount_cents
         FROM integrations.relay_fuel_transactions r
        WHERE r.id = $1::uuid AND r.operating_company_id = $2::uuid AND r.voided_at IS NULL
        LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return requireLedgerAmountRow(res, kind);
  }
  if (kind === "deposit") {
    // The amount that reached the bank: total receipts less any cash back (accounting.deposits CHECK deposits_amount_math).
    // Candidates already require posted — accept takes raw ids, so refuse unposted here too.
    const res = await client.query<{ amount_cents: number }>(
      `SELECT amount_deposited_cents::int AS amount_cents
         FROM accounting.deposits
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
          AND voided_at IS NULL AND posting_status = 'posted'
        LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return requireLedgerAmountRow(res, kind);
  }
  if (kind === "relay_deposit") {
    const res = await client.query<{ amount_cents: number }>(
      `SELECT ${RELAY_DEPOSIT_CHARGED_AMOUNT_SQL} AS amount_cents
         FROM integrations.relay_deposits rd
        WHERE rd.id = $1::uuid
          AND rd.operating_company_id = $2::uuid
          AND rd.status = 'settled'
          AND ${RELAY_DEPOSIT_MATCHABLE_SQL}
          AND rd.voided_at IS NULL
        LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return requireLedgerAmountRow(res, kind);
  }
  if (kind === "settlement") {
    // Driver settlement net_pay is stored in dollars (numeric). Bank amount is cents.
    const res = await client.query<{ amount_cents: number }>(
      `SELECT ROUND(COALESCE(net_pay, 0) * 100)::int AS amount_cents
         FROM driver_finance.driver_settlements
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL
        LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return requireLedgerAmountRow(res, kind);
  }
  const res = await client.query<{ amount_cents: number }>(
    `
      SELECT COALESCE(SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit = 'debit'), 0)::int AS amount_cents
      FROM accounting.journal_entries je
      LEFT JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
      WHERE je.id = $1::uuid
        AND je.operating_company_id = $2::uuid
        AND je.voided_at IS NULL
      GROUP BY je.id
      LIMIT 1
    `,
    [entryId, operatingCompanyId]
  );
  return requireLedgerAmountRow(res, kind);
}

async function storeMatch(
  client: DbClient,
  input: {
    operating_company_id: string;
    bank_transaction_id: string;
    ledger_entry_kind: LedgerEntryKind;
    ledger_entry_id: string;
    match_score: number;
    match_state: MatchState;
    actor_user_uuid: string;
  }
): Promise<string> {
  // BANK-F4 at the WRITE point (ROUND 365.6): one document, one live bank match. The candidate queries exclude matched
  // documents, but accept also takes ids from routes with no candidate step (transfer / je), so the refusal lives here,
  // where every accept passes. A row on THIS line (re-match after unmatch) is revived by the upsert below.
  if (input.match_state === "user_matched" || input.match_state === "auto_matched") {
    const held = await client.query<{ bank_transaction_id: string }>(
      `SELECT m.bank_transaction_id::text
         FROM banking.reconciliation_matches m
        WHERE m.operating_company_id = $1::uuid
          AND m.ledger_entry_kind = $2::text
          AND m.ledger_entry_id = $3::uuid
          AND m.bank_transaction_id <> $4::uuid
          AND m.voided_at IS NULL
          AND m.match_state IN ('auto_matched', 'user_matched')
        LIMIT 1`,
      [input.operating_company_id, input.ledger_entry_kind, input.ledger_entry_id, input.bank_transaction_id]
    );
    if (held.rows[0]) {
      throw new Error(`document_already_matched:${input.ledger_entry_kind}:${held.rows[0].bank_transaction_id}`);
    }
  }
  const res = await client.query<{ id: string }>(
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
      VALUES ($1::uuid, $2::uuid, $3::text, $4::uuid, $5::numeric, $6::text, now(), $7::uuid)
      ON CONFLICT (bank_transaction_id, ledger_entry_kind, ledger_entry_id) WHERE match_state <> 'released'
      DO UPDATE SET
        match_score = EXCLUDED.match_score,
        match_state = EXCLUDED.match_state,
        matched_at = now(),
        matched_by_user_uuid = EXCLUDED.matched_by_user_uuid,
        -- ROUND 360 — re-matching a pair an unmatch retired makes the row live again.
        voided_at = NULL,
        void_reason = NULL,
        voided_by_user_id = NULL,
        updated_at = now()
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      input.bank_transaction_id,
      input.ledger_entry_kind,
      input.ledger_entry_id,
      input.match_score,
      input.match_state,
      input.actor_user_uuid,
    ]
  );
  // An upsert with RETURNING always yields its row in Postgres; if it ever does not, refuse by name rather than crash
  // on undefined.id and leave the caller's transaction half-written.
  const matchId = res.rows[0]?.id;
  if (!matchId) throw new Error(`reconciliation_match_not_stored:${input.bank_transaction_id}:${input.ledger_entry_kind}:${input.ledger_entry_id}`);
  return matchId;
}

function computeCashBasisRevenueFromActualCashHit(input: { bankAmountCents: number; ledgerAmountCents: number; asOfDate: string }) {
  // @decision Q8 - resolve-difference for bank match must recognize actual cash hit.
  const entries: CashBasisEntry[] = [
    {
      entry_id: "ledger-revenue-reference",
      account_code: "REV",
      account_name: "Ledger Revenue Candidate",
      account_type: "Income",
      amount_cents: input.ledgerAmountCents,
      source_type: "invoice_revenue",
      event_date: input.asOfDate,
      settlement_date: input.asOfDate,
    },
    {
      entry_id: "bank-cash-hit",
      account_code: "BANK",
      account_name: "Bank Cash Hit",
      account_type: "Income",
      amount_cents: input.bankAmountCents,
      source_type: "cash_event",
      event_date: input.asOfDate,
      settlement_date: input.asOfDate,
    },
  ];
  const transformed = applyCashBasisSuppression(entries, { as_of_date: input.asOfDate });
  return transformed
    .filter((entry) => entry.entry_id === "bank-cash-hit")
    .reduce((sum, entry) => sum + Number(entry.amount_cents ?? 0), 0);
}

/** LEAD 443.84 #3 — the card discount cap: above it the line is a different purchase, never a discount. */
export const CARD_DISCOUNT_MAX_PCT = 8;
export const FUEL_CARD_DISCOUNT_ITEM = "Fuel Card Discount";

/**
 * LEAD 443.84 #3 — a fuel-card line pays its receipt(s) at the card's discounted price (measured: a median 3.6% under the pump
 * receipt). The difference is the card discount: Dr the card payable (the bank account's ledger, e.g. 2510) / Cr the account of
 * the item "Fuel Card Discount" (mapped to "Fuel & Diesel" 5000 — no new account). Split across the receipts in proportion to
 * their amounts; each pair is sourced to its receipt's expense, so it carries that receipt's load, its driver (entity) and its
 * unit class — the fuel cost on the load becomes what the card charged. Refused: a non-expense member, a line ABOVE the receipt
 * (a different purchase), a discount above CARD_DISCOUNT_MAX_PCT, a missing item. Caller owns the transaction.
 */
type CardDiscountSplit = { difference_account_id: string; item_id: string; discount_cents: number;
  legs: Array<{ source_expense_id: string; cents: number; class_id: string | null; label: string }> };
async function cardDiscountShares(client: DbClient, input: {
  operating_company_id: string; bank_account_id: string; is_credit: boolean;
  variance_cents: number; ledger_sum_cents: number;
  members: Array<{ kind: LedgerEntryKind; id: string; amount_cents: number }>;
}): Promise<CardDiscountSplit> {
  if (input.is_credit) throw new Error("card_discount_requires_a_payment_line");
  if (input.members.some((m) => m.kind !== "expense")) throw new Error("card_discount_members_must_be_expenses");
  if (input.variance_cents > 0) throw new Error(`card_line_above_receipt:${input.variance_cents}`);
  const discount = -input.variance_cents;
  if (discount * 100 > input.ledger_sum_cents * CARD_DISCOUNT_MAX_PCT) {
    throw new Error(`card_discount_above_cap:${discount}:${input.ledger_sum_cents}:${CARD_DISCOUNT_MAX_PCT}%`);
  }
  const item = (await client.query<{ id: string; account_id: string | null }>(
    `SELECT i.id::text, i.default_expense_account_id::text AS account_id FROM catalogs.items i
      WHERE i.item_name = $2 AND i.deactivated_at IS NULL AND (i.operating_company_id = $1::uuid OR i.operating_company_id IS NULL)
      ORDER BY (i.operating_company_id = $1::uuid) DESC NULLS LAST LIMIT 1`, [input.operating_company_id, FUEL_CARD_DISCOUNT_ITEM])).rows[0];
  if (!item?.account_id) throw new Error("fuel_card_discount_item_missing");
  const stamps = (await client.query<{ id: string; class_id: string | null; ref: string | null }>(
    `SELECT e.id::text, e.expense_number AS ref,
            (SELECT p.class_id::text FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id AND p.debit_or_credit = 'debit' AND p.class_id IS NOT NULL LIMIT 1) AS class_id
       FROM accounting.expenses e WHERE e.id = ANY($1::uuid[]) AND e.operating_company_id = $2::uuid`,
    [input.members.map((m) => m.id), input.operating_company_id])).rows;
  const byId = new Map(stamps.map((r) => [r.id, r]));
  const shares = input.members.map((m) => ({ m, cents: Math.floor((discount * m.amount_cents) / input.ledger_sum_cents) }));
  const rest = discount - shares.reduce((a, x) => a + x.cents, 0);
  [...shares].sort((a, b) => b.m.amount_cents - a.m.amount_cents)[0]!.cents += rest;
  return { difference_account_id: item.account_id, item_id: item.id, discount_cents: discount,
    legs: shares.filter((x) => x.cents > 0).map((x) => ({ source_expense_id: x.m.id, cents: x.cents, class_id: byId.get(x.m.id)?.class_id ?? null,
      label: `${FUEL_CARD_DISCOUNT_ITEM} — ${byId.get(x.m.id)?.ref ?? x.m.id}` })) };
}

async function postDifferenceJournalEntry(
  client: DbClient,
  input: {
    operating_company_id: string;
    bank_transaction_id: string;
    bank_account_id: string;
    difference_account_id: string;
    actor_user_uuid: string;
    transaction_date: string;
    variance_cents: number;
    is_credit: boolean;
    /** 443.84 #3 card discount: one pair per receipt, sourced to the receipt (its load), linked to this bank line as the variance. */
    split?: Array<{ source_expense_id: string; cents: number; class_id: string | null; label: string }>;
  }
) {
  if (input.variance_cents === 0) return null;

  // Bank→GL bridge is banking.bank_accounts.ledger_account_id (FK → catalogs.accounts), NOT coa_account_id
  // (that column does not exist — reading it threw 42703 on every variance post). Same bridge CHAIN-04/05 use.
  // BANK-ACCOUNT-HIDE: fail-closed — an account hidden for this entity can never be the target of a NEW
  // variance posting (flag OFF by default).
  const hideOnForPost = await isBankAccountHideEnabled(client, input.operating_company_id);
  const accountRes = await client.query<{ ledger_account_id: string | null }>(
    `
      SELECT ledger_account_id::text
      FROM banking.bank_accounts
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        ${bankAccountHiddenFilterSql(hideOnForPost, "banking.bank_accounts")}
      LIMIT 1
    `,
    [input.bank_account_id, input.operating_company_id]
  );
  const cashAccountId = accountRes.rows[0]?.ledger_account_id;
  if (!cashAccountId) {
    throw new Error("bank_account_missing_ledger_account_id");
  }

  const magnitude = Math.abs(input.variance_cents);
  const shouldDebitCash = (input.is_credit && input.variance_cents > 0) || (!input.is_credit && input.variance_cents < 0);
  // DISP-F6XXX (hop.bank) -- accounting.journal_entries.source has a hard CHECK constraint,
  // CHECK (source IN ('manual', 'auto')) (0092_p5_d4_manual_journal_entries.sql), the same two
  // values every OTHER system-posted JE in this codebase uses (posting-engine.service.ts,
  // fuel-posting/poster.service.ts, lease-posting.service.ts, amortization-posting.service.ts,
  // recurring.worker.ts, period-close-retained-earnings.service.ts, void.service.ts -- all 'auto').
  // The INSERT below used to write the literal "bank_reconciliation", which was never a valid
  // value -- live-confirmed 500 "new row for relation journal_entries violates check constraint
  // journal_entries_source_check" on every single accept-match-with-variance call, meaning this
  // code path has been completely broken since it was built (a variance of exactly $0.00 is the
  // only case that skips this function entirely -- see the variance_cents===0 guard above). The
  // specific "this JE came from bank reconciliation" fact is not lost: it's carried in memo
  // (bank-recon:<bank_transaction_id>) and the posting descriptions below, exactly like every
  // other 'auto' JE conveys its specific origin via memo, not source.
  const bankReconMemo = `bank-recon:${input.bank_transaction_id}`;
  await ensureOpenPeriod(client, input.operating_company_id, input.transaction_date);
  const typeColPresent = await hasJournalEntryTypeColumn(client);
  const typeId = typeColPresent
    ? await resolveJournalEntryTypeId(client, { source: "auto", memo: bankReconMemo })
    : null;
  const journalEntry = typeColPresent
    ? await client.query<{ id: string }>(
        `
      INSERT INTO accounting.journal_entries (
        operating_company_id,
        entry_date,
        memo,
        source,
        journal_entry_type_id,
        created_by_user_id,
        created_at,
        updated_at,
        -- ACCT-F353 stage 2 — banking.bank_transactions carries no is_sample_data (bank feeds aren't
        -- taggable); explicit false, matching ACCT-F212's policy (posting-engine.service.ts).
        is_sample_data
      )
      VALUES (
        $1::uuid,
        $2::date,
        $3,
        'auto',
        $4::uuid,
        $5::uuid,
        now(),
        now(),
        false
      )
      RETURNING id::text
    `,
        [input.operating_company_id, input.transaction_date, bankReconMemo, typeId, input.actor_user_uuid]
      )
    : await client.query<{ id: string }>(
        `
      INSERT INTO accounting.journal_entries (
        operating_company_id,
        entry_date,
        memo,
        source,
        created_by_user_id,
        created_at,
        updated_at,
        is_sample_data
      )
      VALUES (
        $1::uuid,
        $2::date,
        $3,
        'auto',
        $4::uuid,
        now(),
        now(),
        false
      )
      RETURNING id::text
    `,
        [input.operating_company_id, input.transaction_date, bankReconMemo, input.actor_user_uuid]
      );
  const journalEntryId = journalEntry.rows[0]?.id;
  if (!journalEntryId) throw new Error("failed_to_create_reconciliation_journal_entry");

  const cashSide = shouldDebitCash ? "debit" : "credit";
  const diffSide = shouldDebitCash ? "credit" : "debit";
  // ROUND 393.2 — the one posting-line writer. Each variance leg's real source is the bank transaction it reconciles
  // (it carried none inline before), and its spine row says so with the same role as before. A reconciliation variance
  // belongs to the bank account, not to a load: the resolver returns NULL for a bank transaction.
  // LAW 363.6 ("a match posts nothing") is NOT settled by this repoint — whether "Resolve difference" should post at the
  // match at all is flagged to the Lead (OUTBOX-CC-2, ROUND 393.2).
  const legs = [
    { account_id: cashAccountId, side: cashSide, description: "Bank reconciliation variance leg", key: `bank-recon-var:${journalEntryId}`, seq: 1 },
    { account_id: input.difference_account_id, side: diffSide, description: "Bank reconciliation offset leg", key: `bank-recon-off:${journalEntryId}`, seq: 2 },
  ] as const;
  if (input.split?.length) {
    if (input.split.reduce((a, l) => a + l.cents, 0) !== magnitude) throw new Error("card_discount_split_does_not_equal_variance");
    let seq = 0;
    for (const l of input.split) {
      for (const [account_id, side, role] of [[cashAccountId, cashSide, "card payable"], [input.difference_account_id, diffSide, "fuel cost"]] as const) {
        seq += 1;
        await insertPostingLineWithSpine(client, {
          operating_company_id: input.operating_company_id, journal_entry_uuid: journalEntryId, line_sequence: seq, account_id,
          debit_or_credit: side, amount_cents: l.cents, description: `${l.label} (${role})`,
          idempotency_key: `bank-recon-card:${journalEntryId}:${l.source_expense_id}:${side}`,
          source_transaction_type: "expense", source_transaction_id: l.source_expense_id, class_id: l.class_id,
          relationship_role: "bank_reconciliation_variance",
          spine_link: { linked_object_type: "bank_transaction", linked_object_id: input.bank_transaction_id },
        });
      }
    }
    return journalEntryId;
  }
  for (const leg of legs) {
    await insertPostingLineWithSpine(client, {
      operating_company_id: input.operating_company_id,
      journal_entry_uuid: journalEntryId,
      line_sequence: leg.seq,
      account_id: leg.account_id,
      debit_or_credit: leg.side,
      amount_cents: magnitude,
      description: leg.description,
      idempotency_key: leg.key,
      source_transaction_type: "bank_transaction",
      source_transaction_id: input.bank_transaction_id,
      relationship_role: "bank_reconciliation_variance",
    });
  }

  // CODER-12 audit-spine: write the immutable audit event for the variance posting to
  // audit.audit_events (canonical, DB-trigger immutable per the blueprint), atomic with the GL write
  // and fail-loud-SAFE (audit_events' only CHECK is severity). NOT events.log_event (its
  // valid_subject_type CHECK rejects accounting subjects -> would roll back the variance post). This
  // poster previously wrote NO audit event — CODER-12 closes that gap.
  await appendCrudAudit(
    client,
    input.actor_user_uuid,
    "accounting.bank_reconciliation.variance_posted",
    { journal_entry_id: journalEntryId, bank_transaction_id: input.bank_transaction_id, variance_cents: input.variance_cents },
    "info",
    "CODER-12-BANK-RECON-SPINE"
  );

  return journalEntryId;
}

export async function findCandidates(input: {
  operating_company_id: string;
  bank_transaction_id: string;
  actor_user_uuid?: string;
  /**
   * ROUND 207 — optional forced cascade step (1|2). Default (omit) runs Step 1 then auto-widens to
   * Step 2 only when Step 1 returns ZERO. Never advances past Step 2.
   */
  window_step?: 1 | 2;
  /**
   * Cron / rare callers only — symmetric ±days. REMOVED from the Match drawer default path
   * (no search_all→365). Measured 2026-09-26: no live cron calls findCandidates with window_days.
   */
  window_days?: number;
  /** Optional memo/payee/ref text filter (case-insensitive contains). */
  search_query?: string;
  /** BANK-MATCH-QBO filters — Show (kinds), Payee, date From/To, amount From/To. */
  kinds?: LedgerEntryKind[];
  payee?: string;
  date_from?: string;
  date_to?: string;
  amount_min_cents?: number;
  amount_max_cents?: number;
}): Promise<FindCandidatesResult> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const txn = await loadTransaction(client, input.operating_company_id, input.bank_transaction_id);
    if (!txn) {
      return {
        candidates: [],
        window: { step: 1, from: "", to: "", auto_widened: false },
        bank_amount_cents: 0,
      };
    }

    const toleranceCents = toleranceForAmount(txn.amount_cents);
    const txnAmountAbs = Math.abs(Number(txn.amount_cents ?? 0));
    const pack = (candidates: MatchCandidate[], window: MatchWindowInfo): FindCandidatesResult => ({
      candidates,
      window,
      bank_amount_cents: txnAmountAbs,
    });
    const txnMemo = `${txn.merchant_name ?? ""} ${txn.description ?? ""} ${txn.notes ?? ""}`.trim();
    const txnDate = txn.transaction_date;

    // LEAD 443.158 M1c — RELEVANCE FLOOR on the default (unfiltered) search: a document is offered only when its amount is
    // within the resolve-difference tolerance OR it resembles the line (similarity = max(memo, description, payee tokens) ≥
    // AUTO_MATCH_MEMO_SIMILARITY_MIN = 0.5, the value calibrated 2026-09-06 BANK-MATCH-QBO). Tolerance = the Q11 amount
    // tolerance (toleranceForAmount: max $1.00, 0.01%); on a card register (Dreamline: the card bills the discounted price)
    // the 443.84 card-discount cap (CARD_DISCOUNT_MAX_PCT, 8%) is the difference resolve-difference accepts. Owner case: a
    // $750.00 Zelle to a law office was offered a $2,000.00 expense of another payee (gap $1,250, similarity 0).
    // An explicit filter (dates, search, payee, kinds, amount) is the owner searching himself — no floor there.
    const cardRegister = (await client.query<{ card: boolean }>(
      `SELECT COALESCE(ca.account_subtype, '') = 'CreditCard' AS card
         FROM banking.bank_accounts ba LEFT JOIN catalogs.accounts ca ON ca.id = ba.ledger_account_id
        WHERE ba.id = $1::uuid AND ba.operating_company_id = $2::uuid`,
      [txn.bank_account_id, input.operating_company_id]
    )).rows[0]?.card === true;
    const floorToleranceCents = cardRegister
      ? Math.max(toleranceCents, Math.round((txnAmountAbs * CARD_DISCOUNT_MAX_PCT) / 100))
      : toleranceCents;
    const passesRelevanceFloor = (c: MatchCandidate) =>
      passesMatchRelevanceFloor({ amountGapCents: c.amount_gap_cents, similarity: c.memo_similarity, toleranceCents: floorToleranceCents });
    const explicitSearch = Boolean(
      input.date_from || input.date_to || (input.search_query ?? "").trim() || (input.payee ?? "").trim() ||
        (input.kinds?.length ?? 0) > 0 || input.amount_min_cents != null || input.amount_max_cents != null
    );

    const rank = (rawCandidates: RawLedgerCandidate[]): MatchCandidate[] =>
      rawCandidates
        .map((candidate) => {
          const amountGapCents = Math.abs(txnAmountAbs - candidate.amount_cents);
          const dateGapDays = daysBetween(txnDate, candidate.event_date);
          const payeeSim = payeeSimilarity(txnMemo, candidate.counterparty_name);
          const similarity = Math.max(
            memoSimilarity(txnMemo, candidate.memo),
            memoSimilarity(txnMemo, candidate.description),
            payeeSim
          );
          const autoMatch =
            amountGapCents <= toleranceCents &&
            dateGapDays <= AUTO_MATCH_DATE_WINDOW_DAYS &&
            similarity >= AUTO_MATCH_MEMO_SIMILARITY_MIN;
          const score = computeMatchScore({
            amountGapCents,
            toleranceCents,
            dateGapDays,
            similarity,
            txnAmountCents: txnAmountAbs,
          });
          return {
            ...candidate,
            amount_gap_cents: amountGapCents,
            date_gap_days: dateGapDays,
            memo_similarity: similarity,
            payee_similarity: payeeSim,
            match_score: score,
            auto_match: autoMatch,
            exact_amount: amountGapCents === 0,
          };
        })
        .filter((c) => explicitSearch || passesRelevanceFloor(c))
        .sort(compareCandidatesExactFirst)
        .slice(0, 50);

    const fetchAt = async (from: string, to: string, extra: CandidateFilters = {}) =>
      fetchLedgerCandidates(client, input.operating_company_id, txnDate, txn.is_credit, txn.bank_account_id, {
        ...extra,
        dateFrom: from,
        dateTo: to,
        searchQuery: input.search_query,
        kinds: input.kinds,
        payee: input.payee,
        amountMinCents: input.amount_min_cents,
        amountMaxCents: input.amount_max_cents,
      });

    const hasExplicitDates = Boolean(input.date_from || input.date_to);
    const hasOtherFilters = Boolean(
      (input.search_query ?? "").trim() ||
        (input.payee ?? "").trim() ||
        (input.kinds?.length ?? 0) > 0 ||
        input.amount_min_cents != null ||
        input.amount_max_cents != null
    );

    // Cron-only symmetric window — never the Match drawer default.
    if (input.window_days != null && !hasExplicitDates) {
      const days = Math.min(Math.max(Number(input.window_days) || 7, 1), MAX_CUSTOM_SPAN_DAYS);
      const from = shiftDate(txnDate, -days);
      const to = shiftDate(txnDate, days);
      const candidates = rank(await fetchAt(from, to, { windowDays: days }));
      return pack(candidates, { step: "custom", from, to, auto_widened: false });
    }

    // ANY explicit filter overrides the cascade. From/To exact; other filters use Step 2 bounds.
    if (hasExplicitDates || hasOtherFilters) {
      let from: string;
      let to: string;
      if (hasExplicitDates) {
        const step2 = boundsForStep(txnDate, 2);
        from = input.date_from ?? step2.from;
        to = input.date_to ?? step2.to;
        const clamped = clampCustomSpan(from, to);
        from = clamped.from;
        to = clamped.to;
      } else {
        ({ from, to } = boundsForStep(txnDate, 2));
      }
      const candidates = rank(await fetchAt(from, to));
      return pack(candidates, { step: "custom", from, to, auto_widened: false });
    }

    // Forced Step 2 (FE "Search 7 days") — no further auto-widen.
    if (input.window_step === 2) {
      const { from, to } = boundsForStep(txnDate, 2);
      const candidates = rank(await fetchAt(from, to));
      return pack(candidates, { step: 2, from, to, auto_widened: false });
    }

    // Forced Step 1 only (no auto-widen) when window_step === 1.
    if (input.window_step === 1) {
      const { from, to } = boundsForStep(txnDate, 1);
      const candidates = rank(await fetchAt(from, to));
      return pack(candidates, { step: 1, from, to, auto_widened: false });
    }

    // DEFAULT cascade: Step 1 → if ZERO, Step 2 with auto_widened. Never auto-advance past Step 2.
    const step1 = boundsForStep(txnDate, 1);
    const step1Ranked = rank(await fetchAt(step1.from, step1.to));
    if (step1Ranked.length > 0) {
      return pack(step1Ranked, { step: 1, from: step1.from, to: step1.to, auto_widened: false });
    }
    const step2 = boundsForStep(txnDate, 2);
    const step2Ranked = rank(await fetchAt(step2.from, step2.to));
    return pack(step2Ranked, { step: 2, from: step2.from, to: step2.to, auto_widened: true });
  });
}

/**
 * ENG-SPINE — both-way bank↔document on accept. Forward matched_* alone left the document's
 * reverse pointer null (CLS-LINKAGE-ONEWAY). Only tables that already carry a bank-line FK
 * are stamped — no new column, no invented VoidableEntityType.
 *
 *   payment         accounting.payments.source_bank_transaction_id + cleared_date
 *   bill_payment    accounting.bill_payments.source_bank_transaction_id + from_bank_account_id + cleared_date
 *   settlement      driver_finance.driver_settlements.paid_via_bank_txn_id
 *
 * expense / transfer / je / factoring_advance / fuel / relay / deposit have no reverse bank FK.
 * COALESCE keeps create/categorize/payrun provenance. Unmatch clears the same columns, scoped.
 * One helper so 1:1 accept and multi-document accept cannot drift.
 */
async function stampReverseBankPointerOnAccept(
  client: DbClient,
  args: {
    kind: LedgerEntryKind;
    ledgerEntryId: string;
    bankTransactionId: string;
    operatingCompanyId: string;
    bankAccountId: string;
    transactionDate: string;
  }
): Promise<void> {
  if (args.kind === "payment") {
    await client.query(
      `UPDATE accounting.payments
          SET source_bank_transaction_id = COALESCE(source_bank_transaction_id, $1::uuid),
              cleared_date = COALESCE(cleared_date, $4::date)
        WHERE id = $2::uuid
          AND operating_company_id = $3::uuid`,
      [args.bankTransactionId, args.ledgerEntryId, args.operatingCompanyId, args.transactionDate]
    );
    return;
  }
  if (args.kind === "bill_payment") {
    await client.query(
      `UPDATE accounting.bill_payments
          SET source_bank_transaction_id = COALESCE(source_bank_transaction_id, $1::uuid),
              from_bank_account_id = COALESCE(from_bank_account_id, $4::uuid),
              cleared_date = COALESCE(cleared_date, $5::date),
              updated_at = now()
        WHERE id = $2::uuid
          AND operating_company_id = $3::uuid`,
      [
        args.bankTransactionId,
        args.ledgerEntryId,
        args.operatingCompanyId,
        args.bankAccountId,
        args.transactionDate,
      ]
    );
    return;
  }
  if (args.kind === "settlement") {
    await client.query(
      `UPDATE driver_finance.driver_settlements
          SET paid_via_bank_txn_id = COALESCE(paid_via_bank_txn_id, $1::uuid),
              updated_at = now()
        WHERE id = $2::uuid
          AND operating_company_id = $3::uuid`,
      [args.bankTransactionId, args.ledgerEntryId, args.operatingCompanyId]
    );
    return;
  }
  if (args.kind === "relay_deposit") {
    await client.query(
      `UPDATE integrations.relay_deposits
          SET matched_bank_transaction_id = COALESCE(matched_bank_transaction_id, $1::uuid),
              updated_at = now()
        WHERE id = $2::uuid
          AND operating_company_id = $3::uuid`,
      [args.bankTransactionId, args.ledgerEntryId, args.operatingCompanyId]
    );
  }
}

/**
 * ENG-SPINE — expense accept is link + clear only (no new JE). The expense must already
 * be posted; otherwise clearing the bank line would leave the expense's own JE unrecorded.
 * 1:1 already refused unposted. Multi-document skipped the gate (CLS-LINKAGE-ONEWAY).
 * One helper so the two accept paths cannot drift.
 */
async function assertExpensePostedOnAccept(
  client: DbClient,
  operatingCompanyId: string,
  expenseId: string
): Promise<void> {
  const posted = await client.query<{ posting_status: string }>(
    `SELECT posting_status::text
       FROM accounting.expenses
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1`,
    [expenseId, operatingCompanyId]
  );
  const status = posted.rows[0]?.posting_status;
  if (!status) throw new Error("expense_not_found");
  if (status !== "posted") throw new Error("expense_not_posted");
}

/**
 * ENG-SPINE follow-up — payment accept follow-ups that 1:1 already ran and multi-document
 * skipped (CLS-LINKAGE-ONEWAY on the invoice pointer + Faro rsv deposit JE).
 *
 * ACCT-F5620: applyPayment backlinks the invoice once, at apply time, when
 * source_bank_transaction_id is still null. Re-attempt here after the reverse stamp so
 * matched_invoice_id can fill. Fill-only-NULL; never throws; never guesses when several
 * invoices share one payment.
 *
 * GO-CLOSE-188: 1090 sweep after the reverse stamp so the poster can resolve the bank.
 * OWNER-ORDER §3.1: Faro Rsv Deposits on this bank date (DR 1235 / CR due-from-affiliate).
 * Date-keyed and pending-only — N payments on one wire share one date; first call posts,
 * the rest find no pending rows.
 *
 * One helper so 1:1 and multi-document accept cannot drift.
 */
async function runPaymentAcceptFollowUps(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    paymentId: string;
    actorUserUuid: string;
    paymentDate: string;
  }
): Promise<void> {
  const invoiceRes = await client.query<{ invoice_id: string }>(
    `SELECT DISTINCT invoice_id::text AS invoice_id
       FROM accounting.payment_applications
      WHERE payment_id = $1::uuid
        AND operating_company_id = $2::uuid
        AND invoice_id IS NOT NULL`,
    [args.paymentId, args.operatingCompanyId]
  );
  await backlinkBankTransactionToInvoice(
    client,
    args.operatingCompanyId,
    args.paymentId,
    invoiceRes.rows.map((r) => r.invoice_id)
  );
  await sweepMatchedReceiptToBank(
    client,
    args.operatingCompanyId,
    "customer_payment_deposit",
    args.paymentId,
    args.actorUserUuid
  );
  await postFaroRsvDepositsOnPaymentMatch(client, {
    operating_company_id: args.operatingCompanyId,
    payment_date: args.paymentDate,
    actor_user_id: args.actorUserUuid,
    matched_payment_id: args.paymentId,
  });
}

/**
 * ENG-SPINE follow-up — bill-payment accept follow-up that neither path ran
 * (CLS-LINKAGE-ONEWAY on matched_bill_id). Payment accept already backlinked the
 * invoice (ACCT-F5620). Bill-payment accept stamped matched_bill_payment_id +
 * source_bank_transaction_id and left the bill's bank hop empty.
 *
 * accounting.bill_payments.bill_id is the one bill this cash settled. Fill-only-NULL
 * matched_bill_id after the reverse stamp so bills.service.ts (`bt.matched_bill_id`)
 * and the Banking UI can drill bank ↔ bill. Never throws. Never guesses when several
 * bills share one wire (the helper refuses). No new reverse column. No mass backfill.
 *
 * One helper so 1:1 and multi-document accept cannot drift.
 */
async function runBillPaymentAcceptFollowUps(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    billPaymentId: string;
  }
): Promise<void> {
  const billRes = await client.query<{ bill_id: string }>(
    `SELECT bill_id::text AS bill_id
       FROM accounting.bill_payments
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND bill_id IS NOT NULL
        AND voided_at IS NULL
        AND revoked_at IS NULL
      LIMIT 1`,
    [args.billPaymentId, args.operatingCompanyId]
  );
  const billId = billRes.rows[0]?.bill_id;
  if (!billId) return;
  await backlinkBankTransactionToBill(client, args.operatingCompanyId, args.billPaymentId, [billId]);
}

/**
 * OWNER-ORDER §3.1 — post the pending Faro reserve ROW on this bank line (not rsv_deposit).
 * 1:1 accept rewrites the match row to the JE. Multi-document keeps N-advance match rows and
 * skips sweep/chargeback when this helper returned a JE. One writer so the two accept paths
 * cannot drift (CLS-LINKAGE-ONEWAY on Faro posting).
 */
async function postPendingFaroReserveRowOnAccept(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    bankTransactionId: string;
    actorUserUuid: string;
  }
): Promise<{ journalEntryId: string | null; posterClearedBank: boolean }> {
  const faroEntry = await loadFaroReserveEntryForBankTxn(
    client,
    args.operatingCompanyId,
    args.bankTransactionId
  );
  if (faroEntry && faroEntry.entry_kind !== "rsv_deposit" && !faroEntry.journal_entry_id) {
    const faroPost = await postFaroReserveRowOnBankMatch(client, {
      operating_company_id: args.operatingCompanyId,
      entry_id: faroEntry.id,
      actor_user_id: args.actorUserUuid,
    });
    return { journalEntryId: faroPost.journal_entry_id, posterClearedBank: faroPost.poster_cleared_bank };
  }
  return { journalEntryId: null, posterClearedBank: false };
}

/**
 * ENG-SPINE follow-up — factoring-advance accept follow-ups that 1:1 already ran and
 * multi-document skipped (always swept 1090, never chargebacked a reserve-bank repurchase).
 *
 * OWNER-ORDER §3.1 — reserve register by accounting.chart_of_accounts_roles
 * (factor_reserve_held / factor_cash_reserve_held), never catalogs.account_role_bindings.
 *   · Faro report row on this bank line already posted → skip (do not also chargeback/sweep)
 *   · Repurchase movement on a reserve bank (no Faro entry) → postFactoringChargebackEvent
 *   · Ordinary funding wire on the operating bank → factoring_advance_deposit sweep
 *
 * One helper so 1:1 and multi-document accept cannot drift. Typical Faro purchase-batch
 * (N advances on an operating wire) still sweeps. A reserve-bank repurchase wire matched
 * to N advances chargebacks each advance. No new reverse column. No mass backfill.
 */
async function runFactoringAdvanceAcceptFollowUps(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    factoringAdvanceId: string;
    actorUserUuid: string;
    bankTransactionId: string;
    bankAccountId: string;
    faroReserveJournalEntryId: string | null;
  }
): Promise<void> {
  const reserveBank = await isFaroReserveBankAccount(
    client,
    args.operatingCompanyId,
    args.bankAccountId
  );
  if (reserveBank && args.faroReserveJournalEntryId) {
    return;
  }
  if (reserveBank) {
    const amounts = await loadExactLinkedChargebackAmountsOnClient(
      client,
      args.operatingCompanyId,
      args.factoringAdvanceId
    );
    const cb = await postFactoringChargebackEvent({
      operating_company_id: args.operatingCompanyId,
      factoring_advance_id: args.factoringAdvanceId,
      actor_user_id: args.actorUserUuid,
      chargeback_amount_cents: amounts.liability_cents,
      default_interest_cents: 0,
      recoursed_ar_cents: amounts.recoursed_ar_cents,
      client,
    });
    if (!cb.posted) {
      throw new Error(`factoring_recourse_post_failed:${cb.reason ?? "unknown"}`);
    }
    if (cb.journal_entry_id) {
      await client.query(
        `UPDATE banking.bank_transactions
            SET matched_journal_entry_id = COALESCE(matched_journal_entry_id, $3::uuid),
                updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [args.bankTransactionId, args.operatingCompanyId, cb.journal_entry_id]
      );
    }
    return;
  }
  await sweepMatchedReceiptToBank(
    client,
    args.operatingCompanyId,
    "factoring_advance_deposit",
    args.factoringAdvanceId,
    args.actorUserUuid
  );
}

/**
 * ROUND 315 OWNER-ONLY LAW: matching a bank deposit to a factoring purchase is the Owner's act alone. Runs in its own
 * committed transaction BEFORE the match transaction, so the refusal's audit row survives the thrown 403.
 */
async function assertOwnerMayMatchFactoringPurchase(
  operatingCompanyId: string,
  actorUserUuid: string,
  kinds: LedgerEntryKind[],
  bankTransactionId: string
): Promise<void> {
  if (!kinds.includes("factoring_advance")) return;
  const ok = await withLuciaBypass((client) =>
    checkFactoringPurchaseOwner(client, {
      operatingCompanyId,
      userUuid: actorUserUuid,
      action: "bank_match",
      targetId: bankTransactionId,
    })
  );
  if (!ok) throw new FactoringPurchaseOwnerOnlyError("bank_match");
}

export async function acceptMatchWithResolveDifference(input: ResolveDifferenceInput): Promise<ResolveDifferenceResult> {
  await assertOwnerMayMatchFactoringPurchase(input.operating_company_id, input.actor_user_uuid, [input.ledger_entry_kind], input.bank_transaction_id);
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    // ACCT-F5647 — FOR UPDATE, locking this bank transaction for the entire accept-match flow below.
    const txn = await loadTransaction(client, input.operating_company_id, input.bank_transaction_id, true);
    if (!txn) {
      throw new Error("bank_transaction_not_found");
    }

    // BANK-RECON-ACCEPT-MATCH-500 — a reconciled session is a closed period. The database trigger
    // already rejects the later bank_transactions UPDATE, but without the shared application gate
    // an otherwise-valid exact candidate surfaced as a generic 500. Assert before any match, link,
    // or GL write so the path returns the canonical conflict without relying on late rollback.
    await assertBankTxnNotInReconciledSession(client, input.bank_transaction_id, input.operating_company_id);

    // Only persist kinds the reconciliation_matches CHECK constraint permits (Part 2a widened it to
    // include 'expense'). 'bill' is a read-only suggestion — accepting it is Part 2b (CHAIN-04).
    if (!PERSISTABLE_MATCH_KINDS.has(input.ledger_entry_kind)) {
      throw new Error(`match_kind_not_acceptable:${input.ledger_entry_kind}`);
    }
    await refuseReceiptAlreadyOnADeposit(client, input.operating_company_id, input.ledger_entry_kind, input.ledger_entry_id);

    // ENG-MATCH: already-matched is a live document pointer (or review_state='matched').
    // review_state alone was the hole — a for_review row with matched_payment_id could rematch.
    if (txn.review_state === "matched" || bankLineHasLiveDocumentPointer(txn)) {
      throw new Error("bank_transaction_already_matched");
    }

    if (input.ledger_entry_kind === "expense") {
      await assertExpensePostedOnAccept(client, input.operating_company_id, input.ledger_entry_id);
    }

    // OWNER-ORDER §3.1 / CC-2 handoff — Faro reserve ROW on this bank line posts through
    // postPendingFaroReserveRowOnAccept BEFORE storeMatch so the match row points at the JE the
    // poster stamped (purchase funding JE for escrow_held; new JE for other kinds).
    // rsv_deposit refuses here and posts with the payment match via faroReserveDepositsOn.
    let matchKind: LedgerEntryKind = input.ledger_entry_kind;
    let matchLedgerEntryId = input.ledger_entry_id;
    const faroPosted = await postPendingFaroReserveRowOnAccept(client, {
      operatingCompanyId: input.operating_company_id,
      bankTransactionId: input.bank_transaction_id,
      actorUserUuid: input.actor_user_uuid,
    });
    const faroReserveJournalEntryId = faroPosted.journalEntryId;
    const faroPosterClearedBank = faroPosted.posterClearedBank;
    if (faroReserveJournalEntryId) {
      matchKind = "je";
      matchLedgerEntryId = faroReserveJournalEntryId;
      // escrow_held: if the operator picked a JE, it must be the purchase funding JE.
      if (
        input.ledger_entry_kind === "je" &&
        input.ledger_entry_id !== faroReserveJournalEntryId
      ) {
        throw new Error(
          `faro_reserve_je_mismatch:expected=${faroReserveJournalEntryId}:got=${input.ledger_entry_id}`
        );
      }
    }

    const ledgerAmountAbs = faroReserveJournalEntryId
      ? Math.abs(Number(txn.amount_cents ?? 0))
      : await loadLedgerAmountCents(client, input.operating_company_id, matchKind, matchLedgerEntryId);
    const txnAmountAbs = Math.abs(Number(txn.amount_cents ?? 0));
    const varianceCents = txnAmountAbs - ledgerAmountAbs;
    const toleranceCents = toleranceForAmount(txn.amount_cents);
    const similarity = memoSimilarity(`${txn.merchant_name ?? ""} ${txn.description ?? ""}`, matchKind);
    const score = computeMatchScore({
      amountGapCents: Math.abs(varianceCents),
      toleranceCents,
      dateGapDays: 0,
      similarity,
      txnAmountCents: txnAmountAbs,
    });

    const reconciliationMatchId = await storeMatch(client, {
      operating_company_id: input.operating_company_id,
      bank_transaction_id: input.bank_transaction_id,
      ledger_entry_kind: matchKind,
      ledger_entry_id: matchLedgerEntryId,
      match_score: score,
      match_state: "user_matched",
      actor_user_uuid: input.actor_user_uuid,
    });

    // ROUND 185 — the ONLY place a banking.reconciliation_matches row gets a real, attributable
    // "this went through the accept handler" record. audit.row_changes' own trigger on this table
    // reads changed_by_user_id from a session var withLuciaBypass never sets, so it is NULL on
    // every row regardless of path (verified live) — useless for telling a real accept apart from
    // a raw INSERT. This event, with the actor passed explicitly (never a session var), is what
    // verify-no-match-persisted-outside-accept-handler.mjs checks for instead.
    await appendCrudAudit(
      client,
      input.actor_user_uuid,
      "bank_match.accepted",
      {
        reconciliation_match_id: reconciliationMatchId,
        bank_transaction_id: input.bank_transaction_id,
        ledger_entry_kind: matchKind,
        ledger_entry_id: matchLedgerEntryId,
      },
      "info",
      "BANK-RECON-ACCEPT-HANDLER"
    );

    const journalEntryId = await postDifferenceJournalEntry(client, {
      operating_company_id: input.operating_company_id,
      bank_transaction_id: input.bank_transaction_id,
      bank_account_id: txn.bank_account_id,
      difference_account_id: input.difference_account_id,
      actor_user_uuid: input.actor_user_uuid,
      transaction_date: txn.transaction_date,
      variance_cents: varianceCents,
      is_credit: txn.is_credit,
    });

    // ROUND 288.2 / ACCT-F9335 — fuel fill posts HERE (same transaction as the match). Import posts nothing.
    // Stamp matched_journal_entry_id with the fuel JE so unmatch reverses through the one void engine.
    let fuelJournalEntryId: string | null = null;
    if (matchKind === "fuel_transaction" || matchKind === "relay_fuel") {
      const fuelPost = await postFuelFillOnBankMatch(client, {
        operating_company_id: input.operating_company_id,
        actor_user_uuid: input.actor_user_uuid,
        kind: matchKind,
        fill_id: matchLedgerEntryId,
      });
      fuelJournalEntryId = fuelPost.journal_entry_id;
    }

    // Clear the bank line: mark it 'matched' + stamp the denormalized matched_<kind>_id so the
    // worklist and the Accounting Bills/Expenses lists show status without re-deriving from
    // banking.reconciliation_matches. Column name comes from a fixed whitelist (never user input).
    // Kinds without a matched_* column still get the match + audit above; they do NOT flip
    // review_state here — verify-matched-state-requires-matched-id forbids a
    // review_state='matched' write with no matched_*_id in the same statement.
    // Faro poster already stamped review_state + matched_journal_entry_id — do not re-clear.
    const matchedColumn = MATCHED_COLUMN_BY_KIND[matchKind];
    if (matchedColumn && !faroPosterClearedBank) {
      // ACCT-F5647 — belt-and-suspenders alongside the row lock above: WHERE review_state <> 'matched',
      // with the zero-row result surfaced as the same already-matched error the earlier read-based
      // check already returns, matching payments.routes.ts's own ACCT-F5636 pattern.
      // Fuel/relay: also stamp matched_journal_entry_id in the SAME statement as review_state='matched'.
      const matchJeStamp = fuelJournalEntryId ?? faroReserveJournalEntryId;
      const cleared = matchJeStamp
        ? await client.query(
            `UPDATE banking.bank_transactions
                SET review_state = 'matched',
                    reviewed_at = now(),
                    categorized_by_user_id = $4::uuid,
                    categorized_at = now(),
                    updated_at = now(),
                    ${matchedColumn} = $3::uuid,
                    matched_journal_entry_id = $5::uuid
              WHERE id = $1::uuid
                AND operating_company_id = $2::uuid
                AND review_state <> 'matched'`,
            [
              input.bank_transaction_id,
              input.operating_company_id,
              matchLedgerEntryId,
              input.actor_user_uuid,
              matchJeStamp,
            ]
          )
        : await client.query(
            `UPDATE banking.bank_transactions
                SET review_state = 'matched',
                    reviewed_at = now(),
                    categorized_by_user_id = $4::uuid,
                    categorized_at = now(),
                    updated_at = now(),
                    ${matchedColumn} = $3::uuid
              WHERE id = $1::uuid
                AND operating_company_id = $2::uuid
                AND review_state <> 'matched'`,
            [input.bank_transaction_id, input.operating_company_id, matchLedgerEntryId, input.actor_user_uuid]
          );
      if (cleared.rowCount === 0) {
        throw new Error("bank_transaction_already_matched");
      }
      // ROUND 360 — declare HOW the line got here: it was LINKED to a document that already existed. The classifier
      // trigger keeps a declared kind; without it, a line that once carried a categorization account would be labelled
      // 'added' and Undo would remove a document this match never created. Same transaction as the clearing UPDATE.
      await client.query(
        `UPDATE banking.bank_transactions SET resolution_kind = 'matched'
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [input.bank_transaction_id, input.operating_company_id]
      );
    } else if (faroPosterClearedBank) {
      await client.query(
        `UPDATE banking.bank_transactions
            SET categorized_by_user_id = COALESCE(categorized_by_user_id, $3::uuid),
                categorized_at = COALESCE(categorized_at, now()),
                updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [input.bank_transaction_id, input.operating_company_id, input.actor_user_uuid]
      );
    }

    // WAVE-H3 (LINK-007/008) + ENG-SPINE: reverse stamp money → bank for every persistable kind
    // that already has a reverse bank FK. Forward-only matched_* left payments /
    // bill_payments.source_bank_transaction_id and settlements.paid_via_bank_txn_id null
    // (CLS-LINKAGE-ONEWAY). COALESCE keeps create/categorize/payrun provenance. No mass backfill.
    //
    // BANK-F26053 (THREE-DATES-COVERAGE-GAP follow-up, 2026-09-08): this is THE reconciliation
    // match-accept moment — cleared_date (added by migration 202613310400 specifically "until a
    // matching bank transaction clears it") belongs here, not only on the two bank-feed-driven
    // creation paths verify-three-dates-cleared-date.mjs already covers. COALESCE so a payment
    // already cleared via one of those direct-creation paths keeps its own timestamp; only a
    // payment created BEFORE its bank transaction cleared (the ordinary case) gets stamped here,
    // using the bank's own transaction_date — never re-dating payment_date (issued) itself.
    await stampReverseBankPointerOnAccept(client, {
      kind: matchKind,
      ledgerEntryId: matchLedgerEntryId,
      bankTransactionId: input.bank_transaction_id,
      operatingCompanyId: input.operating_company_id,
      bankAccountId: txn.bank_account_id,
      transactionDate: txn.transaction_date.slice(0, 10),
    });

    if (matchKind === "payment") {
      await runPaymentAcceptFollowUps(client, {
        operatingCompanyId: input.operating_company_id,
        paymentId: matchLedgerEntryId,
        actorUserUuid: input.actor_user_uuid,
        paymentDate: txn.transaction_date.slice(0, 10),
      });
    } else if (matchKind === "factoring_advance") {
      await runFactoringAdvanceAcceptFollowUps(client, {
        operatingCompanyId: input.operating_company_id,
        factoringAdvanceId: matchLedgerEntryId,
        actorUserUuid: input.actor_user_uuid,
        bankTransactionId: input.bank_transaction_id,
        bankAccountId: txn.bank_account_id,
        faroReserveJournalEntryId,
      });
    } else if (matchKind === "bill_payment") {
      await runBillPaymentAcceptFollowUps(client, {
        operatingCompanyId: input.operating_company_id,
        billPaymentId: matchLedgerEntryId,
      });
    }

    const cashBasisRevenueCents = computeCashBasisRevenueFromActualCashHit({
      bankAmountCents: txnAmountAbs,
      ledgerAmountCents: ledgerAmountAbs,
      asOfDate: txn.transaction_date.slice(0, 10),
    });

    return {
      variance_cents: varianceCents,
      difference_posted: varianceCents !== 0,
      journal_entry_id: fuelJournalEntryId ?? faroReserveJournalEntryId ?? journalEntryId,
      cash_basis_revenue_cents: cashBasisRevenueCents,
    };
  });
}

/**
 * ROUND 186 — multi-document exact accept (Faro purchase-batch = one wire).
 *
 * One bank wire clears N factoring advances whose nets SUM to the wire exactly (zero variance).
 * Each advance gets its own reconciliation_matches row + bank_match.accepted audit (same as the
 * 1:1 handler). The bank line is cleared once. Variance ≠ 0 refuses — those go to Resolve.
 *
 * Must go through storeMatch + appendCrudAudit here (same primitives as
 * acceptMatchWithResolveDifference) so verify-no-match-persisted-outside-accept-handler stays green.
 */
/**
 * ROUND 326 queue item 12 (G-06) — THE deposit sweep for a matched receipt: moves a customer payment / factoring advance
 * out of its holding account (1090 Undeposited Funds / cash_clearing) into the matched bank's ledger account, on the
 * caller's transaction. Skips ONLY a receipt that genuinely needs no sweep (already at the bank, ineligible / voided,
 * QBO-origin under parallel books). A missing bank ledger account or clearing mapping is NOT skipped any more: the
 * money is at the bank, and skipping left it in 1090 with no GL trail — the match refuses by name instead.
 */
export const DEPOSIT_SWEEP_SKIPPABLE = ["DEPOSIT_ALREADY_AT_BANK", "PAYMENT_NOT_POSTING_ELIGIBLE", "QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED"] as const;

async function sweepMatchedReceiptToBank(
  client: Parameters<typeof postSourceTransactionInClientTx>[0],
  operatingCompanyId: string,
  sourceType: "customer_payment_deposit" | "factoring_advance_deposit",
  ledgerEntryId: string,
  actorUserUuid: string
): Promise<void> {
  // ROUND 360 — an unmatch reverses the sweep it created; re-matching must RE-post, not hand back the reversed batch
  // (BANK-F05's pattern: the revision is the number of this source's entries already reversed).
  const reversed = await client.query<{ n: string }>(
    `SELECT COUNT(DISTINCT je.id)::text AS n
       FROM accounting.journal_entries je
       JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id AND p.operating_company_id = je.operating_company_id
      WHERE je.operating_company_id = $1::uuid
        AND p.source_transaction_type = $2
        AND p.source_transaction_id::text = $3
        AND je.reversed_by_je_id IS NOT NULL`,
    [operatingCompanyId, sourceType, ledgerEntryId]
  );
  const reversedCount = Number(reversed.rows[0]?.n ?? 0);
  try {
    await postSourceTransactionInClientTx(
      client,
      {
        operating_company_id: operatingCompanyId,
        source_transaction_type: sourceType,
        source_transaction_id: ledgerEntryId,
        ...(reversedCount > 0 ? { posting_purpose: "repost" as const, repost_revision: reversedCount } : {}),
      },
      { userId: actorUserUuid }
    );
  } catch (sweepError) {
    if (!(sweepError instanceof PostingEngineError) || !(DEPOSIT_SWEEP_SKIPPABLE as readonly string[]).includes(sweepError.code)) {
      throw sweepError;
    }
  }
}

export async function acceptExactMultiDocumentMatch(input: {
  operating_company_id: string;
  bank_transaction_id: string;
  actor_user_uuid: string;
  entries: Array<{ ledger_entry_kind: LedgerEntryKind; ledger_entry_id: string }>;
  /** LEAD 443.84 #3: a fuel-CARD line paying its receipt(s) at the card's discounted price — the difference posts as the
   *  item "Fuel Card Discount" (Dr the card payable / Cr the item's account), capped at CARD_DISCOUNT_MAX_PCT. */
  card_discount?: boolean;
}): Promise<{
  variance_cents: number;
  match_ids: string[];
  cleared_matched_column: string | null;
  cleared_ledger_entry_id: string | null;
}> {
  if (!input.entries.length) throw new Error("multi_match_requires_entries");
  await assertOwnerMayMatchFactoringPurchase(
    input.operating_company_id,
    input.actor_user_uuid,
    input.entries.map((e) => e.ledger_entry_kind),
    input.bank_transaction_id
  );

  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const txn = await loadTransaction(client, input.operating_company_id, input.bank_transaction_id, true);
    if (!txn) throw new Error("bank_transaction_not_found");
    await assertBankTxnNotInReconciledSession(client, input.bank_transaction_id, input.operating_company_id);
    if (txn.review_state === "matched" || bankLineHasLiveDocumentPointer(txn)) {
      throw new Error("bank_transaction_already_matched");
    }

    for (const entry of input.entries) {
      if (!PERSISTABLE_MATCH_KINDS.has(entry.ledger_entry_kind)) {
        throw new Error(`match_kind_not_acceptable:${entry.ledger_entry_kind}`);
      }
      await refuseReceiptAlreadyOnADeposit(client, input.operating_company_id, entry.ledger_entry_kind, entry.ledger_entry_id);
      if (entry.ledger_entry_kind === "expense") {
        await assertExpensePostedOnAccept(client, input.operating_company_id, entry.ledger_entry_id);
      }
    }

    for (const entry of input.entries) {
      if (
        entry.ledger_entry_kind === "fuel_transaction" ||
        entry.ledger_entry_kind === "relay_fuel" ||
        entry.ledger_entry_kind === "relay_deposit"
      ) {
        throw new Error("multi_match_fuel_not_supported:match_fuel_fills_one_at_a_time");
      }
    }

    let ledgerSum = 0;
    const amounts: number[] = [];
    for (const entry of input.entries) {
      const amt = await loadLedgerAmountCents(
        client,
        input.operating_company_id,
        entry.ledger_entry_kind,
        entry.ledger_entry_id
      );
      amounts.push(amt);
      ledgerSum += amt;
    }

    const txnAmountAbs = Math.abs(Number(txn.amount_cents ?? 0));
    const varianceCents = txnAmountAbs - ledgerSum;
    let cardDiscountJournalEntryId: string | null = null;
    if (varianceCents !== 0 && input.card_discount) {
      const split = await cardDiscountShares(client, {
        operating_company_id: input.operating_company_id, bank_account_id: txn.bank_account_id, is_credit: Boolean(txn.is_credit),
        variance_cents: varianceCents, ledger_sum_cents: ledgerSum,
        members: input.entries.map((e, i) => ({ kind: e.ledger_entry_kind, id: e.ledger_entry_id, amount_cents: amounts[i]! })),
      });
      // The card discount IS this match's variance: posted by the one variance poster (reversed on unmatch through its
      // bank_reconciliation_variance link), Dr the card payable / Cr the item's account, one pair per receipt.
      cardDiscountJournalEntryId = await postDifferenceJournalEntry(client, {
        operating_company_id: input.operating_company_id, bank_transaction_id: input.bank_transaction_id, bank_account_id: txn.bank_account_id,
        difference_account_id: split.difference_account_id, actor_user_uuid: input.actor_user_uuid, transaction_date: txn.transaction_date,
        variance_cents: varianceCents, is_credit: Boolean(txn.is_credit), split: split.legs,
      });
      await appendCrudAudit(client, input.actor_user_uuid, "bank_match.card_discount_posted", {
        bank_transaction_id: input.bank_transaction_id, journal_entry_id: cardDiscountJournalEntryId, discount_cents: split.discount_cents,
        item: FUEL_CARD_DISCOUNT_ITEM, item_id: split.item_id, legs: split.legs,
      }, "info", "443.84-CARD-DISCOUNT");
    } else if (varianceCents !== 0) {
      throw new Error(`multi_match_nonzero_variance:${varianceCents}`);
    }

    // OWNER-ORDER §3.1 — post a pending Faro reserve ROW once on this bank line.
    // Do NOT rewrite each multi entry to je (keep N-advance linkage). Follow-ups
    // skip sweep/chargeback when this returned a JE.
    const faroPosted = await postPendingFaroReserveRowOnAccept(client, {
      operatingCompanyId: input.operating_company_id,
      bankTransactionId: input.bank_transaction_id,
      actorUserUuid: input.actor_user_uuid,
    });
    const faroReserveJournalEntryId = faroPosted.journalEntryId;
    const faroPosterClearedBank = faroPosted.posterClearedBank;

    const toleranceCents = toleranceForAmount(txn.amount_cents);
    const txnMemo = `${txn.merchant_name ?? ""} ${txn.description ?? ""}`.trim();
    const matchIds: string[] = [];

    for (let i = 0; i < input.entries.length; i++) {
      const entry = input.entries[i]!;
      const score = computeMatchScore({
        amountGapCents: 0,
        toleranceCents,
        dateGapDays: 0,
        similarity: Math.max(memoSimilarity(txnMemo, "FARO FACTORING"), 0.5),
        txnAmountCents: txnAmountAbs,
      });
      const reconciliationMatchId = await storeMatch(client, {
        operating_company_id: input.operating_company_id,
        bank_transaction_id: input.bank_transaction_id,
        ledger_entry_kind: entry.ledger_entry_kind,
        ledger_entry_id: entry.ledger_entry_id,
        match_score: score,
        match_state: "user_matched",
        actor_user_uuid: input.actor_user_uuid,
      });
      await appendCrudAudit(
        client,
        input.actor_user_uuid,
        "bank_match.accepted",
        {
          reconciliation_match_id: reconciliationMatchId,
          bank_transaction_id: input.bank_transaction_id,
          ledger_entry_kind: entry.ledger_entry_kind,
          ledger_entry_id: entry.ledger_entry_id,
          multi_document: true,
          multi_document_count: input.entries.length,
          entry_amount_cents: amounts[i],
        },
        "info",
        "BANK-RECON-ACCEPT-HANDLER"
      );
      matchIds.push(reconciliationMatchId);
    }

    // ROUND 326 queue item 12 (G-06) + ENG-SPINE: every persistable kind that has a reverse bank
    // FK gets the same stamp the 1:1 accept writes (payment / bill_payment / settlement). A batch
    // wire matched to several receipts also moves EVERY receipt out of 1090 — before this, the
    // multi-match stored the matches and cleared the bank line but posted no sweep, so each
    // advance's funding debit (and each payment) stayed in Undeposited Funds forever. Advances
    // are found by their own reconciliation match row (the sweep's second lookup).
    for (const entry of input.entries) {
      await stampReverseBankPointerOnAccept(client, {
        kind: entry.ledger_entry_kind,
        ledgerEntryId: entry.ledger_entry_id,
        bankTransactionId: input.bank_transaction_id,
        operatingCompanyId: input.operating_company_id,
        bankAccountId: txn.bank_account_id,
        transactionDate: txn.transaction_date.slice(0, 10),
      });
      if (entry.ledger_entry_kind === "payment") {
        await runPaymentAcceptFollowUps(client, {
          operatingCompanyId: input.operating_company_id,
          paymentId: entry.ledger_entry_id,
          actorUserUuid: input.actor_user_uuid,
          paymentDate: txn.transaction_date.slice(0, 10),
        });
      } else if (entry.ledger_entry_kind === "factoring_advance") {
        await runFactoringAdvanceAcceptFollowUps(client, {
          operatingCompanyId: input.operating_company_id,
          factoringAdvanceId: entry.ledger_entry_id,
          actorUserUuid: input.actor_user_uuid,
          bankTransactionId: input.bank_transaction_id,
          bankAccountId: txn.bank_account_id,
          faroReserveJournalEntryId,
        });
      } else if (entry.ledger_entry_kind === "bill_payment") {
        await runBillPaymentAcceptFollowUps(client, {
          operatingCompanyId: input.operating_company_id,
          billPaymentId: entry.ledger_entry_id,
        });
      }
    }

    // Stamp the first entry's clear-column (multi-doc has one bank line → one denormalized FK).
    // Faro poster already set review_state='matched' + matched_journal_entry_id — still stamp
    // the first advance pointer so the worklist keeps N-advance linkage.
    const first = input.entries[0]!;
    const matchedColumn = MATCHED_COLUMN_BY_KIND[first.ledger_entry_kind] ?? null;
    if (matchedColumn && faroPosterClearedBank) {
      await client.query(
        `UPDATE banking.bank_transactions
            SET ${matchedColumn} = COALESCE(${matchedColumn}, $3::uuid),
                categorized_by_user_id = COALESCE(categorized_by_user_id, $4::uuid),
                categorized_at = COALESCE(categorized_at, now()),
                updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [input.bank_transaction_id, input.operating_company_id, first.ledger_entry_id, input.actor_user_uuid]
      );
    } else if (matchedColumn) {
      const cleared = await client.query(
        `UPDATE banking.bank_transactions
            SET review_state = 'matched', resolution_kind = 'matched',
                reviewed_at = now(),
                categorized_by_user_id = $4::uuid,
                categorized_at = now(),
                updated_at = now(),
                ${matchedColumn} = $3::uuid
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND review_state <> 'matched'`,
        [input.bank_transaction_id, input.operating_company_id, first.ledger_entry_id, input.actor_user_uuid]
      );
      if (cleared.rowCount === 0) throw new Error("bank_transaction_already_matched");
    }

    return {
      variance_cents: 0,
      match_ids: matchIds,
      cleared_matched_column: matchedColumn,
      cleared_ledger_entry_id: matchedColumn ? first.ledger_entry_id : null,
    };
  });
}

export async function previewMatchVariance(input: {
  operating_company_id: string;
  bank_transaction_id: string;
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_id: string;
}): Promise<MatchVariancePreview> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const txn = await loadTransaction(client, input.operating_company_id, input.bank_transaction_id);
    if (!txn) throw new Error("bank_transaction_not_found");
    const ledgerAmountAbs = await loadLedgerAmountCents(client, input.operating_company_id, input.ledger_entry_kind, input.ledger_entry_id);
    const txnAmountAbs = Math.abs(Number(txn.amount_cents ?? 0));
    return {
      variance_cents: txnAmountAbs - ledgerAmountAbs,
      bank_amount_cents: txnAmountAbs,
      ledger_amount_cents: ledgerAmountAbs,
    };
  });
}

/**
 * G6 (LEAD 443.78 / 443.80 #3) — the SUGGESTED match of every unmatched bank line, READ ONLY. OWNER LAW B (2026-09-12,
 * permanent): "it should never automatch, it suggests and we accept it or change the transactions" — nothing here is persisted
 * (no reconciliation_matches row, no bank-line pointer, no status): the suggestion is the Match drawer's own live candidate
 * search (findCandidates) ranked by the decided rules, and the owner accepts or changes it through the existing accept path.
 * Ranking (443.80 #3): an expense and its own Relay fill are ONE purchase -> the EXPENSE, compared fee-inclusive; a Relay fill
 * is compared fee-inclusive too; a Relay deposit line -> its Relay deposit document by its wallet leg; several exact documents
 * -> all returned, none preselected; no exact amount / no candidate -> returned with the reason.
 */
export type SuggestionOutcome =
  | { bank_transaction_id: string; result: "suggested"; ledger_entry_kind: LedgerEntryKind; ledger_entry_id: string; reference: string | null; variance_cents?: number; within_card_cap?: boolean; reason?: string }
  | { bank_transaction_id: string; result: "already_suggested_or_matched" }
  | { bank_transaction_id: string; result: "several"; documents: string[] }
  | { bank_transaction_id: string; result: "group"; ledger_entry_kind: LedgerEntryKind; ledger_entry_id: string; reference: string | null; members: string[]; variance_cents: number; within_card_cap?: boolean; reason?: string }
  | { bank_transaction_id: string; result: "none"; reason: "no_candidate" | "no_exact_amount" | "several_exact_documents" | "document_held_by_another_line" | "document_competes_with_another_line" | "categorize_no_document" | "error"; detail?: string };

export async function suggestBankMatches(input: {
  operating_company_id: string;
  bank_account_id?: string | null;
  actor_user_uuid?: string;
}): Promise<{ lines: number; suggested: number; outcomes: SuggestionOutcome[] }> {
  const lines = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    return (await client.query<{ id: string; amount_cents: number; held: boolean; description: string | null; d: string; ledger_account_id: string | null; account_name: string | null }>(
      `SELECT bt.id::text, bt.amount_cents::int, bt.description, bt.transaction_date::text AS d,
              (SELECT ba.account_name FROM banking.bank_accounts ba WHERE ba.id = bt.bank_account_id) AS account_name,
              (SELECT ba.ledger_account_id::text FROM banking.bank_accounts ba WHERE ba.id = bt.bank_account_id) AS ledger_account_id,
              EXISTS (SELECT 1 FROM banking.reconciliation_matches m
                       WHERE m.bank_transaction_id = bt.id AND m.voided_at IS NULL AND m.match_state IN ('auto_matched', 'user_matched')) AS held
         FROM banking.bank_transactions bt
        WHERE bt.operating_company_id = $1::uuid AND bt.voided_at IS NULL
          AND ($2::uuid IS NULL OR bt.bank_account_id = $2::uuid)
          AND bt.review_state IS DISTINCT FROM 'matched' AND bt.status::text <> 'categorized'
        ORDER BY bt.transaction_date, bt.created_at`,
      [input.operating_company_id, input.bank_account_id ?? null])).rows;
  });
  const outcomes: SuggestionOutcome[] = [];
  // Six lines at a time (findCandidates is the drawer's full candidate search, ~1-2 s per line).
  let next = 0;
  const worker = async () => { while (next < lines.length) { const line = lines[next++]!; await suggestOne(line); } };
  const suggestOne = async (line: { id: string; amount_cents: number; held: boolean; description: string | null; d: string; ledger_account_id: string | null; account_name: string | null }) => {
    if (line.held) { outcomes.push({ bank_transaction_id: line.id, result: "already_suggested_or_matched" }); return; }
    try {
      const found = await findCandidates({ operating_company_id: input.operating_company_id, bank_transaction_id: line.id });
      // A fuel-CARD line (Dreamline) carries the card's discounted price, the document the pump receipt: measured 2026-10-12 the
      // statement runs a median 3.6% under the document (p10 -10.3%, p90 +0.1%) and carries no invoice. When no document equals the
      // line, the same-store document of the card's own ledger account inside the card-pricing band is the suggestion, with its
      // variance shown — the human accept resolves the difference (acceptMatchWithResolveDifference); nothing is decided here.
      // LEAD 443.81 #3a: a card statement line is ONE purchase = the documents that share its invoice (diesel + DEF + reefer are
      // separate expenses of the same receipt). Candidate GROUPS: the card ledger account's own fuel expenses at the line's store
      // city, dated -2..+1, grouped by the base invoice; the group whose sum fits the line (card pricing: max(3.00, 12%)) is the
      // suggestion — one member = a single suggestion, more = a group suggestion with its members; variance shown.
      const cardVariance = async (): Promise<boolean> => {
        const store = /\s([A-Z][A-Z.'-]+)\s+([A-Z]{2})\s*$/.exec(String(line.description ?? "").toUpperCase().trim());
        if (!store || !line.ledger_account_id) return false;
        const groups = await withLuciaBypass(async (client) => (await client.query<{ inv: string; ids: string[]; refs: string[]; amt: number }>(
          `SELECT regexp_replace(btrim(coalesce(ft.transaction_reference, e.id::text)), '-1[0-9]{4}$', '') AS inv,
                  array_agg(e.id::text ORDER BY e.total_amount_cents DESC) AS ids, array_agg(coalesce(e.expense_number, '') ORDER BY e.total_amount_cents DESC) AS refs,
                  sum(e.total_amount_cents)::int AS amt
             FROM accounting.expenses e JOIN fuel.fuel_transactions ft ON ft.id = e.source_fuel_transaction_id
            WHERE e.operating_company_id = $1::uuid AND e.payment_account_uuid = $2::uuid AND e.voided_at IS NULL AND ft.voided_at IS NULL
              AND e.transaction_date BETWEEN $3::date - 2 AND $3::date + 1
              AND upper(coalesce(ft.location_city, '')) LIKE '%' || $4 || '%'
              AND NOT EXISTS (SELECT 1 FROM banking.reconciliation_matches m WHERE m.ledger_entry_kind = 'expense' AND m.ledger_entry_id = e.id
                                AND m.voided_at IS NULL AND m.match_state IN ('auto_matched', 'user_matched'))
            GROUP BY 1`,
          [input.operating_company_id, line.ledger_account_id, line.d, store[1]])).rows);
        const bank = Math.abs(Number(line.amount_cents));
        const band = (amt: number) => Math.abs(amt - bank) <= Math.max(300, Math.round(amt * 0.12));
        let fits = groups.filter((g) => band(g.amt));
        // Measured 2026-10-12: the Dreamline statement prints each PRODUCT of a receipt as its own line (Palestine AR 08-07:
        // DEF 67.86 and diesel 690.12 are two lines). When no whole receipt fits, the receipt's member that fits is the suggestion.
        if (!fits.length) {
          const members = await withLuciaBypass(async (client) => (await client.query<{ id: string; ref: string | null; amt: number }>(
            `SELECT e.id::text, e.expense_number AS ref, e.total_amount_cents::int AS amt FROM accounting.expenses e WHERE e.id = ANY($1::uuid[])`,
            [groups.flatMap((g) => g.ids)])).rows);
          fits = members.filter((m) => band(m.amt)).map((m) => ({ inv: m.ref ?? m.id, ids: [m.id], refs: [m.ref ?? ""], amt: m.amt }));
        }
        // the one equal to the cent wins over the band
        const exactG = fits.filter((g) => g.amt === bank);
        const pick = exactG.length === 1 ? [exactG[0]!] : fits;
        if (pick.length === 1) {
          const g = pick[0]!;
          // 443.84 #3: acceptable with the card discount only at or below the receipt and within the cap.
          const within = g.amt >= bank && (g.amt - bank) * 100 <= g.amt * CARD_DISCOUNT_MAX_PCT;
          if (g.ids.length === 1) outcomes.push({ bank_transaction_id: line.id, result: "suggested", ledger_entry_kind: "expense", ledger_entry_id: g.ids[0]!, reference: g.refs[0] || null, variance_cents: bank - g.amt, within_card_cap: within });
          else outcomes.push({ bank_transaction_id: line.id, result: "group", ledger_entry_kind: "expense", ledger_entry_id: g.ids[0]!, reference: `invoice ${g.inv}`,
            members: g.ids.map((id) => `expense:${id}`), variance_cents: bank - g.amt, within_card_cap: within });
          return true;
        }
        if (pick.length > 1) { outcomes.push({ bank_transaction_id: line.id, result: "several", documents: pick.map((g) => `invoice ${g.inv}: ` + g.ids.map((id) => `expense:${id}`).join("+")) }); return true; }
        return false;
      };
      // LEAD 443.81 #3b — the operating bank (not a card): a payment to a driver is the settlement NET (its driver bills as a group);
      // a Relay wallet top-up is its Relay deposit; a transfer to a related party is the party entry. Anything else is not a Creator
      // document — it keeps the vendor / account hints and counts as "categorize, no document".
      const bankDocuments = async (): Promise<boolean> => {
        if (line.ledger_account_id && /DREAMLINE|RELAY|WALLET/i.test(line.account_name ?? "")) return false;
        const bank = Math.abs(Number(line.amount_cents));
        const r = await withLuciaBypass(async (client) => {
          const settlements = (await client.query<{ id: string; ref: string | null; drv: string | null; members: string[] }>(
            `SELECT s.id::text, s.display_id::text AS ref, (SELECT upper(d.first_name || ' ' || d.last_name) FROM mdata.drivers d WHERE d.id = s.driver_id AND d.operating_company_id = s.operating_company_id) AS drv,
                    coalesce((SELECT array_agg('driver_bill:' || b.id::text) FROM driver_finance.driver_bills b WHERE b.settled_in_settlement_id = s.id AND b.voided_at IS NULL), '{}') AS members
               FROM driver_finance.driver_settlements s
              WHERE s.operating_company_id = $1::uuid AND s.voided_at IS NULL AND round(coalesce(s.net_pay, 0) * 100)::int = $2
                AND s.period_end BETWEEN $3::date - 30 AND $3::date + 7
                AND NOT EXISTS (SELECT 1 FROM banking.reconciliation_matches m WHERE m.ledger_entry_kind = 'settlement' AND m.ledger_entry_id = s.id
                                  AND m.voided_at IS NULL AND m.match_state IN ('auto_matched', 'user_matched'))`,
            [input.operating_company_id, bank, line.d])).rows;
          const deposits = (await client.query<{ id: string; ref: string | null }>(
            `SELECT rd.id::text, rd.deposit_id AS ref FROM integrations.relay_deposits rd
              WHERE rd.operating_company_id = $1::uuid AND rd.voided_at IS NULL AND rd.total_amount_cents = $2
                AND rd.relay_created_at::date BETWEEN $3::date - 5 AND $3::date + 2 AND rd.matched_bank_transaction_id IS NULL`,
            [input.operating_company_id, bank, line.d])).rows;
          const party = (await client.query<{ id: string; ref: string | null }>(
            `SELECT p.id::text, p.counterparty_name AS ref FROM accounting.related_party_loan_entries p
              WHERE p.operating_company_id = $1::uuid AND p.principal_cents = $2 AND p.entry_date BETWEEN $3::date - 5 AND $3::date + 2`,
            [input.operating_company_id, bank, line.d]).catch(() => ({ rows: [] }))).rows;
          return { settlements, deposits, party };
        });
        const desc = String(line.description ?? "").toUpperCase();
        let st = r.settlements;
        if (st.length > 1) { const byName = st.filter((x) => x.drv && x.drv.split(/\s+/).some((w) => w.length >= 4 && desc.includes(w))); if (byName.length) st = byName; }
        if (st.length === 1) { const x = st[0]!; outcomes.push({ bank_transaction_id: line.id, result: "group", ledger_entry_kind: "settlement", ledger_entry_id: x.id, reference: `settlement ${x.ref ?? ""} ${x.drv ?? ""}`.trim(), members: x.members, variance_cents: 0 }); return true; }
        if (st.length > 1) { outcomes.push({ bank_transaction_id: line.id, result: "several", documents: st.map((x) => `settlement:${x.id}`) }); return true; }
        if (r.deposits.length === 1) { outcomes.push({ bank_transaction_id: line.id, result: "suggested", ledger_entry_kind: "relay_deposit", ledger_entry_id: r.deposits[0]!.id, reference: r.deposits[0]!.ref }); return true; }
        if (r.party.length === 1) { outcomes.push({ bank_transaction_id: line.id, result: "suggested", ledger_entry_kind: "related_party_loan" as LedgerEntryKind, ledger_entry_id: r.party[0]!.id, reference: r.party[0]!.ref }); return true; }
        outcomes.push({ bank_transaction_id: line.id, result: "none", reason: "categorize_no_document" });
        return true;
      };
      if (found.candidates.length === 0) { if (await cardVariance() || await bankDocuments()) return; outcomes.push({ bank_transaction_id: line.id, result: "none", reason: "no_candidate" }); return; }
      // LEAD 443.80 #3 (decided): an expense and its own Relay fill are ONE purchase -> the suggestion is the EXPENSE (it carries
      // the fill + the sender fee). The wallet line is compared fee-inclusive: a line that carries the paid amount only (17751)
      // equals the document minus the fill's sender fee (17951 - 2.00); a line that carries paid + fee (19903) equals it exactly.
      const relayIds = found.candidates.filter((c) => c.ledger_entry_kind === "relay_fuel").map((c) => c.ledger_entry_id);
      const expenseIds = found.candidates.filter((c) => c.ledger_entry_kind === "expense").map((c) => c.ledger_entry_id);
      const fees = new Map<string, number>();       // document id -> sender fee cents (Relay fill, or the fill under an expense)
      const fillOf = new Map<string, string>();     // expense id -> its own Relay fill id
      if (relayIds.length || expenseIds.length) {
        await withLuciaBypass(async (client) => {
          const feeSql = `COALESCE((SELECT round(sum((f->>'amount')::numeric) * 100) FROM jsonb_array_elements(COALESCE(r.fees, '[]'::jsonb)) f), 0)::int`;
          const r = await client.query<{ id: string; fee_cents: number }>(
            `SELECT r.id::text, ${feeSql} AS fee_cents FROM integrations.relay_fuel_transactions r
              WHERE r.id = ANY($1::uuid[]) AND r.operating_company_id = $2::uuid`, [relayIds, input.operating_company_id]);
          for (const row of r.rows) fees.set(row.id, Number(row.fee_cents));
          const e = await client.query<{ id: string; fill_id: string | null; fee_cents: number }>(
            `SELECT e.id::text, r.id::text AS fill_id, COALESCE(${feeSql}, 0)::int AS fee_cents
               FROM accounting.expenses e
               LEFT JOIN fuel.fuel_transactions ft ON ft.id = e.source_fuel_transaction_id
               LEFT JOIN integrations.relay_fuel_transactions r ON r.id = ft.relay_fuel_transaction_id
              WHERE e.id = ANY($1::uuid[]) AND e.operating_company_id = $2::uuid`, [expenseIds, input.operating_company_id]);
          for (const row of e.rows) { fees.set(row.id, Number(row.fee_cents)); if (row.fill_id) fillOf.set(row.id, row.fill_id); }
        });
      }
      const bankAbs = Math.abs(Number(line.amount_cents));
      const isExact = (c: (typeof found.candidates)[number]) => {
        const amt = Math.abs(Number(c.amount_cents));
        const fee = fees.get(c.ledger_entry_id) ?? 0;
        // A Relay deposit lands on the wallet as its wallet leg (gross minus the 3.25% fee) — its own document (443.80 #3).
        if (c.ledger_entry_kind === "relay_deposit" && c.relay_deposit_wallet_cents != null && Math.abs(Number(c.relay_deposit_wallet_cents)) === bankAbs) return true;
        return amt === bankAbs || (fee > 0 && (amt - fee === bankAbs || amt + fee === bankAbs));
      };
      let exact = found.candidates.filter(isExact);
      // One purchase: drop a Relay fill whose own expense is also exact — the expense is the suggestion.
      const expenseFills = new Set(exact.filter((c) => c.ledger_entry_kind === "expense").map((c) => fillOf.get(c.ledger_entry_id)).filter(Boolean) as string[]);
      exact = exact.filter((c) => !(c.ledger_entry_kind === "relay_fuel" && expenseFills.has(c.ledger_entry_id)));
      // LEAD 443.155 F — one Faro wire can fund several purchases (ROUND 180: group by wire date): when no single document
      // equals the line, the Faro purchases offered for this line that share a purchase date and sum to it are the suggestion.
      const faroGroup = (): boolean => {
        const fps = found.candidates.filter((c) => c.ledger_entry_kind === "factoring_advance");
        const byDate = new Map<string, typeof fps>();
        for (const c of fps) byDate.set(c.event_date, [...(byDate.get(c.event_date) ?? []), c]);
        const hits = [...byDate.entries()].filter(([, g]) => g.length > 1 && g.reduce((t, c) => t + Math.abs(Number(c.amount_cents)), 0) === bankAbs);
        if (hits.length !== 1) return false;
        const [date, g] = hits[0]!;
        outcomes.push({ bank_transaction_id: line.id, result: "group", ledger_entry_kind: "factoring_advance", ledger_entry_id: g[0]!.ledger_entry_id,
          reference: g.map((c) => c.reference).join(" + "), members: g.map((c) => `factoring_advance:${c.ledger_entry_id}`), variance_cents: 0,
          reason: `exact net of ${g.length} Faro purchases dated ${date} (one wire)` });
        return true;
      };
      if (exact.length === 0) { if (faroGroup() || await cardVariance() || await bankDocuments()) return; outcomes.push({ bank_transaction_id: line.id, result: "none", reason: "no_exact_amount" }); return; }
      // Several exact documents (different purchases): all returned, none preselected (443.80 #3).
      if (exact.length > 1) { outcomes.push({ bank_transaction_id: line.id, result: "several", documents: exact.map((c) => `${c.ledger_entry_kind}:${c.ledger_entry_id}`) }); return; }
      const pick = exact[0]!;
      // LEAD 443.155 F — every suggestion says why (owner Law B: "ranked candidates WITH THE REASON").
      const reason = pick.ledger_entry_kind === "factoring_advance"
        ? `exact net, Faro purchase ${pick.reference ?? ""} ${pick.event_date}`.replace(/\s+/g, " ").trim()
        : `exact amount, ${pick.ledger_entry_kind.replace(/_/g, " ")} ${pick.reference ?? ""} ${pick.event_date}`.replace(/\s+/g, " ").trim();
      outcomes.push({ bank_transaction_id: line.id, result: "suggested", ledger_entry_kind: pick.ledger_entry_kind, ledger_entry_id: pick.ledger_entry_id, reference: pick.reference ?? null, reason });
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      outcomes.push({ bank_transaction_id: line.id, result: "none", reason: "error", detail: msg.slice(0, 200) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, lines.length) }, () => worker()));
  // One document, one line: a document suggested to two lines is suggested to neither — both listed.
  const uses = new Map<string, number>();
  for (const o of outcomes) if (o.result === "suggested" || o.result === "group") uses.set(o.ledger_entry_id, (uses.get(o.ledger_entry_id) ?? 0) + 1);
  for (let k = 0; k < outcomes.length; k++) {
    const o = outcomes[k]!;
    if ((o.result === "suggested" || o.result === "group") && (uses.get(o.ledger_entry_id) ?? 0) > 1) {
      outcomes[k] = { bank_transaction_id: o.bank_transaction_id, result: "none", reason: "document_competes_with_another_line", detail: `${o.ledger_entry_kind}:${o.ledger_entry_id}` };
    }
  }
  return { lines: lines.length, suggested: outcomes.filter((o) => o.result === "suggested").length, outcomes };
}
