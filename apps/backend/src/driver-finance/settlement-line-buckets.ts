// Canonical settlement_lines -> gross / deductions / reimbursements classification.
//
// ONE source of truth so the payrun-close aggregation (which WRITES gross_pay onto the settlement
// header when the owner closes) and the settlements LIST read (which shows the accruing total while
// the settlement is still open) can never drift apart. Same discipline the load-count subqueries in
// settlements.routes.ts already follow ("one rule, two call sites, so the two cannot drift apart").
//
// deadhead_pay: driver earnings for the empty (deadhead) leg. MILES SPEC (migration 202613510001)
// widened settlement_lines so a single driver bill can carry BOTH an 'earnings' (loaded) line AND a
// separate 'deadhead_pay' line instead of folding both into one 'earnings' amount. The close
// aggregation was never updated to sum the new line_type, so a bill booked in the split form dropped
// its whole deadhead leg out of gross_pay (re-measured live 2026-09-05: 10 open USMCA settlements
// carried $34,356.30 of line earnings incl. $2,763.49 of deadhead_pay that summed to $0 header gross).
// It is unambiguously driver pay and must
// sum into gross. (detention_pay is also earnings but the payrun-close service posts it on its own
// leg; it is intentionally left out of this bucket to avoid a double count and is a separate follow-up.)
export const SETTLEMENT_EARNINGS_LINE_TYPES = [
  "earnings",
  "extra_pay",
  "team_split_primary",
  "team_split_secondary",
  "deadhead_pay",
] as const;

export const SETTLEMENT_DEDUCTION_LINE_TYPES = ["deduction", "abandonment_chargeback"] as const;

// dispute_adjustment folded in with reimbursement (both positive-direction corrections owed back to
// the driver, unrelated to base pay) -- see ACCT-F5619 note in settlements-load-bookended.service.ts.
export const SETTLEMENT_REIMBURSEMENT_LINE_TYPES = ["reimbursement", "dispute_adjustment"] as const;

const inList = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");

/**
 * SQL that sums the given settlement_lines bucket. `alias` is the settlement_lines table/alias whose
 * `line_type`/`amount` columns are summed. Callers MUST also constrain is_active = true (soft-delete)
 * and the settlement scope themselves — this returns only the CASE-sum expression.
 */
export const settlementEarningsSumSql = (alias = "") =>
  `COALESCE(SUM(CASE WHEN ${alias ? `${alias}.` : ""}line_type IN (${inList(
    SETTLEMENT_EARNINGS_LINE_TYPES
  )}) THEN ${alias ? `${alias}.` : ""}amount ELSE 0 END), 0)`;

export const settlementDeductionsSumSql = (alias = "") =>
  `COALESCE(SUM(CASE WHEN ${alias ? `${alias}.` : ""}line_type IN (${inList(
    SETTLEMENT_DEDUCTION_LINE_TYPES
  )}) THEN ${alias ? `${alias}.` : ""}amount ELSE 0 END), 0)`;

export const settlementReimbursementsSumSql = (alias = "") =>
  `COALESCE(SUM(CASE WHEN ${alias ? `${alias}.` : ""}line_type IN (${inList(
    SETTLEMENT_REIMBURSEMENT_LINE_TYPES
  )}) THEN ${alias ? `${alias}.` : ""}amount ELSE 0 END), 0)`;

// Statuses where gross_pay has NOT yet been committed to the header (the owner has not closed), so the
// list must show the line-derived accrual instead of the stored 0.00. Everything else uses the stored
// (committed) value.
export const SETTLEMENT_PRE_CLOSE_STATUSES = ["draft", "presettle", "acked", "open", "ready"] as const;

export function isPreCloseStatus(status: string | null | undefined): boolean {
  return SETTLEMENT_PRE_CLOSE_STATUSES.includes(String(status ?? "") as (typeof SETTLEMENT_PRE_CLOSE_STATUSES)[number]);
}
