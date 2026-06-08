import type { ExhibitPeriod, ExhibitQueryClient } from "./types.js";

export type BankAccountReconRow = {
  account_id: string;
  account_label: string;
  opening_balance_cents: number;
  inflows_cents: number;
  outflows_cents: number;
  closing_balance_cents: number;
};

export type ExhibitC = {
  letter: "c";
  title: string;
  period_start: string;
  period_end: string;
  accounts: BankAccountReconRow[];
  total_closing_cents: number;
};

export async function buildExhibitC(
  client: ExhibitQueryClient,
  input: ExhibitPeriod
): Promise<ExhibitC> {
  const accountsRes = await client.query<{
    id: string;
    name: string;
    mask: string | null;
    opening_balance: string | null;
    inflows: string | null;
    outflows: string | null;
  }>(
    `
      SELECT
        a.id,
        COALESCE(a.name, a.institution_name, 'Bank account') AS name,
        a.mask,
        COALESCE(opening.amount, 0)::numeric AS opening_balance,
        COALESCE(flow.inflows, 0)::numeric AS inflows,
        COALESCE(flow.outflows, 0)::numeric AS outflows
      FROM banking.bank_accounts a
      LEFT JOIN LATERAL (
        SELECT COALESCE(bb.current_balance, 0)::numeric AS amount
        FROM banking.bank_account_balances bb
        WHERE bb.account_id = a.id
          AND bb.computed_at < $2::date
        ORDER BY bb.computed_at DESC
        LIMIT 1
      ) opening ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(CASE WHEN bt.amount > 0 THEN bt.amount ELSE 0 END), 0)::numeric AS inflows,
          COALESCE(SUM(CASE WHEN bt.amount < 0 THEN abs(bt.amount) ELSE 0 END), 0)::numeric AS outflows
        FROM banking.bank_transactions bt
        WHERE bt.account_id = a.id
          AND bt.txn_date >= $2::date
          AND bt.txn_date <= $3::date
      ) flow ON TRUE
      WHERE a.operating_company_id = $1
        AND a.is_dip = true
        AND COALESCE(a.account_type, '') NOT LIKE 'virtual_%'
        AND COALESCE(a.tag, '') NOT IN ('Factoring', 'Escrow')
      ORDER BY a.name
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  ).catch(() => ({ rows: [] }));

  const accounts: BankAccountReconRow[] = accountsRes.rows.map((row) => {
    const opening = Math.round(Number(row.opening_balance ?? 0) * 100);
    const inflows = Math.round(Number(row.inflows ?? 0) * 100);
    const outflows = Math.round(Number(row.outflows ?? 0) * 100);
    const closing = opening + inflows - outflows;
    const mask = row.mask ? ` ••••${row.mask}` : "";
    return {
      account_id: String(row.id),
      account_label: `${String(row.name)}${mask}`,
      opening_balance_cents: opening,
      inflows_cents: inflows,
      outflows_cents: outflows,
      closing_balance_cents: closing,
    };
  });

  const total_closing_cents = accounts.reduce((sum, row) => sum + row.closing_balance_cents, 0);

  return {
    letter: "c",
    title: "Exhibit C — Bank reconciliation summary",
    period_start: input.period_start,
    period_end: input.period_end,
    accounts,
    total_closing_cents,
  };
}
