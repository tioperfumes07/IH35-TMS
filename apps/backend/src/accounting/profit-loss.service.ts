import { withCurrentUser } from "../auth/db.js";

type ProfitLossAggregateRowDb = {
  account_code: string;
  account_name: string;
  account_type: string;
  total_debits: string | number;
  total_credits: string | number;
};

export type ProfitLossLine = {
  account_code: string;
  account_name: string;
  account_type: string;
  amount: number;
};

export type ProfitLossSection = {
  lines: ProfitLossLine[];
  total: number;
};

export type ProfitLossReport = {
  revenue: ProfitLossSection;
  cogs: ProfitLossSection;
  gross_profit: number;
  operating_expenses: ProfitLossSection;
  net_income: number;
};

const REVENUE_TYPES = new Set(["Income", "OtherIncome"]);
const COGS_TYPES = new Set(["CostOfGoodsSold"]);
const OPERATING_EXPENSE_TYPES = new Set(["Expense", "OtherExpense"]);

export async function getProfitLossReport(input: {
  userId: string;
  operating_company_id: string;
  from_date?: string;
  to_date?: string;
}): Promise<ProfitLossReport> {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const values: unknown[] = [input.operating_company_id];
    const dateFilters: string[] = [];

    if (input.from_date) {
      values.push(input.from_date);
      dateFilters.push(`je.entry_date >= $${values.length}::date`);
    }
    if (input.to_date) {
      values.push(input.to_date);
      dateFilters.push(`je.entry_date <= $${values.length}::date`);
    }

    const dateSql = dateFilters.length > 0 ? `\n          AND ${dateFilters.join("\n          AND ")}` : "";

    const res = await client.query<ProfitLossAggregateRowDb>(
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
          AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))${dateSql}
        GROUP BY a.account_number, a.account_name, a.account_type
        ORDER BY a.account_number ASC NULLS LAST, a.account_name ASC
      `,
      values
    );

    const revenueLines: ProfitLossLine[] = [];
    const cogsLines: ProfitLossLine[] = [];
    const operatingExpenseLines: ProfitLossLine[] = [];

    for (const row of res.rows) {
      const totalDebits = Number(row.total_debits ?? 0);
      const totalCredits = Number(row.total_credits ?? 0);
      const accountType = row.account_type;

      if (REVENUE_TYPES.has(accountType)) {
        revenueLines.push({
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: accountType,
          amount: totalCredits - totalDebits,
        });
        continue;
      }

      if (COGS_TYPES.has(accountType)) {
        cogsLines.push({
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: accountType,
          amount: totalDebits - totalCredits,
        });
        continue;
      }

      if (OPERATING_EXPENSE_TYPES.has(accountType)) {
        operatingExpenseLines.push({
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: accountType,
          amount: totalDebits - totalCredits,
        });
      }
    }

    const revenueTotal = revenueLines.reduce((sum, line) => sum + line.amount, 0);
    const cogsTotal = cogsLines.reduce((sum, line) => sum + line.amount, 0);
    const operatingExpensesTotal = operatingExpenseLines.reduce((sum, line) => sum + line.amount, 0);
    const grossProfit = revenueTotal - cogsTotal;
    const netIncome = revenueTotal - cogsTotal - operatingExpensesTotal;

    return {
      revenue: { lines: revenueLines, total: revenueTotal },
      cogs: { lines: cogsLines, total: cogsTotal },
      gross_profit: grossProfit,
      operating_expenses: { lines: operatingExpenseLines, total: operatingExpensesTotal },
      net_income: netIncome,
    };
  });
}
