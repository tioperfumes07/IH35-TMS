import { activeSettlementLine, liveSettlement } from "../accounting/live-document-predicates.sql.js";

/** A live, unpaid settlement is a cash obligation once finalized or scheduled.
 * Date bucketing is separate; all forecast views use this same eligibility rule.
 */
export function cashFlowSettlementEligibilitySql(alias: string): string {
  const live = liveSettlement(alias); // validates the SQL identifier
  return `(${live}
    AND COALESCE(${alias}.net_pay, 0) > 0
    AND COALESCE(${alias}.payment_state, 'unpaid') NOT IN ('cleared', 'manual_paid', 'bounced')
    AND (COALESCE(${alias}.payment_state, 'unpaid') IN ('queued', 'sent_to_bank')
      OR ${alias}.bank_settle_date IS NOT NULL
      OR (COALESCE(${alias}.payment_state, 'unpaid') = 'unpaid'
        AND ${alias}.status IN ('locked', 'final', 'approved', 'posted', 'closed'))))`;
}

/**
 * LEAD 443.276 — ONE driver obligation, counted ONCE.
 * Architecture: a driver bill (and its delivery A/P bill, accounting.bills bill_category='driver') exists PER LOAD; a
 * settlement GROUPS those loads for control and, once it is closed (or its payment has started), the SETTLEMENT is the
 * payable — net of deductions, advances and escrow. From that point the per-load A/P bills inside it are not separately
 * payable cash.
 * Measured 10-23 (prod USMCA): 146 of 174 open driver A/P bills sat inside 85 closed-unpaid settlements, so cash flow
 * showed the settlement net ($127,897.75) AND the same pay again as A/P bills ($125,693.97) → Driver pay 254,182.
 * TRUE when this accounting.bills row is a driver A/P bill whose driver bill sits on an active line of a settlement that
 * is the payable (status closed/locked/final/approved/posted, or payment queued/sent/cleared). An OPEN settlement does
 * not carry its bills yet: they stay as their own per-load obligations until close.
 */
export function driverApBillCarriedBySettlementSql(billAlias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(billAlias)) throw new Error(`invalid SQL alias: ${billAlias}`);
  const b = billAlias;
  return `(${b}.bill_category = 'driver' AND EXISTS (
    SELECT 1
      FROM driver_finance.driver_bills cdb
      JOIN driver_finance.settlement_lines csl
        ON csl.source_driver_bill_id = cdb.id AND csl.operating_company_id = cdb.operating_company_id
      JOIN driver_finance.driver_settlements cds
        ON cds.id = csl.settlement_id AND cds.operating_company_id = cdb.operating_company_id
     WHERE cdb.accrued_bill_id = ${b}.id
       AND cdb.operating_company_id = ${b}.operating_company_id
       AND ${activeSettlementLine("csl", "cds")}
       AND (cds.status IN ('locked', 'final', 'approved', 'posted', 'closed')
            OR COALESCE(cds.payment_state, 'unpaid') <> 'unpaid')))`;
}
