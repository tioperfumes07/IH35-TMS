/**
 * ROUND 155.24 — SETTLEMENT-BORN CANDIDATE UNIVERSE (owner 2026-09-28, final scope)
 *
 * DEFINITION (LAW — do not drift): a document is settlement-born when it is:
 *   1. a driver_finance.driver_bills row carrying settled_in_settlement_id, OR
 *   2. an accounting.bills / accounting.bill_payments row that represents one of those
 *      (via driver_finance.driver_settlement_gl_bills), OR
 *   3. the settlement's own payment (driver_settlements.accounting_bill_payment_id /
 *      a cash bill_payment linked on that settlement's GL run).
 *
 * NOTHING ELSE QUALIFIES. Standalone expenses, journal entries, standalone bills,
 * invoices, factoring advances, transfers — the OWNER matches by hand or categorizes.
 * They never enter the match engine, not as a candidate, not behind a filter, not as a default.
 * BUILD NO TYPE FILTER.
 *
 * ROUND 155.25 — partial payment is the NORMAL case:
 *   A bill can be matched more than once and stays a candidate until its remaining
 *   cash balance reaches zero. Noncash settlement deductions never hit the bank and
 *   are exceptions, not match candidates.
 *
 * Guard: scripts/verify-match-candidates-are-settlement-born-only.mjs
 */

export const SETTLEMENT_BORN_MATCH_KINDS = ["bill_payment", "bill"] as const;
export type SettlementBornMatchKind = (typeof SETTLEMENT_BORN_MATCH_KINDS)[number];

/** SQL EXISTS predicate: accounting.bill_payments bp is settlement-born (alias `bp`). */
export const SQL_BILL_PAYMENT_IS_SETTLEMENT_BORN = `
  (
    EXISTS (
      SELECT 1
        FROM driver_finance.driver_settlement_gl_bills g
       WHERE g.operating_company_id = bp.operating_company_id
         AND (
           g.cash_bill_payment_id = bp.id
           OR g.deduction_bill_payment_id = bp.id
           OR g.accounting_bill_id = bp.bill_id
         )
    )
    OR EXISTS (
      SELECT 1
        FROM driver_finance.driver_settlements ds
       WHERE ds.operating_company_id = bp.operating_company_id
         AND ds.accounting_bill_payment_id = bp.id
    )
  )
`.trim();

/** SQL EXISTS predicate: accounting.bills b is settlement-born (alias `b`). */
export const SQL_BILL_IS_SETTLEMENT_BORN = `
  (
    EXISTS (
      SELECT 1
        FROM driver_finance.driver_settlement_gl_bills g
       WHERE g.operating_company_id = b.operating_company_id
         AND g.accounting_bill_id = b.id
    )
    OR (
      b.driver_id IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM driver_finance.driver_bills db
         WHERE db.operating_company_id = b.operating_company_id
           AND db.settled_in_settlement_id IS NOT NULL
           AND db.driver_id = b.driver_id
           AND b.load_id IS NOT NULL
           AND db.load_id = b.load_id
      )
    )
  )
`.trim();
/**
 * Cash settlement-born bill_payments are the primary bank-match candidates.
 * Noncash settlement deductions never clear a bank line.
 */
export const SQL_BILL_PAYMENT_IS_CASH_SETTLEMENT_BORN = `
  (
    COALESCE(bp.settlement_deduction_noncash, false) IS NOT TRUE
    AND ${SQL_BILL_PAYMENT_IS_SETTLEMENT_BORN}
  )
`.trim();

export function isSettlementBornMatchKind(kind: string): kind is SettlementBornMatchKind {
  return (SETTLEMENT_BORN_MATCH_KINDS as readonly string[]).includes(kind);
}

/**
 * Pure predicate for unit tests / guards — a candidate kind is allowed in the engine
 * only when it is settlement-born (bill_payment or bill). Everything else is out.
 */
export function isAllowedSettlementBornCandidateKind(kind: string): boolean {
  return isSettlementBornMatchKind(kind);
}
