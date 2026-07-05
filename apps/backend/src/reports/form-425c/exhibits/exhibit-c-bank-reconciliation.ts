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
  // REAL schema (db/migrations/0072,0073). Inflows/outflows GROUP ON is_credit (canonical direction
  // flag), NEVER the amount_cents sign (amount_cents is Plaid-signed; a sign test swaps in/out).
  // Own-transfers excluded (mirrors bank-feed-gl-posting.service.ts:155). account_name/account_mask
  // are the real columns (a.name/a.mask were phantom). NO .catch(): fail loud, not a blank exhibit.
  //
  // OPENING BALANCE — DEFERRED / FLAGGED FOR JORGE + COUNSEL: there is NO migration-free per-account
  // historical daily-balance source (banking.bank_account_balances does not exist in any migration;
  // it was phantom). We therefore report opening_balance_cents = 0 here rather than fabricate a court
  // number. Consequence: closing_balance_cents = net flow only and will NOT tie to the Wells Fargo
  // statement ending balance until a per-account opening anchor exists (needs a banking.* snapshot
  // table — a migration, CLAUDE.md §1.4 STOP-gate, Jorge's decision). Do NOT file Exhibit C closing
  // balances as authoritative until this anchor is set. See REPAIR spec §5.2.
  const accountsRes = await client.query<{
    id: string;
    name: string;
    mask: string | null;
    inflows: string | null;
    outflows: string | null;
  }>(
    `
      SELECT
        a.id,
        COALESCE(a.account_name, a.institution_name, 'Bank account') AS name,
        a.account_mask AS mask,
        COALESCE(flow.inflows, 0)::bigint AS inflows,
        COALESCE(flow.outflows, 0)::bigint AS outflows
      FROM banking.bank_accounts a
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(CASE WHEN bt.is_credit THEN abs(bt.amount_cents) END), 0)::bigint AS inflows,
          COALESCE(SUM(CASE WHEN NOT bt.is_credit THEN abs(bt.amount_cents) END), 0)::bigint AS outflows
        FROM banking.bank_transactions bt
        WHERE bt.bank_account_id = a.id
          AND bt.transaction_date >= $2::date
          AND bt.transaction_date <= $3::date
          AND bt.review_state IS DISTINCT FROM 'transfer'
          AND bt.transfer_kind IS NULL
          AND bt.destination_bank_account_id IS NULL
      ) flow ON TRUE
      WHERE a.operating_company_id = $1
        AND COALESCE(a.account_type, '') NOT LIKE 'virtual_%'
      ORDER BY a.account_name
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  );

  const accounts: BankAccountReconRow[] = accountsRes.rows.map((row) => {
    // Opening balance deferred (no migration-free per-account historical source) — see header note.
    const opening = 0;
    const inflows = Math.trunc(Number(row.inflows ?? 0));
    const outflows = Math.trunc(Number(row.outflows ?? 0));
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
