/**
 * ENG-04 (ACCT-F11091) — classify bank evidence for the 12 legacy 2170 driver-advance credits.
 *
 * The 2026-10-26 dry-run proposed the $705.97 reclass the owner is asked to authorize (register
 * row 43, AUTH) from three "BANK_UNIQUE" hits. Measured 2026-11-03 on prod:
 *   - CA-2026-0004 ($301.99) matched 9abf2596 — a Plaid PENDING line voided 2026-10-15 and merged
 *     into 6198ea2f (whose posted_date is NULL, so the old window never saw the live line).
 *   - CA-2026-0006 and CA-2026-0007 ($201.99 each) BOTH matched f5cc2ced — one voided pending line
 *     (plaid_stale_pending_sweep 2026-11-03). One bank line cannot pay two advances.
 * The old SQL had no voided_at / merged / already-matched filter, dated lines by posted_date only,
 * and had no exclusivity rule. This module is the single place those rules live; the dry-run and
 * its guard both import it.
 *
 * Rules:
 *   - eligible line: not voided, not merged into another line, an OUTFLOW (amount_cents < 0), not
 *     already matched or categorized, and dated by posted_date ?? transaction_date.
 *   - candidate: |amount| equals the advance amount and the date is within ±windowDays of book date.
 *   - 0 candidates → NO_EVIDENCE; >1 → BANK_AMBIGUOUS; exactly 1 but that line is also a candidate
 *     for another advance → BANK_CONTESTED; otherwise BANK_UNIQUE (the only class that may propose).
 */

export const ELIGIBLE_REASONS = Object.freeze({
  VOIDED: "voided",
  MERGED: "merged_into_other_line",
  NOT_OUTFLOW: "not_outflow",
  ALREADY_MATCHED: "already_matched_or_categorized",
  NO_DATE: "no_date",
});

export function lineDate(line) {
  return line.posted_date ?? line.transaction_date ?? null;
}

export function ineligibleReason(line) {
  if (line.voided_at) return ELIGIBLE_REASONS.VOIDED;
  if (line.merged_into_bank_transaction_id) return ELIGIBLE_REASONS.MERGED;
  if (!(Number(line.amount_cents) < 0)) return ELIGIBLE_REASONS.NOT_OUTFLOW;
  if (line.already_matched) return ELIGIBLE_REASONS.ALREADY_MATCHED;
  if (!lineDate(line)) return ELIGIBLE_REASONS.NO_DATE;
  return null;
}

function dayDiff(a, b) {
  const ms = Date.parse(String(a).slice(0, 10)) - Date.parse(String(b).slice(0, 10));
  return Math.round(ms / 86400000);
}

/**
 * @param {Array<{advance_id:string, display_id:string, amount_cents:number|string, book_date:string}>} advances
 * @param {Array<object>} bankLines
 * @param {{windowDays?: number}} [opts]
 */
export function classifyAdvanceBankEvidence(advances, bankLines, opts = {}) {
  const windowDays = opts.windowDays ?? 21;
  const eligible = bankLines.filter((l) => ineligibleReason(l) === null);
  const candidatesByAdvance = new Map();
  const advancesByLine = new Map();
  for (const adv of advances) {
    const amount = Number(adv.amount_cents);
    const cands = eligible.filter(
      (l) => Math.abs(Number(l.amount_cents)) === amount && Math.abs(dayDiff(lineDate(l), adv.book_date)) <= windowDays
    );
    candidatesByAdvance.set(adv.advance_id, cands);
    for (const l of cands) {
      if (!advancesByLine.has(l.id)) advancesByLine.set(l.id, new Set());
      advancesByLine.get(l.id).add(adv.advance_id);
    }
  }
  return advances.map((adv) => {
    const cands = candidatesByAdvance.get(adv.advance_id) ?? [];
    let evidence;
    if (cands.length === 0) evidence = "NO_EVIDENCE";
    else if (cands.length > 1) evidence = "BANK_AMBIGUOUS";
    else if ((advancesByLine.get(cands[0].id)?.size ?? 0) > 1) evidence = "BANK_CONTESTED";
    else evidence = "BANK_UNIQUE";
    const line = evidence === "BANK_UNIQUE" ? cands[0] : null;
    return {
      display_id: adv.display_id,
      advance_id: adv.advance_id,
      amount_cents: Number(adv.amount_cents),
      book_date: adv.book_date,
      evidence,
      candidate_line_ids: cands.map((l) => l.id),
      bank_match_id: line?.id ?? null,
      bank_match_date: line ? lineDate(line) : null,
      bank_ledger_account_id: line?.bank_ledger_account_id ?? null,
      bank_ledger_number: line?.bank_ledger_number ?? null,
      action: evidence === "BANK_UNIQUE" && line?.bank_ledger_account_id ? "PROPOSE_RECLASS" : "LEAVE",
    };
  });
}
