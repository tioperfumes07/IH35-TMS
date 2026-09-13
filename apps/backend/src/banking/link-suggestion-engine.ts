/**
 * LOAD-TO-CASH CHAIN, LINK 4 — bank-transaction suggestion scorer.
 *
 * Owner law, verbatim (2026-09-12): "it should never automatch, it suggests and we accept it or
 * change the transactions." This module NEVER writes anything — it is a pure function, no DB, no
 * side effects — called by link-suggestions.routes.ts's read-only GET handler. The write/accept
 * flow (PR 2 per the Lead's own build order) is a SEPARATE, later change; nothing in this file may
 * ever be imported by a write path without that being a deliberate, reviewed decision.
 *
 * Distinct from (not a replacement for) two existing engines already in this codebase:
 *   - obligation-reconcile.logic.ts's suggestionConfidence() — a strict PASS/FAIL reconciliation
 *     gate (amount within 50c, date within 7d, levenshtein < 5) for banking.bank_transactions'
 *     reconciled_obligation_type/id columns.
 *   - accounting/bank-recon/match.service.ts's computeMatchScore() — QBO-style Find-Match for
 *     payments/bill_payments/transfers/journal_entries.
 * This one targets the SPECIFIC columns the Lead measured as 0/518 populated (matched_expense_id,
 * matched_bill_id, matched_load_id, matched_settlement_id, matched_invoice_id) and is explicitly a
 * wide-net RANKING (show the top candidates and why, even a weak one), not a pass/fail gate — the
 * owner wants to see and reject bad guesses, not have them silently dropped before he sees them.
 */
import { levenshtein } from "./obligation-reconcile.logic.js";

export type LinkCandidateInput = {
  obligation_type: string;
  obligation_id: string;
  label: string;
  amount_cents: number;
  event_date: string; // YYYY-MM-DD
  counterparty_name?: string | null;
};

export type LinkTransactionInput = {
  amount_cents: number; // always positive magnitude — caller compares |txn| to |candidate|
  transaction_date: string; // YYYY-MM-DD
  description: string | null;
  merchant_name: string | null;
  bank_account_label?: string | null; // e.g. "Chase ••••1234" — context only, never scored
};

export type LinkConfidence = "high" | "medium" | "low";

export type LinkSuggestion = {
  obligation_type: string;
  obligation_id: string;
  label: string;
  amount_cents: number;
  event_date: string;
  score: number; // 0..1
  confidence: LinkConfidence;
  /** Plain-words reason, e.g. "same amount, 1 day apart, same vendor LOVES". Never omitted — a
   * ranked candidate with no stated reason is exactly the kind of unexplained suggestion the
   * owner has said he does not trust. */
  reason: string;
};

const AMOUNT_TOLERANCE_CENTS = 500; // $5 — a wide net; the score itself penalizes any gap
const DATE_WINDOW_DAYS = 10;

function normalizeName(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ");
}

/** 1.0 for an exact (normalized) name match, partial credit for a substring/prefix relationship
 * (bank feeds routinely truncate or append store numbers — "LOVES #0412" vs vendor "LOVES"), 0 for
 * no shared tokens, otherwise a token-overlap ratio. */
function vendorNameScore(candidateName: string | null | undefined, txnText: string): number {
  const name = normalizeName(candidateName);
  const haystack = normalizeName(txnText);
  if (!name || !haystack) return 0;
  if (haystack === name) return 1;
  if (haystack.includes(name) || name.includes(haystack)) return 0.85;
  const nameTokens = new Set(name.split(" ").filter((t) => t.length > 2));
  const haystackTokens = new Set(haystack.split(" ").filter((t) => t.length > 2));
  if (nameTokens.size === 0 || haystackTokens.size === 0) return 0;
  let shared = 0;
  for (const t of nameTokens) if (haystackTokens.has(t)) shared += 1;
  return shared / nameTokens.size;
}

function dateGapDays(a: string, b: string): number {
  const ta = new Date(`${a}T12:00:00Z`).getTime();
  const tb = new Date(`${b}T12:00:00Z`).getTime();
  return Math.abs(ta - tb) / 86_400_000;
}

/**
 * Score ONE candidate against ONE bank transaction. Weights: amount 0.5, date 0.3, vendor-name
 * 0.2 — amount is the strongest signal two rows are the same real-world event (same pattern
 * match.service.ts's computeMatchScore uses, weighted 0.55/0.2/0.25 there for a different candidate
 * set), vendor name is real but bank feed text is noisy so it carries the least weight of the
 * three, never the tie-breaker alone.
 */
export function scoreLinkCandidate(txn: LinkTransactionInput, candidate: LinkCandidateInput): LinkSuggestion {
  const amountGap = Math.abs(Math.abs(txn.amount_cents) - Math.abs(candidate.amount_cents));
  const amountScore = amountGap === 0 ? 1 : Math.max(0, 1 - amountGap / (AMOUNT_TOLERANCE_CENTS * 4));
  const days = dateGapDays(txn.transaction_date, candidate.event_date);
  const dateScore = Math.max(0, 1 - days / DATE_WINDOW_DAYS);
  const vendorScore = vendorNameScore(candidate.counterparty_name, `${txn.merchant_name ?? ""} ${txn.description ?? ""}`);

  const score = 0.5 * amountScore + 0.3 * dateScore + 0.2 * vendorScore;
  const confidence: LinkConfidence = score >= 0.85 ? "high" : score >= 0.55 ? "medium" : "low";

  const reasonParts: string[] = [];
  reasonParts.push(
    amountGap === 0
      ? "same amount"
      : `amount off by ${(amountGap / 100).toFixed(2)}`
  );
  reasonParts.push(days < 1 ? "same day" : `${Math.round(days)} day(s) apart`);
  if (vendorScore >= 0.85 && candidate.counterparty_name) reasonParts.push(`same vendor ${candidate.counterparty_name}`);
  else if (vendorScore > 0 && candidate.counterparty_name) reasonParts.push(`vendor name partly matches ${candidate.counterparty_name}`);
  else if (candidate.counterparty_name) reasonParts.push(`vendor ${candidate.counterparty_name} not found in the bank text`);

  return {
    obligation_type: candidate.obligation_type,
    obligation_id: candidate.obligation_id,
    label: candidate.label,
    amount_cents: candidate.amount_cents,
    event_date: candidate.event_date,
    score,
    confidence,
    reason: reasonParts.join(", "),
  };
}

/** Rank every candidate against one transaction and keep the top N. Candidates further than
 * DATE_WINDOW_DAYS*3 away are dropped outright — not because they are being auto-decided, but
 * because a candidate a month away is not a suggestion, it is noise; the owner still sees every
 * candidate inside a generous window, ranked honestly by score, never pre-filtered by amount. */
export function rankLinkCandidates(
  txn: LinkTransactionInput,
  candidates: LinkCandidateInput[],
  topN = 3
): LinkSuggestion[] {
  return candidates
    .filter((c) => dateGapDays(txn.transaction_date, c.event_date) <= DATE_WINDOW_DAYS * 3)
    .map((c) => scoreLinkCandidate(txn, c))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .filter((s) => s.score > 0);
}

// Re-exported so a consumer that only needs the text-similarity primitive (e.g. a test fixture)
// doesn't need its own import path into obligation-reconcile.logic.ts.
export { levenshtein };
