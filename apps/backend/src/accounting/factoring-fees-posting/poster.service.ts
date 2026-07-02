import { withLuciaBypass } from "../../auth/db.js";

type Actor = {
  user_id: string;
  role: string;
};

type ReserveBalanceRow = {
  customer_id: string;
  customer_name: string;
  reserve_balance_cents: number;
  reserve_accrued_cents: number;
  reserve_released_cents: number;
};

type ReserveEventRow = {
  factoring_advance_id: string;
  display_id: string;
  customer_id: string;
  customer_name: string;
  status: string;
  reserve_amount_cents: number;
  release_amount_cents: number;
  factor_fee_cents: number;
  occurred_at: string;
};

// DEPRECATED (CODER-34 secured-borrowing rebuild): the factoring fee is a FINANCING (interest) cost that
// is booked at FUNDING as part of the funding entry (Dr Factoring Fees / Cr Factoring Advance liability) in
// factoring-posting/poster.service.ts — NOT at release, and NEVER netted against A/R. The old
// implementation here posted `Dr Factoring Fee / Cr ar_control`, which (a) credited A/R (the sale-model
// defect this task removes) and (b) double-booked the fee already captured at funding. It is now a documented
// no-op so the existing route call at /release cannot post a spurious A/R credit or a duplicate fee. Kept
// (void-not-delete / additive-only) so the route + tests keep compiling; safe to remove the route call in a
// follow-up.
export async function postFactoringFeeExpenseEvent(input: {
  operating_company_id: string;
  factoring_advance_id: string;
  factor_fee_cents: number;
  released_at_iso: string;
  actor: Actor;
}): Promise<{ posted: false; reason: "fee_booked_at_funding" }> {
  void input;
  return { posted: false, reason: "fee_booked_at_funding" };
}

export async function listFactorReserveBalances(input: { operating_company_id: string }): Promise<{
  rows: ReserveBalanceRow[];
  recent_events: ReserveEventRow[];
}> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const balances = await client.query<ReserveBalanceRow>(
      `
        WITH invoice_split AS (
          SELECT
            i.customer_id,
            c.customer_name,
            i.total_cents::numeric AS invoice_total_cents,
            fa.invoice_total_cents::numeric AS batch_total_cents,
            fa.reserve_amount_cents::numeric AS reserve_amount_cents,
            fa.release_amount_cents::numeric AS release_amount_cents
          FROM accounting.factoring_advances fa
          JOIN accounting.invoices i ON i.factoring_advance_id = fa.id
          JOIN mdata.customers c ON c.id = i.customer_id
          WHERE fa.operating_company_id = $1::uuid
            AND fa.status <> 'voided'
        )
        SELECT
          customer_id::text AS customer_id,
          MIN(customer_name)::text AS customer_name,
          ROUND(
            COALESCE(
              SUM(CASE WHEN batch_total_cents > 0 THEN reserve_amount_cents * (invoice_total_cents / batch_total_cents) ELSE 0 END),0
            ) - COALESCE(
              SUM(CASE WHEN batch_total_cents > 0 THEN release_amount_cents * (invoice_total_cents / batch_total_cents) ELSE 0 END),0
            )
          )::int AS reserve_balance_cents,
          ROUND(
            COALESCE(
              SUM(CASE WHEN batch_total_cents > 0 THEN reserve_amount_cents * (invoice_total_cents / batch_total_cents) ELSE 0 END),0
            )
          )::int AS reserve_accrued_cents,
          ROUND(
            COALESCE(
              SUM(CASE WHEN batch_total_cents > 0 THEN release_amount_cents * (invoice_total_cents / batch_total_cents) ELSE 0 END),0
            )
          )::int AS reserve_released_cents
        FROM invoice_split
        GROUP BY customer_id
        ORDER BY reserve_balance_cents DESC, customer_name ASC
      `,
      [input.operating_company_id]
    );

    const recentEvents = await client.query<ReserveEventRow>(
      `
        SELECT
          fa.id::text AS factoring_advance_id,
          fa.display_id,
          i.customer_id::text AS customer_id,
          c.customer_name,
          fa.status::text AS status,
          fa.reserve_amount_cents::int AS reserve_amount_cents,
          fa.release_amount_cents::int AS release_amount_cents,
          fa.factor_fee_cents::int AS factor_fee_cents,
          COALESCE(fa.released_at, fa.collected_at, fa.advanced_at, fa.submitted_at)::text AS occurred_at
        FROM accounting.factoring_advances fa
        JOIN LATERAL (
          SELECT customer_id
          FROM accounting.invoices
          WHERE factoring_advance_id = fa.id
          ORDER BY total_cents DESC, created_at ASC
          LIMIT 1
        ) i ON true
        JOIN mdata.customers c ON c.id = i.customer_id
        WHERE fa.operating_company_id = $1::uuid
          AND fa.status <> 'voided'
        ORDER BY COALESCE(fa.released_at, fa.collected_at, fa.advanced_at, fa.submitted_at) DESC
        LIMIT 10
      `,
      [input.operating_company_id]
    );

    return { rows: balances.rows, recent_events: recentEvents.rows };
  });
}
