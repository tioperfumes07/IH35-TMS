import type { ExhibitPeriod, ExhibitQueryClient } from "./types.js";

export type BankAccountReconRow = {
  account_id: string;
  account_label: string;
  // null (never 0) when opening_balance_source is "unavailable" — a fabricated $0 opening must
  // never be presented as a real statement-backed balance (see F425C-EXHIBIT-C-UNVERIFIED-OPENING-FEEDS-TOTAL).
  opening_balance_cents: number | null;
  inflows_cents: number;
  outflows_cents: number;
  // null when opening_balance_cents is null — a closing balance computed against a fabricated $0
  // opening is not a real number and must not be printed or summed as one.
  closing_balance_cents: number | null;
  opening_balance_source: "reconciliation_session" | "unavailable";
  reconciliation_session_id: string | null;
};

export type ExhibitC = {
  letter: "c";
  title: string;
  period_start: string;
  period_end: string;
  accounts: BankAccountReconRow[];
  // Sum of ONLY the accounts with a real, statement-backed closing balance. An account whose
  // opening balance is unavailable is excluded here (never defaulted to $0), so the total never
  // silently understates/overstates itself against a fabricated baseline.
  total_closing_cents: number;
  // Count of accounts.length - (accounts actually summed into total_closing_cents), so a reviewer
  // can see at a glance whether the total is complete without cross-checking every row's
  // opening_balance_source.
  accounts_excluded_from_total: number;
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
  // Opening cash comes from the bank reconciliation session for this exact account and period. That
  // session is the statement-backed legal source of record; never substitute current_balance_cents or
  // silently manufacture an opening value. Accounts without a matching session remain explicitly
  // unavailable so reviewers can see that the statement chain is incomplete.
  const accountsRes = await client.query<{
    id: string;
    name: string;
    mask: string | null;
    inflows: string | null;
    outflows: string | null;
    beginning_balance_cents: string | null;
    reconciliation_session_id: string | null;
  }>(
    `
      SELECT
        a.id,
        COALESCE(a.account_name, a.institution_name, 'Bank account') AS name,
        a.account_mask AS mask,
        COALESCE(flow.inflows, 0)::bigint AS inflows,
        COALESCE(flow.outflows, 0)::bigint AS outflows,
        statement.beginning_balance_cents::bigint AS beginning_balance_cents,
        statement.id::text AS reconciliation_session_id
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
      LEFT JOIN LATERAL (
        SELECT rs.id, rs.beginning_balance_cents
        FROM banking.reconciliation_sessions rs
        WHERE rs.operating_company_id = a.operating_company_id
          AND rs.bank_account_id = a.id
          AND rs.period_start = $2::date
          AND rs.period_end = $3::date
          AND rs.beginning_balance_cents IS NOT NULL
        ORDER BY
          CASE WHEN rs.status IN ('reconciled', 'closed', 'finalized') THEN 0 ELSE 1 END,
          rs.finalized_at DESC NULLS LAST,
          rs.updated_at DESC
        LIMIT 1
      ) statement ON TRUE
      WHERE a.operating_company_id = $1::uuid
        AND COALESCE(a.account_type, '') NOT LIKE 'virtual_%'
      ORDER BY a.account_name
    `,
    [input.operating_company_id, input.period_start, input.period_end]
  );

  const accounts: BankAccountReconRow[] = accountsRes.rows.map((row) => {
    const hasStatementOpening = row.beginning_balance_cents !== null;
    const inflows = Math.trunc(Number(row.inflows ?? 0));
    const outflows = Math.trunc(Number(row.outflows ?? 0));
    // F425C-EXHIBIT-C-UNVERIFIED-OPENING-FEEDS-TOTAL: opening/closing must be null, not a
    // fabricated $0, when the statement-backed opening balance is unavailable — an inflows/outflows
    // delta computed against an invented $0 baseline is not a real closing balance and must never
    // be printed or summed into total_closing_cents as if it were one.
    const opening = hasStatementOpening ? Math.trunc(Number(row.beginning_balance_cents)) : null;
    const closing = opening === null ? null : opening + inflows - outflows;
    const mask = row.mask ? ` ••••${row.mask}` : "";
    return {
      account_id: String(row.id),
      account_label: `${String(row.name)}${mask}`,
      opening_balance_cents: opening,
      inflows_cents: inflows,
      outflows_cents: outflows,
      closing_balance_cents: closing,
      opening_balance_source: hasStatementOpening ? "reconciliation_session" : "unavailable",
      reconciliation_session_id: row.reconciliation_session_id ? String(row.reconciliation_session_id) : null,
    };
  });

  const total_closing_cents = accounts.reduce(
    (sum, row) => sum + (row.closing_balance_cents ?? 0),
    0,
  );
  const accounts_excluded_from_total = accounts.filter((row) => row.closing_balance_cents === null).length;

  return {
    letter: "c",
    title: "Exhibit C — Bank reconciliation summary",
    period_start: input.period_start,
    period_end: input.period_end,
    accounts,
    total_closing_cents,
    accounts_excluded_from_total,
  };
}
