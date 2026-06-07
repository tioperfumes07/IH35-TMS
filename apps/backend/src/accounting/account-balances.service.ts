import { withCurrentUser } from "../auth/db.js";
import { applyCashBasisSuppression, type CashBasisEntry } from "./cash-basis/engine.js";

export type AccountBalanceRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: "debit" | "credit";
  opening_balance_cents: number | null;
  period_debits_cents: number;
  period_credits_cents: number;
  period_activity_cents: number;
  closing_balance_cents: number;
};

type AccountBalanceRowDb = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: string;
  opening_balance_cents: string | number | null;
  period_debits_cents: string | number;
  period_credits_cents: string | number;
  period_activity_cents: string | number;
  closing_balance_cents: string | number;
};

export type AccountBalancesReport = {
  accounts: AccountBalanceRow[];
  as_of_date: string;
  from_date: string | null;
  basis: "accrual" | "cash";
  generated_at: string;
};

function inferSourceType(row: { account_code: string; account_name: string; account_type: string }): CashBasisEntry["source_type"] {
  const hint = `${row.account_code} ${row.account_name}`.toLowerCase();
  if (row.account_type === "Asset" && (hint.includes("accounts receivable") || hint.includes("a/r"))) {
    return "ar_control";
  }
  if (row.account_type === "Liability" && (hint.includes("accounts payable") || hint.includes("a/p"))) {
    return "ap_control";
  }
  return "other";
}

function applyAccountBalancesCashBasis(rows: AccountBalanceRow[], asOfDate: string): AccountBalanceRow[] {
  // Map each account row to a CashBasisEntry using the closing_balance as the amount.
  // applyCashBasisSuppression zeroes AR/AP accounts (decision Q3) and passes others through.
  const entries: CashBasisEntry[] = rows.map((row) => ({
    entry_id: row.account_id,
    account_code: row.account_code,
    account_name: row.account_name,
    account_type: row.account_type,
    amount_cents: row.closing_balance_cents,
    source_type: inferSourceType(row),
  }));

  const suppressed = applyCashBasisSuppression(entries, { as_of_date: asOfDate });

  // Re-map back: for suppressed (zeroed) accounts, zero all balance fields.
  return rows.map((row, i) => {
    const adjustedClosing = suppressed[i]?.amount_cents ?? row.closing_balance_cents;
    const scale = row.closing_balance_cents !== 0 ? adjustedClosing / row.closing_balance_cents : 0;
    if (adjustedClosing === 0 && row.closing_balance_cents !== 0) {
      // Suppressed — zero everything.
      return {
        ...row,
        opening_balance_cents: row.opening_balance_cents !== null ? 0 : null,
        period_debits_cents: 0,
        period_credits_cents: 0,
        period_activity_cents: 0,
        closing_balance_cents: 0,
      };
    }
    // For factoring advance reclassification or other adjustments, close proportionally.
    const scaledActivity = Math.round(row.period_activity_cents * scale);
    const scaledOpening = row.opening_balance_cents !== null ? Math.round(row.opening_balance_cents * scale) : null;
    return {
      ...row,
      account_type: suppressed[i]?.account_type ?? row.account_type,
      opening_balance_cents: scaledOpening,
      period_activity_cents: scaledActivity,
      closing_balance_cents: adjustedClosing,
    };
  });
}

export async function getAccountBalances(input: {
  userId: string;
  operating_company_id: string;
  as_of_date: string;
  from_date?: string | null;
  basis?: "accrual" | "cash";
}): Promise<AccountBalancesReport> {
  const basis = input.basis ?? "accrual";

  const rows = await withCurrentUser(input.userId, async (client) => {
    await client.query(
      `SELECT set_config('app.operating_company_id', $1::text, true)`,
      [input.operating_company_id]
    );

    const res = await client.query<AccountBalanceRowDb>(
      `SELECT * FROM accounting.fn_account_balances_as_of($1::uuid, $2::date, $3::date)`,
      [input.operating_company_id, input.as_of_date, input.from_date ?? null]
    );

    return res.rows.map((row): AccountBalanceRow => ({
      account_id: row.account_id,
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      normal_balance: row.normal_balance === "debit" ? "debit" : "credit",
      opening_balance_cents: row.opening_balance_cents !== null ? Number(row.opening_balance_cents) : null,
      period_debits_cents: Number(row.period_debits_cents ?? 0),
      period_credits_cents: Number(row.period_credits_cents ?? 0),
      period_activity_cents: Number(row.period_activity_cents ?? 0),
      closing_balance_cents: Number(row.closing_balance_cents ?? 0),
    }));
  });

  const accounts = basis === "cash"
    ? applyAccountBalancesCashBasis(rows, input.as_of_date)
    : rows;

  return {
    accounts,
    as_of_date: input.as_of_date,
    from_date: input.from_date ?? null,
    basis,
    generated_at: new Date().toISOString(),
  };
}
