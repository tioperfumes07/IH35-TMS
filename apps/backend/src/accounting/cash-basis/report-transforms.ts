import type { BalanceSheetLine, BalanceSheetReport } from "../balance-sheet.service.js";
import type { ProfitLossLine, ProfitLossReport } from "../profit-loss.service.js";
import type { TrialBalanceRow, TrialBalanceSummary } from "../trial-balance.service.js";
import { applyCashBasisSuppression, computeCashBasisAdjustment, type CashBasisEntry } from "./engine.js";

function inferArApSource(accountCode: string, accountName: string): CashBasisEntry["source_type"] {
  const hint = `${accountCode} ${accountName}`.toLowerCase();
  if (hint.includes("accounts receivable") || hint.includes("a/r")) return "ar_control";
  if (hint.includes("accounts payable") || hint.includes("a/p")) return "ap_control";
  return "other";
}

type RoleMatcherInput = {
  arControlAccountId?: string | null;
  apControlAccountId?: string | null;
};

function inferArApSourceByRole(line: { account_id?: string | null; account_code: string; account_name: string }, roles?: RoleMatcherInput) {
  if (roles?.arControlAccountId && line.account_id === roles.arControlAccountId) return "ar_control" as const;
  if (roles?.apControlAccountId && line.account_id === roles.apControlAccountId) return "ap_control" as const;
  return inferArApSource(line.account_code, line.account_name);
}

function balanceSheetLineToEntry(line: BalanceSheetLine, roles?: RoleMatcherInput): CashBasisEntry {
  return {
    entry_id: `${line.account_id ?? line.account_code}:${line.account_name}`,
    account_code: line.account_code,
    account_name: line.account_name,
    account_type: line.account_type,
    account_subtype: null,
    amount_cents: line.amount,
    source_type: inferArApSourceByRole(line, roles),
  };
}

function entryToBalanceSheetLine(entry: CashBasisEntry): BalanceSheetLine {
  return {
    account_code: entry.account_code,
    account_name: entry.account_name,
    account_type: entry.account_type,
    amount: entry.amount_cents,
  };
}

export function transformBalanceSheetToCashBasis(report: BalanceSheetReport, asOfDate: string, roles?: RoleMatcherInput): BalanceSheetReport {
  const allEntries = [
    ...report.assets.lines.map((line) => balanceSheetLineToEntry(line, roles)),
    ...report.liabilities.lines.map((line) => balanceSheetLineToEntry(line, roles)),
    ...report.equity.lines.map((line) => balanceSheetLineToEntry(line, roles)),
  ];
  const transformed = applyCashBasisSuppression(allEntries, { as_of_date: asOfDate });

  const assets = transformed.filter((entry) => entry.account_type === "Asset").map(entryToBalanceSheetLine);
  const liabilities = transformed.filter((entry) => entry.account_type === "Liability").map(entryToBalanceSheetLine);
  const equityLines = transformed.filter((entry) => entry.account_type === "Equity").map(entryToBalanceSheetLine);

  const assetsTotal = assets.reduce((sum, line) => sum + line.amount, 0);
  const liabilitiesTotal = liabilities.reduce((sum, line) => sum + line.amount, 0);
  const equityBase = equityLines.reduce((sum, line) => sum + line.amount, 0);
  const equityWithoutAdj = equityBase + report.equity.current_year_earnings;
  const adjustment = computeCashBasisAdjustment({
    assets: { total: assetsTotal },
    liabilities: { total: liabilitiesTotal },
    equity: { total: equityWithoutAdj },
  });
  const adjustedEquityLines = [...equityLines, { account_code: adjustment.account_code, account_name: adjustment.account_name, account_type: "Equity", amount: adjustment.amount }];
  const equityTotal = equityWithoutAdj + adjustment.amount;
  const totalLiabilitiesAndEquity = liabilitiesTotal + equityTotal;
  return {
    assets: { lines: assets, total: assetsTotal },
    liabilities: { lines: liabilities, total: liabilitiesTotal },
    equity: {
      lines: adjustedEquityLines,
      current_year_earnings: report.equity.current_year_earnings,
      total: equityTotal,
    },
    total_liabilities_and_equity: totalLiabilitiesAndEquity,
    balanced: assetsTotal === totalLiabilitiesAndEquity,
  };
}

function inferTrialSourceType(row: TrialBalanceRow, roles?: RoleMatcherInput): CashBasisEntry["source_type"] {
  return inferArApSourceByRole(row, roles);
}

function trialRowToEntries(row: TrialBalanceRow, roles?: RoleMatcherInput): CashBasisEntry[] {
  return [
    {
      entry_id: `${row.account_id}:debit`,
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      amount_cents: row.total_debits,
      source_type: inferTrialSourceType(row, roles),
    },
    {
      entry_id: `${row.account_id}:credit`,
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      amount_cents: -row.total_credits,
      source_type: inferTrialSourceType(row, roles),
    },
  ];
}

