import { withCurrentUser } from "../auth/db.js";

type BalanceSheetAccountRowDb = {
  account_code: string;
  account_name: string;
  account_type: string;
  total_debits: string | number;
  total_credits: string | number;
};

type CurrentYearEarningsRowDb = {
  account_type: string;
  total_debits: string | number;
  total_credits: string | number;
};

export type BalanceSheetLine = {
  account_code: string;
  account_name: string;
  account_type: string;
  amount: number;
};

export type BalanceSheetSection = {
  lines: BalanceSheetLine[];
  total: number;
};

export type BalanceSheetEquitySection = BalanceSheetSection & {
  current_year_earnings: number;
};

export type BalanceSheetReport = {
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetEquitySection;
  total_liabilities_and_equity: number;
  balanced: boolean;
};

const ASSET_TYPES = new Set(["Asset"]);
const LIABILITY_TYPES = new Set(["Liability"]);
const EQUITY_TYPES = new Set(["Equity"]);
const REVENUE_TYPES = new Set(["Income", "OtherIncome"]);
const EXPENSE_TYPES = new Set(["CostOfGoodsSold", "Expense", "OtherExpense"]);

export async function getBalanceSheetReport(input: {
  userId: string;
  operating_company_id: string;
  as_of_date: string;
}): Promise<BalanceSheetReport> {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const balanceSheetRows = await client.query<BalanceSheetAccountRowDb>(
      `
        SELECT
          COALESCE(a.account_number, '') AS account_code,
          COALESCE(a.account_name, '') AS account_name,
          COALESCE(a.account_type, '') AS account_type,
          COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_debits,
          COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_credits
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je
          ON je.id = p.journal_entry_uuid
         AND je.operating_company_id = p.operating_company_id
        LEFT JOIN accounting.posting_batches pb
          ON pb.id = p.posting_batch_id
         AND pb.operating_company_id = p.operating_company_id
        LEFT JOIN catalogs.accounts a
          ON a.id = p.account_id
        WHERE p.operating_company_id = $1::uuid
          AND je.status <> 'voided'
          AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
          AND je.entry_date <= $2::date
          AND a.account_type IN ('Asset', 'Liability', 'Equity')
        GROUP BY a.account_number, a.account_name, a.account_type
        ORDER BY a.account_number ASC NULLS LAST, a.account_name ASC
      `,
      [input.operating_company_id, input.as_of_date]
    );

    const assetsLines: BalanceSheetLine[] = [];
    const liabilitiesLines: BalanceSheetLine[] = [];
    const equityBaseLines: BalanceSheetLine[] = [];

    for (const row of balanceSheetRows.rows) {
      const debits = Number(row.total_debits ?? 0);
      const credits = Number(row.total_credits ?? 0);
      const line: BalanceSheetLine = {
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        amount: 0,
      };

      if (ASSET_TYPES.has(row.account_type)) {
        line.amount = debits - credits;
        assetsLines.push(line);
        continue;
      }

      if (LIABILITY_TYPES.has(row.account_type)) {
        line.amount = credits - debits;
        liabilitiesLines.push(line);
        continue;
      }

      if (EQUITY_TYPES.has(row.account_type)) {
        line.amount = credits - debits;
        equityBaseLines.push(line);
      }
    }

    const currentYearEarningsRows = await client.query<CurrentYearEarningsRowDb>(
      `
        SELECT
          COALESCE(a.account_type, '') AS account_type,
          COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_debits,
          COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END), 0)::bigint AS total_credits
        FROM accounting.journal_entry_postings p
        JOIN accounting.journal_entries je
          ON je.id = p.journal_entry_uuid
         AND je.operating_company_id = p.operating_company_id
        LEFT JOIN accounting.posting_batches pb
          ON pb.id = p.posting_batch_id
         AND pb.operating_company_id = p.operating_company_id
        LEFT JOIN catalogs.accounts a
          ON a.id = p.account_id
        WHERE p.operating_company_id = $1::uuid
          AND je.status <> 'voided'
          AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
          AND je.entry_date <= $2::date
          AND a.account_type IN ('Income', 'OtherIncome', 'CostOfGoodsSold', 'Expense', 'OtherExpense')
          AND je.id NOT IN (
            SELECT ap.retained_earnings_entry_id
            FROM accounting.periods ap
            WHERE ap.operating_company_id = $1::uuid
              AND ap.retained_earnings_entry_id IS NOT NULL
          )
        GROUP BY a.account_type
      `,
      [input.operating_company_id, input.as_of_date]
    );

    let revenueTotal = 0;
    let expenseTotal = 0;
    for (const row of currentYearEarningsRows.rows) {
      const debits = Number(row.total_debits ?? 0);
      const credits = Number(row.total_credits ?? 0);
      if (REVENUE_TYPES.has(row.account_type)) {
        revenueTotal += credits - debits;
      } else if (EXPENSE_TYPES.has(row.account_type)) {
        expenseTotal += debits - credits;
      }
    }
    const currentYearEarnings = revenueTotal - expenseTotal;

    const assetsTotal = assetsLines.reduce((sum, line) => sum + line.amount, 0);
    const liabilitiesTotal = liabilitiesLines.reduce((sum, line) => sum + line.amount, 0);
    const equityBaseTotal = equityBaseLines.reduce((sum, line) => sum + line.amount, 0);
    const equityTotal = equityBaseTotal + currentYearEarnings;
    const totalLiabilitiesAndEquity = liabilitiesTotal + equityTotal;
    const balanced = assetsTotal === totalLiabilitiesAndEquity;

    return {
      assets: { lines: assetsLines, total: assetsTotal },
      liabilities: { lines: liabilitiesLines, total: liabilitiesTotal },
      equity: {
        lines: equityBaseLines,
        current_year_earnings: currentYearEarnings,
        total: equityTotal,
      },
      total_liabilities_and_equity: totalLiabilitiesAndEquity,
      balanced,
    };
  });
}
