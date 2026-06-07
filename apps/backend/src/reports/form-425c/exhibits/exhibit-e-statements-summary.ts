import { getBalanceSheetReport } from "../../../accounting/balance-sheet.service.js";
import { getCashFlowReport } from "../../../accounting/cash-flow.service.js";
import { getProfitLossReport } from "../../../accounting/profit-loss.service.js";
import type { ExhibitPeriod } from "./types.js";

export type StatementSnapshot = {
  report: "profit_loss" | "balance_sheet" | "cash_flow";
  label: string;
  summary: Record<string, number>;
};

export type ExhibitE = {
  letter: "e";
  title: string;
  period_start: string;
  period_end: string;
  snapshots: StatementSnapshot[];
};

export async function buildExhibitE(
  userId: string,
  input: ExhibitPeriod
): Promise<ExhibitE> {
  const [pl, bs, cf] = await Promise.all([
    getProfitLossReport({
      userId,
      operating_company_id: input.operating_company_id,
      from_date: input.period_start,
      to_date: input.period_end,
    }),
    getBalanceSheetReport({
      userId,
      operating_company_id: input.operating_company_id,
      as_of_date: input.period_end,
    }),
    getCashFlowReport({
      userId,
      operating_company_id: input.operating_company_id,
      from_date: input.period_start,
      to_date: input.period_end,
    }),
  ]);

  const snapshots: StatementSnapshot[] = [
    {
      report: "profit_loss",
      label: "Profit & Loss",
      summary: {
        revenue_total: pl.revenue.total,
        cogs_total: pl.cogs.total,
        gross_profit: pl.gross_profit,
        operating_expenses_total: pl.operating_expenses.total,
        net_income: pl.net_income,
      },
    },
    {
      report: "balance_sheet",
      label: "Balance Sheet",
      summary: {
        assets_total: bs.assets.total,
        liabilities_total: bs.liabilities.total,
        equity_total: bs.equity.total,
      },
    },
    {
      report: "cash_flow",
      label: "Cash Flow",
      summary: {
        operating_total: cf.operating.total,
        investing_total: cf.investing.total,
        financing_total: cf.financing.total,
        net_cash_change: cf.net_cash_change,
      },
    },
  ];

  return {
    letter: "e",
    title: "Exhibit E — Statements summary (P&L, BS, CF)",
    period_start: input.period_start,
    period_end: input.period_end,
    snapshots,
  };
}