export function transformTrialBalanceToCashBasis(rows: TrialBalanceRow[], summary: TrialBalanceSummary, asOfDate: string, roles?: RoleMatcherInput) {
  const transformed = applyCashBasisSuppression(rows.flatMap((row) => trialRowToEntries(row, roles)), { as_of_date: asOfDate });
  const aggregates = new Map<string, TrialBalanceRow>();
  for (const row of rows) aggregates.set(row.account_id, { ...row, total_debits: 0, total_credits: 0, net_balance: 0 });
  for (const entry of transformed) {
    const key = entry.entry_id.split(":")[0];
    const row = aggregates.get(key);
    if (!row) continue;
    if (entry.amount_cents >= 0) row.total_debits += entry.amount_cents;
    else row.total_credits += Math.abs(entry.amount_cents);
    row.net_balance = row.total_debits - row.total_credits;
  }
  const transformedRows = [...aggregates.values()];
  const adjustment = computeCashBasisAdjustment({
    assets: { total: transformedRows.filter((row) => row.account_type === "Asset").reduce((sum, row) => sum + row.net_balance, 0) },
    liabilities: { total: transformedRows.filter((row) => row.account_type === "Liability").reduce((sum, row) => sum + Math.abs(row.net_balance), 0) },
    equity: { total: transformedRows.filter((row) => row.account_type === "Equity").reduce((sum, row) => sum + Math.abs(row.net_balance), 0) },
  });
  if (adjustment.amount !== 0) {
    transformedRows.push({
      account_id: "cash-basis-adjustment",
      account_code: adjustment.account_code,
      account_name: adjustment.account_name,
      account_type: "Equity",
      total_debits: adjustment.amount > 0 ? adjustment.amount : 0,
      total_credits: adjustment.amount < 0 ? Math.abs(adjustment.amount) : 0,
      net_balance: adjustment.amount,
    });
  }
  const finalDebits = transformedRows.reduce((sum, row) => sum + row.total_debits, 0);
  const finalCredits = transformedRows.reduce((sum, row) => sum + row.total_credits, 0);
  return {
    rows: transformedRows,
    summary: {
      ...summary,
      grand_total_debits: finalDebits,
      grand_total_credits: finalCredits,
      balanced: finalDebits === finalCredits,
    },
  };
}

function profitLossLineToEntry(line: ProfitLossLine, sourceType: CashBasisEntry["source_type"], anchorDate: string): CashBasisEntry {
  return {
    entry_id: `${line.account_code}:${line.account_name}`,
    account_code: line.account_code,
    account_name: line.account_name,
    account_type: line.account_type,
    amount_cents: line.amount,
    source_type: sourceType,
    settlement_date: anchorDate,
  };
}

function entryToProfitLossLine(entry: CashBasisEntry): ProfitLossLine {
  return {
    account_code: entry.account_code,
    account_name: entry.account_name,
    account_type: entry.account_type,
    amount: entry.amount_cents,
  };
}

export function transformProfitLossToCashBasis(report: ProfitLossReport, anchorDate: string): ProfitLossReport {
  const entries = [
    ...report.revenue.lines.map((line) => profitLossLineToEntry(line, "invoice_revenue", anchorDate)),
    ...report.cogs.lines.map((line) => profitLossLineToEntry(line, "bill_expense", anchorDate)),
    ...report.operating_expenses.lines.map((line) => profitLossLineToEntry(line, "bill_expense", anchorDate)),
  ];
  const transformed = applyCashBasisSuppression(entries, { as_of_date: anchorDate });
  const revenueLines = transformed.filter((entry) => entry.account_type === "Income" || entry.account_type === "OtherIncome").map(entryToProfitLossLine);
  const cogsLines = transformed.filter((entry) => entry.account_type === "CostOfGoodsSold").map(entryToProfitLossLine);
  const operatingExpenseLines = transformed.filter((entry) => entry.account_type === "Expense" || entry.account_type === "OtherExpense").map(entryToProfitLossLine);
  const revenueTotal = revenueLines.reduce((sum, line) => sum + line.amount, 0);
  const cogsTotal = cogsLines.reduce((sum, line) => sum + line.amount, 0);
  const operatingExpensesTotal = operatingExpenseLines.reduce((sum, line) => sum + line.amount, 0);
  return {
    revenue: { lines: revenueLines, total: revenueTotal },
    cogs: { lines: cogsLines, total: cogsTotal },
    gross_profit: revenueTotal - cogsTotal,
    operating_expenses: { lines: operatingExpenseLines, total: operatingExpensesTotal },
    net_income: revenueTotal - cogsTotal - operatingExpensesTotal,
  };
}
