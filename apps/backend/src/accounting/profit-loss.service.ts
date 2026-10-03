import { withCurrentUser } from "../auth/db.js";

type ProfitLossAggregateRowDb = {
  account_id: string | null;
  account_code: string;
  account_name: string;
  account_type: string;
  total_debits: string | number;
  total_credits: string | number;
};

export type ProfitLossLine = {
  account_id?: string;
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
  /** ROUND 384: accounts whose account_type no P&L bucket claims, with activity. Empty when the chart
   *  is fully mapped. Never folded into a total — an unclassified line is a question, not a number. */
  unclassified: ProfitLossSection;
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
          a.id::text AS account_id,
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
         AND a.operating_company_id = p.operating_company_id
        WHERE p.operating_company_id = $1::uuid
          AND je.status <> 'voided'
          AND COALESCE(je.is_sample_data, false) = false
          AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))${dateSql}
          -- ACCT-F5656 — a period-close's own closing entry zeroes every revenue/expense account by
          -- posting the mirror-image of that period's activity (Dr revenue / Cr expense, net to
          -- Retained Earnings), dated on the closed period's own last day. Without this exclusion
          -- (matching balance-sheet.service.ts's already-established pattern for the same JE), a P&L
          -- run for a date range spanning a closed period's close date nets the original activity
          -- against the closing entry's own zeroing postings — collapsing that period's revenue and
          -- expense to roughly zero instead of showing what was actually earned/spent. Currently
          -- latent (no period has been closed on any entity yet), armed for the first close.
          AND je.id NOT IN (
            SELECT ap.retained_earnings_entry_id
            FROM accounting.periods ap
            WHERE ap.operating_company_id = $1::uuid
              AND ap.retained_earnings_entry_id IS NOT NULL
          )
        GROUP BY a.id, a.account_number, a.account_name, a.account_type
        ORDER BY a.account_number ASC NULLS LAST, a.account_name ASC
      `,
      values
    );

    const revenueLines: ProfitLossLine[] = [];
    const cogsLines: ProfitLossLine[] = [];
    const operatingExpenseLines: ProfitLossLine[] = [];
    // ROUND 384: accounts whose account_type no bucket claims. Surfaced, never dropped.
    const unclassifiedLines: ProfitLossLine[] = [];

    for (const row of res.rows) {
      const totalDebits = Number(row.total_debits ?? 0);
      const totalCredits = Number(row.total_credits ?? 0);
      const accountType = row.account_type;

      if (REVENUE_TYPES.has(accountType)) {
        revenueLines.push({
          ...(row.account_id ? { account_id: row.account_id } : {}),
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: accountType,
          amount: totalCredits - totalDebits,
        });
        continue;
      }

      if (COGS_TYPES.has(accountType)) {
        cogsLines.push({
          ...(row.account_id ? { account_id: row.account_id } : {}),
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: accountType,
          amount: totalDebits - totalCredits,
        });
        continue;
      }

      if (OPERATING_EXPENSE_TYPES.has(accountType)) {
        operatingExpenseLines.push({
          ...(row.account_id ? { account_id: row.account_id } : {}),
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: accountType,
          amount: totalDebits - totalCredits,
        });
        continue;
      }

      // ROUND 384 (Lead, 2026-10-03) — AN UNMAPPED ACCOUNT TYPE USED TO FALL OFF THE P&L IN SILENCE.
      //
      // The three branches above cover Income, OtherIncome, CostOfGoodsSold, Expense and OtherExpense.
      // Anything else simply reached the end of the loop and was never pushed anywhere: no line, no
      // total, no warning. Money on such an account would be missing from the P&L and from net income,
      // and the statement would still look complete and still foot.
      //
      // Measured on production 2026-10-03, the chart carries eight account types: CostOfGoodsSold,
      // Asset, Liability, Income, Expense, OtherExpense, Equity and Statistical. Asset, Liability and
      // Equity belong on the Balance Sheet and are correctly absent here. `Statistical` is QuickBooks'
      // non-posting type and currently holds zero postings — so nothing is being dropped TODAY. The
      // defect is that if it ever did, nobody would be told.
      //
      // LAW 368.3: a screen that cannot classify something says so. It never drops it. So an unmapped
      // type with activity now comes back as its own labelled group, and net income says it is excluded.
      if (totalDebits !== 0 || totalCredits !== 0) {
        unclassifiedLines.push({
          ...(row.account_id ? { account_id: row.account_id } : {}),
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

    const unclassifiedTotal = unclassifiedLines.reduce((sum, line) => sum + line.amount, 0);

    return {
      // ROUND 384: present ONLY when something fell outside every bucket. An empty array means the
      // chart is fully mapped; a non-empty one means the P&L is incomplete and says so out loud,
      // rather than footing neatly while money is missing from it.
      unclassified: { lines: unclassifiedLines, total: unclassifiedTotal },
      revenue: { lines: revenueLines, total: revenueTotal },
      cogs: { lines: cogsLines, total: cogsTotal },
      gross_profit: grossProfit,
      operating_expenses: { lines: operatingExpenseLines, total: operatingExpensesTotal },
      net_income: netIncome,
    };
  });
}
