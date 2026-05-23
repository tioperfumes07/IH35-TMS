import { withLuciaBypass } from "../../auth/db.js";
import { createJournalEntry } from "../journal-entries.service.js";
import { resolveRoleAccount } from "../coa-roles/resolver.service.js";
import { resolveAccountForCategory } from "../expense-category-map/resolver.service.js";

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

export async function postFactoringFeeExpenseEvent(input: {
  operating_company_id: string;
  factoring_advance_id: string;
  factor_fee_cents: number;
  released_at_iso: string;
  actor: Actor;
}) {
  if (input.factor_fee_cents <= 0) return { posted: false };

  const context = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const advanceRes = await client.query<{ display_id: string }>(
      `
        SELECT display_id
        FROM accounting.factoring_advances
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.factoring_advance_id, input.operating_company_id]
    );
    const advance = advanceRes.rows[0];
    if (!advance) throw new Error("factoring_advance_not_found");

    const memo = `Factoring fee expense ${advance.display_id}`;
    const existing = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM accounting.journal_entries
        WHERE operating_company_id = $1::uuid
          AND source = 'auto'
          AND memo = $2
        LIMIT 1
      `,
      [input.operating_company_id, memo]
    );
    if (existing.rows[0]?.id) {
      return {
        already_posted: true,
        memo,
        fee_account_id: "",
        ar_account_id: "",
      };
    }

    const feeMapping = await resolveAccountForCategory(input.operating_company_id, "factoring_fee", "default");
    const arAccountId = await resolveRoleAccount(client, input.operating_company_id, "ar_control");
    return {
      already_posted: false,
      memo,
      fee_account_id: feeMapping.account_id,
      ar_account_id: arAccountId,
    };
  });

  if (context.already_posted) return { posted: false };

  await createJournalEntry(
    {
      operating_company_id: input.operating_company_id,
      entry_date: input.released_at_iso.slice(0, 10),
      memo: context.memo,
      source: "auto",
      postings: [
        {
          account_id: context.fee_account_id,
          debit_or_credit: "debit",
          amount_cents: input.factor_fee_cents,
          description: "Factoring fee expense",
        },
        {
          account_id: context.ar_account_id,
          debit_or_credit: "credit",
          amount_cents: input.factor_fee_cents,
          description: "Factoring fee netted against customer collection",
        },
      ],
    },
    { userId: input.actor.user_id, role: input.actor.role }
  );

  return { posted: true };
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
