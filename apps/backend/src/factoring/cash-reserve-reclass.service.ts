// Lead 2026-10-02: "A NEGATIVE RESERVE IS A LIABILITY, NOT A NEGATIVE ASSET ... At period end a credit balance in 1235
// reclassifies to a payable to Faro" — "a negative cash reserve presents as a payable to Faro, never a negative asset."
//
// At close, when the Faro Cash Reserve (1235, factor_cash_reserve_held) carries a credit balance on the period end, one
// reclass entry dated the period end moves it to 2156 Due to Faro (factor_cash_reserve_deficit_payable) — DR 1235 / CR 2156
// — and its reversal dated the next day puts it back (DR 2156 / CR 1235), so the next period runs on Faro's own balance.
// Both entries are stamped source 'faro_cash_reserve_reclass' = the reclass row. Month close cannot lock while a deficit is
// unreclassed or the reclass no longer matches the deficit (void its two entries and post again).
import { resolveRoleAccount } from "../accounting/coa-roles/resolver.service.js";
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export const RECLASS_SOURCE = "faro_cash_reserve_reclass";

export class CashReserveReclassError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** 1235's balance (debit-positive) at the period end, without the reclass entries themselves. */
export async function cashReserveBalanceCents(client: DbClient, oci: string, periodEnd: string): Promise<number | null> {
  const r = await client.query<{ bound: boolean; cents: string | null }>(
    `SELECT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid AND role = 'factor_cash_reserve_held' AND is_active) AS bound,
            (SELECT sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END)
               FROM accounting.journal_entry_postings p
               JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.status = 'posted'
               JOIN accounting.chart_of_accounts_roles r
                 ON r.account_id = p.account_id AND r.operating_company_id = je.operating_company_id
                AND r.role = 'factor_cash_reserve_held' AND r.is_active
              WHERE je.operating_company_id = $1::uuid AND je.entry_date <= $2::date
                AND p.source_transaction_type IS DISTINCT FROM $3)::text AS cents`,
    [oci, periodEnd, RECLASS_SOURCE]
  );
  if (!r.rows[0]?.bound) return null;
  return Number(r.rows[0].cents ?? 0);
}

/** The live reclass for a period: its reclass entry still posted. */
async function liveReclass(client: DbClient, oci: string, periodEnd: string) {
  const r = await client.query<{ id: string; deficit_cents: string; journal_entry_id: string; reversal_journal_entry_id: string }>(
    `SELECT x.id::text, x.deficit_cents::text, x.journal_entry_id::text, x.reversal_journal_entry_id::text
       FROM accounting.faro_cash_reserve_reclasses x
       JOIN accounting.journal_entries je ON je.id = x.journal_entry_id AND je.status = 'posted'
      WHERE x.operating_company_id = $1::uuid AND x.period_end = $2::date
      ORDER BY x.posted_at DESC LIMIT 1`,
    [oci, periodEnd]
  );
  const row = r.rows[0];
  return row ? { ...row, deficit_cents: Number(row.deficit_cents) } : null;
}

export async function cashReserveReclassStatus(client: DbClient, oci: string, periodEnd: string) {
  const balance = await cashReserveBalanceCents(client, oci, periodEnd);
  const deficit = balance != null && balance < 0 ? -balance : 0;
  const live = await liveReclass(client, oci, periodEnd);
  const state = deficit === 0 ? (live ? "stale" : "no_deficit") : !live ? "due" : live.deficit_cents === deficit ? "reclassed" : "stale";
  return {
    period_end: periodEnd,
    register_bound: balance != null,
    balance_cents: balance,
    deficit_cents: deficit,
    reclass: live,
    state,
    complete: state === "no_deficit" || state === "reclassed",
  };
}

export async function postCashReserveReclass(
  client: DbClient,
  input: { operating_company_id: string; period_end: string; actor_user_id: string; actor_role: string }
) {
  const oci = input.operating_company_id;
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('faro_cash_reserve_reclass:' || $1 || ':' || $2))`, [oci, input.period_end]);
  const status = await cashReserveReclassStatus(client, oci, input.period_end);
  if (!status.register_bound) throw new CashReserveReclassError("faro_cash_reserve_register_not_bound");
  if (status.reclass) throw new CashReserveReclassError(status.state === "stale" ? "faro_cash_reserve_reclass_stale_void_and_repost" : "faro_cash_reserve_already_reclassed");
  if (status.deficit_cents <= 0) throw new CashReserveReclassError("faro_cash_reserve_no_deficit");

  const cash = await resolveRoleAccount(client as never, oci, "factor_cash_reserve_held");
  const payable = await resolveRoleAccount(client as never, oci, "factor_cash_reserve_deficit_payable");
  const row = await client.query<{ id: string }>(
    `INSERT INTO accounting.faro_cash_reserve_reclasses (operating_company_id, period_end, deficit_cents, posted_by_user_id)
     VALUES ($1::uuid, $2::date, $3, $4::uuid) RETURNING id::text`,
    [oci, input.period_end, status.deficit_cents, input.actor_user_id]
  );
  const id = row.rows[0]!.id;
  const stamp = { source_transaction_type: RECLASS_SOURCE, source_transaction_id: id };
  const amount = status.deficit_cents;
  const memo = `Faro Cash Reserve deficit at ${input.period_end} presented as Due to Faro`;
  const actor = { userId: input.actor_user_id, role: input.actor_role };
  const je = await createJournalEntryOnClient(
    client as never,
    {
      operating_company_id: oci,
      entry_date: input.period_end,
      memo,
      source: "auto",
      postings: [
        { account_id: cash, debit_or_credit: "debit", amount_cents: amount, description: memo, ...stamp },
        { account_id: payable, debit_or_credit: "credit", amount_cents: amount, description: memo, ...stamp },
      ],
    },
    actor
  );
  const reversalMemo = `Reverse ${memo}`;
  const reversal = await createJournalEntryOnClient(
    client as never,
    {
      operating_company_id: oci,
      entry_date: nextDay(input.period_end),
      memo: reversalMemo,
      source: "auto",
      postings: [
        { account_id: payable, debit_or_credit: "debit", amount_cents: amount, description: reversalMemo, ...stamp },
        { account_id: cash, debit_or_credit: "credit", amount_cents: amount, description: reversalMemo, ...stamp },
      ],
    },
    actor
  );
  await client.query(
    `UPDATE accounting.faro_cash_reserve_reclasses SET journal_entry_id = $2::uuid, reversal_journal_entry_id = $3::uuid WHERE id = $1::uuid`,
    [id, je.id, reversal.id]
  );
  return { reclass_id: id, deficit_cents: amount, journal_entry_id: je.id, reversal_journal_entry_id: reversal.id };
}
