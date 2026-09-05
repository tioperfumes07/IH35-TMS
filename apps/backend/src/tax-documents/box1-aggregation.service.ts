// BLOCK-17/24 — annual Box-1 (nonemployee compensation) aggregation.
//
// Source of truth: docs/specs/1099-and-tax-doc-BLOCK-17-DESIGN.md §4.3. This is a READ-ONLY
// aggregation off driver_finance.settlement_lines — it never posts a journal entry and never
// writes GL. The single most important, most commonly gotten-wrong rule this file enforces:
//
//   Box 1 = gross comp EARNED for services, NOT net pay disbursed.
//
// `deduction` lines (advance recoupment, damage-claim recovery, lease payments, etc.) reduce
// what the driver was PAID, not what the driver EARNED — the company simply recouped a
// separate debt out of comp the driver fully earned. IRS Box 1 reports the gross, unreduced by
// the payer's own debt recoupment. Building this off `driver_settlements.net_pay` would
// systematically understate Box 1 — an audit finding waiting to happen. This file must NEVER
// reference `net_pay` and NEVER subtract a `deduction` line from the total.
//
// `reimbursement` lines are excluded in both directions (not comp for services).
// `abandonment_chargeback` only nets against comp EARNED IN THE SAME TAX YEAR; a chargeback
// against a prior filed year is a corrected-1099 case (manual CPA review), never a silent
// cross-year netting — this function only ever looks at rows within the requested tax year, so
// cross-year netting cannot happen here by construction.

export type Queryable = {
  query: <R = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: R[] }>;
};

export type Box1AggregateRow = {
  driver_id: string;
  tax_year: number;
  box1_nonemployee_comp_cents: number;
  settlement_line_ids: string[];
};

// The exact, and ONLY, line types counted toward Box 1. `deduction` and `reimbursement` are
// deliberately absent — see file header. Keep this list in sync with the CI guard
// scripts/verify-box1-excludes-net-pay.mjs, which asserts this file never references net_pay.
export const BOX1_INCLUDED_LINE_TYPES = [
  "earnings",
  "extra_pay",
  "team_split_primary",
  "team_split_secondary",
] as const;

export const BOX1_CHARGEBACK_LINE_TYPE = "abandonment_chargeback" as const;

/**
 * Computes each driver's annual Box-1 nonemployee-compensation total for `taxYear`, cash-basis
 * (comp is reportable in the year PAID — the year the payment was ISSUED — not the year the work
 * was performed, per the IRS cash-method rule for information returns).
 *
 * SETL-TAX-YEAR-USES-CLEARED-DATE fix (2026-09-05): the year bucket keys on
 * `COALESCE(s.payment_sent_at, s.paid_at)`, NEVER `payment_cleared_at`. `payment_sent_at` (set
 * when the electronic sent_to_bank transition fires) and `paid_at` (set when the manual_paid
 * transition fires) are the two mutually-exclusive "the company issued this payment" events —
 * `settlement-payment.service.ts`'s state machine only ever takes ONE of those two branches per
 * settlement. `payment_cleared_at` is a THIRD, LATER, reconciliation-only event (bank confirmed
 * the electronic payment cleared) that can land in the next tax year for a payment issued in the
 * prior one (e.g. issued Dec 31, clears Jan 2) — using it here would silently move real income
 * across a year boundary on a 1099, which is wrong on the government's own cash-basis rule: the
 * payer's books, not the bank's clearing house, control this.
 */
export async function aggregateBox1CompForTaxYear(
  client: Queryable,
  operatingCompanyId: string,
  taxYear: number
): Promise<Box1AggregateRow[]> {
  const includedRes = await client.query<{
    driver_id: string;
    total_cents: string;
    line_ids: string[];
  }>(
    `
      SELECT
        s.driver_id::text AS driver_id,
        SUM(ROUND(sl.amount * 100))::bigint AS total_cents,
        array_agg(sl.id::text ORDER BY sl.id) AS line_ids
      FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
      WHERE s.operating_company_id = $1::uuid
        AND sl.line_type = ANY($2::text[])
        AND COALESCE(s.payment_sent_at, s.paid_at) IS NOT NULL
        AND date_part('year', COALESCE(s.payment_sent_at, s.paid_at))::int = $3::int
      GROUP BY s.driver_id
    `,
    [operatingCompanyId, [...BOX1_INCLUDED_LINE_TYPES], taxYear]
  );

  const chargebackRes = await client.query<{ driver_id: string; total_cents: string; line_ids: string[] }>(
    `
      SELECT
        s.driver_id::text AS driver_id,
        SUM(ROUND(sl.amount * 100))::bigint AS total_cents,
        array_agg(sl.id::text ORDER BY sl.id) AS line_ids
      FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
      WHERE s.operating_company_id = $1::uuid
        AND sl.line_type = $2
        AND COALESCE(s.payment_sent_at, s.paid_at) IS NOT NULL
        AND date_part('year', COALESCE(s.payment_sent_at, s.paid_at))::int = $3::int
      GROUP BY s.driver_id
    `,
    [operatingCompanyId, BOX1_CHARGEBACK_LINE_TYPE, taxYear]
  );

  const chargebackByDriver = new Map<string, { cents: number; ids: string[] }>();
  for (const row of chargebackRes.rows) {
    chargebackByDriver.set(row.driver_id, { cents: Number(row.total_cents ?? 0), ids: row.line_ids ?? [] });
  }

  const out: Box1AggregateRow[] = [];
  for (const row of includedRes.rows) {
    const chargeback = chargebackByDriver.get(row.driver_id);
    const grossCents = Number(row.total_cents ?? 0);
    const chargebackCents = chargeback?.cents ?? 0;
    const netCents = Math.max(0, grossCents - chargebackCents);
    out.push({
      driver_id: row.driver_id,
      tax_year: taxYear,
      box1_nonemployee_comp_cents: netCents,
      settlement_line_ids: [...(row.line_ids ?? []), ...(chargeback?.ids ?? [])],
    });
  }
  return out;
}

/** Loads the reporting threshold + due dates for a (form_type, tax_year) — never hardcoded. */
export async function loadTaxFormThreshold(
  client: Queryable,
  taxYear: number,
  formType: "1099_nec" | "1042_s"
): Promise<{
  reporting_threshold_cents: number;
  recipient_copy_due_date: string;
  irs_copy_due_date: string;
} | null> {
  const res = await client.query<{
    reporting_threshold_cents: string;
    recipient_copy_due_date: string;
    irs_copy_due_date: string;
  }>(
    `
      SELECT reporting_threshold_cents, recipient_copy_due_date::text, irs_copy_due_date::text
      FROM catalogs.tax_form_thresholds
      WHERE tax_year = $1 AND form_type = $2
      LIMIT 1
    `,
    [taxYear, formType]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    reporting_threshold_cents: Number(row.reporting_threshold_cents),
    recipient_copy_due_date: row.recipient_copy_due_date,
    irs_copy_due_date: row.irs_copy_due_date,
  };
}
