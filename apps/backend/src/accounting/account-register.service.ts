// D5 / CA-05 — read-only per-account register (running-balance ledger over the chart of accounts).
// Reuses accounting.fn_account_balances_as_of for the opening balance + the account's normal-balance side,
// then walks the period's postings in date order to produce a natural-sign running balance.
// Read-only: no posting, no mutation. Voided journal entries are excluded (their reversing entry is a
// separate posted JE, so the net is already correct).

type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type NormalBalance = "debit" | "credit";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  bill: "Bill",
  customer_payment: "Invoice Payment",
  bill_payment: "Bill Payment",
  cash_advance: "Cash Advance",
  driver_advance: "Driver Advance",
  settlement: "Settlement",
  transfer: "Transfer",
  expense: "Expense",
};

export type RawPosting = {
  posting_id: string;
  journal_entry_id: string;
  entry_date: string;
  memo: string | null;
  description: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  source_transaction_type: string | null;
  source_transaction_id: string | null;
};

export type AccountRegisterRow = {
  posting_id: string;
  journal_entry_id: string;
  entry_date: string;
  type: string;
  reference: string | null;
  memo: string | null;
  description: string | null;
  debit_cents: number;
  credit_cents: number;
  running_balance_cents: number;
};

export type AccountRegisterReport = {
  account: {
    account_id: string;
    account_code: string;
    account_name: string;
    account_type: string;
    normal_balance: NormalBalance;
  };
  from_date: string;
  to_date: string;
  opening_balance_cents: number;
  closing_balance_cents: number;
  total_debit_cents: number;
  total_credit_cents: number;
  transaction_count: number;
  rows: AccountRegisterRow[];
  generated_at: string;
};

/**
 * Pure register builder (unit-tested). Walks postings in order, producing a NATURAL-sign running balance:
 * for a debit-normal account the balance rises on debits; for a credit-normal account it rises on credits.
 * `openingNaturalCents` is the opening balance already expressed in the account's natural sign.
 */
export function buildRegisterRows(
  openingNaturalCents: number,
  normal: NormalBalance,
  postings: RawPosting[]
): { rows: AccountRegisterRow[]; total_debit_cents: number; total_credit_cents: number; closing_balance_cents: number } {
  let running = openingNaturalCents;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows = postings.map((p): AccountRegisterRow => {
    const amt = Number(p.amount_cents) || 0;
    const debit = p.debit_or_credit === "debit" ? amt : 0;
    const credit = p.debit_or_credit === "credit" ? amt : 0;
    totalDebit += debit;
    totalCredit += credit;
    running += normal === "debit" ? debit - credit : credit - debit;
    return {
      posting_id: p.posting_id,
      journal_entry_id: p.journal_entry_id,
      entry_date: p.entry_date,
      type: p.source_transaction_type
        ? SOURCE_TYPE_LABELS[p.source_transaction_type] ?? p.source_transaction_type
        : "Journal Entry",
      reference: p.source_transaction_id ?? null,
      memo: p.memo ?? null,
      description: p.description ?? null,
      debit_cents: debit,
      credit_cents: credit,
      running_balance_cents: running,
    };
  });
  return { rows, total_debit_cents: totalDebit, total_credit_cents: totalCredit, closing_balance_cents: running };
}

type BalanceFnRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: string;
  opening_balance_cents: string | number | null;
};

/** Build the register for one account over [from_date, to_date]. `client` must already be company-scoped (RLS set). */
export async function getAccountRegister(
  client: QueryableClient,
  input: {
    operating_company_id: string;
    account_id: string;
    from_date: string;
    to_date: string;
    search?: string | null;
    type?: string | null;
  }
): Promise<AccountRegisterReport> {
  // Opening balance + account meta from the shared balances function. opening_balance_cents is the raw net
  // (debits - credits) through (from_date - 1 day); flip to the account's natural sign for a credit-normal account.
  const balRes = await client.query<BalanceFnRow>(
    `SELECT account_id::text, account_code, account_name, account_type, normal_balance, opening_balance_cents
       FROM accounting.fn_account_balances_as_of($1::uuid, $2::date, $3::date)`,
    [input.operating_company_id, input.to_date, input.from_date]
  );
  const acct = balRes.rows.find((r) => r.account_id === input.account_id);
  if (!acct) throw new Error("account_not_found");
  const normal: NormalBalance = acct.normal_balance === "debit" ? "debit" : "credit";
  const openingRaw = acct.opening_balance_cents != null ? Number(acct.opening_balance_cents) : 0;
  const openingNatural = normal === "credit" ? -openingRaw : openingRaw;

  const params: unknown[] = [input.operating_company_id, input.account_id, input.from_date, input.to_date];
  let where = `p.operating_company_id = $1::uuid AND p.account_id = $2::uuid
      AND je.entry_date >= $3::date AND je.entry_date <= $4::date AND je.status <> 'voided'`;
  if (input.type) {
    params.push(input.type);
    where += ` AND p.source_transaction_type = $${params.length}`;
  }
  if (input.search && input.search.trim()) {
    params.push(`%${input.search.trim()}%`);
    const i = params.length;
    where += ` AND (p.description ILIKE $${i} OR je.memo ILIKE $${i} OR p.source_transaction_id ILIKE $${i})`;
  }

  const res = await client.query<RawPosting & { amount_cents: string | number }>(
    `SELECT p.id::text AS posting_id, je.id::text AS journal_entry_id, je.entry_date::text AS entry_date,
            je.memo, p.description, p.debit_or_credit, p.amount_cents::bigint AS amount_cents,
            p.source_transaction_type, p.source_transaction_id
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je
         ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
      WHERE ${where}
      ORDER BY je.entry_date ASC, p.line_sequence ASC, p.created_at ASC`,
    params
  );
  const postings: RawPosting[] = res.rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));

  const { rows, total_debit_cents, total_credit_cents, closing_balance_cents } = buildRegisterRows(
    openingNatural,
    normal,
    postings
  );

  return {
    account: {
      account_id: acct.account_id,
      account_code: acct.account_code,
      account_name: acct.account_name,
      account_type: acct.account_type,
      normal_balance: normal,
    },
    from_date: input.from_date,
    to_date: input.to_date,
    opening_balance_cents: openingNatural,
    closing_balance_cents,
    total_debit_cents,
    total_credit_cents,
    transaction_count: rows.length,
    rows,
    generated_at: new Date().toISOString(),
  };
}
