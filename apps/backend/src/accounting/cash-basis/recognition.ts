/**
 * ACCT-F412 — CASH-BASIS RECOGNITION. The engine's brain, pure and provable.
 *
 * THE DEFECT THIS REPLACES, and why it was never a date bug
 *   `transformProfitLossToCashBasis` takes the ACCRUAL P&L report and "converts" it. But the
 *   accrual P&L is already `GROUP BY a.id ... SUM(amount_cents)` over postings
 *   (profit-loss.service.ts). By the time the transform runs, WHICH invoices produced that revenue
 *   and whether any of them were paid is gone. There is no date it could have used — so it stamped
 *   `settlement_date: anchorDate`, where anchorDate IS the as-of date, and the engine's own rule
 *   (`recognized = settlement_date <= as_of`) then recognized every line in full, always.
 *   MEASURED against the live engine: a line anchored that way keeps 100000 of 100000, while the
 *   same line with settlement_date null correctly zeroes.
 *
 *   So the cash-basis P&L has been IDENTICAL to the accrual P&L. Not off by a date — structurally
 *   incapable of being anything else, because an aggregate cannot be disaggregated. You cannot
 *   convert a summed report into a cash-basis report. A cash-basis P&L has to be computed from the
 *   transactions.
 *
 * THE RULE, as QuickBooks implements it
 *   Revenue and expense are recognized WHEN AND TO THE EXTENT the source document is settled, in
 *   the period the settlement happened — not when the document was issued. Intuit's own community
 *   guidance states the principle as "paid by value, not by new money": ANY reduction of the
 *   receivable recognizes income proportionally, so a payment, a credit memo and an applied
 *   discount all recognize, and a PARTIAL payment recognizes PRO RATA.
 *
 *   An invoice for $1,000 of which $250 was received on 2026-03-15 recognizes $250 of revenue on
 *   2026-03-15 — in March, not in the month the invoice was raised, and not $1,000.
 *
 * WHAT IS IN THIS FILE AND WHAT IS NOT
 *   Here: the pure arithmetic — pro-rata allocation of a posting across its document's settlement
 *   events, windowed to [from, to]. No database, no SQL, fully unit-provable, which is why it is
 *   separated out. Every locked decision it must respect is cited at its branch.
 *
 *   NOT here, and NOT yet built: the query that feeds it. Something must join each revenue/expense
 *   posting to its source document's settlement events (payments for an invoice, bill_payments for
 *   a bill, the bank settlement date for a driver settlement) and call this function per posting.
 *   That is SQL against the live schema and it cannot be proven without a database — this session
 *   has no credential and USMCA is empty after AUTH-400. It is named in the commit, not claimed.
 */

/** One event that settled part of a document: a payment, a credit memo, an applied discount. */
export type SettlementEvent = {
  /** The date the value moved. This is the date recognition lands on. */
  date: string;
  /** How much of the document this event settled, in cents. Always positive. */
  amount_cents: number;
};

export type RecognitionInput = {
  /** The posting's own amount, in cents — the revenue or expense being recognized. */
  postingAmountCents: number;
  /**
   * The source document's total, in cents. The posting is recognized in the same PROPORTION as the
   * document is settled, so a posting that is one line of a multi-line invoice recognizes its own
   * share. Zero or missing means the proportion is undefined — see the branch for what that does.
   */
  documentTotalCents: number;
  /** Everything that has settled this document, in any order. */
  settlements: readonly SettlementEvent[];
  /** The reporting window, inclusive on both ends. */
  from: string;
  to: string;
};

export type RecognitionResult = {
  /** Recognized inside [from, to]. This is the number the cash-basis P&L shows. */
  recognizedCents: number;
  /** Recognized on or before `to` — for an as-of figure rather than a period figure. */
  recognizedThroughToCents: number;
  /** Still unrecognized as of `to`: the part cash basis is correctly deferring. */
  deferredCents: number;
  /** Why, in one word, so a report can explain a number instead of just showing it. */
  reason: "unsettled" | "partially_settled" | "fully_settled" | "undefined_proportion";
};

function inWindow(date: string, from: string, to: string): boolean {
  const d = date.slice(0, 10);
  return d >= from.slice(0, 10) && d <= to.slice(0, 10);
}

function onOrBefore(date: string, to: string): boolean {
  return date.slice(0, 10) <= to.slice(0, 10);
}

/**
 * Recognize one posting on a cash basis.
 *
 * The proportion is settled/total, CAPPED AT 1. An over-payment settles the document and no more:
 * recognizing 110% of revenue because a customer overpaid would invent income, and the overpayment
 * is a liability to that customer, not revenue. Rounding uses the LAST recognized event to absorb
 * the remainder, so the parts of a fully settled document sum to exactly the posting amount and
 * never to one cent more or less than the accrual figure.
 */
export function recognizeCashBasis(input: RecognitionInput): RecognitionResult {
  const posting = Math.trunc(input.postingAmountCents);
  const total = Math.trunc(input.documentTotalCents);

  // A document with no total has no defined proportion. Recognizing it in full would be the exact
  // defect this file replaces (assume settled); recognizing nothing would hide real money. It is
  // reported as its own reason so a caller must decide, and so a report can say "unclassified"
  // rather than fold a guess into a total.
  if (total <= 0) {
    return {
      recognizedCents: 0,
      recognizedThroughToCents: 0,
      deferredCents: posting,
      reason: "undefined_proportion",
    };
  }

  const settled = input.settlements.reduce((sum, s) => sum + Math.max(0, Math.trunc(s.amount_cents)), 0);
  if (settled <= 0) {
    return { recognizedCents: 0, recognizedThroughToCents: 0, deferredCents: posting, reason: "unsettled" };
  }

  // Cap at the document total: an overpayment settles it, it does not over-recognize.
  const effective = Math.min(settled, total);
  const fully = effective >= total;

  // Allocate the posting across the settlement events in DATE ORDER, so which period a part lands
  // in is deterministic and does not depend on the order rows came back from the database.
  const ordered = [...input.settlements]
    .filter((s) => Math.trunc(s.amount_cents) > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let allocatedSoFar = 0;
  let creditedSettlement = 0;
  let inWindowCents = 0;
  let throughToCents = 0;

  for (let i = 0; i < ordered.length; i += 1) {
    const event = ordered[i];
    const eventAmount = Math.trunc(event.amount_cents);
    // Never credit more settlement than the document is worth.
    const usable = Math.max(0, Math.min(eventAmount, total - creditedSettlement));
    if (usable === 0) continue;
    creditedSettlement += usable;

    const isLastCredited = creditedSettlement >= effective;
    // The last credited event absorbs the rounding remainder, so a fully settled document's parts
    // sum to the posting EXACTLY. Anything else drifts by a cent and the cash column stops tying.
    const share =
      isLastCredited && fully
        ? posting - allocatedSoFar
        : Math.trunc((posting * usable) / total);
    allocatedSoFar += share;

    if (onOrBefore(event.date, input.to)) throughToCents += share;
    if (inWindow(event.date, input.from, input.to)) inWindowCents += share;
    if (isLastCredited) break;
  }

  return {
    recognizedCents: inWindowCents,
    recognizedThroughToCents: throughToCents,
    deferredCents: posting - throughToCents,
    reason: fully ? "fully_settled" : "partially_settled",
  };
}
