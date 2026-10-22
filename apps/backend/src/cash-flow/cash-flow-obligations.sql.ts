import { liveSettlement } from "../accounting/live-document-predicates.sql.js";

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
