import type { BalanceSheetLine, BalanceSheetReport } from "../balance-sheet.service.js";
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
  // BOARD 26 (LEAD ROUND 8.25) — the cash-basis TB plug is the TRIAL BALANCE's own difference, not the balance-sheet
  // identity. Root cause (live: explicit Cash showed "Out of balance" while Accrual showed "Balanced"): the plug was
  // computeCashBasisAdjustment(A − (L + E)), which (1) ignores every Revenue / Expense row a trial balance carries,
  // (2) takes |net| of liabilities and equity so a debit-balance liability counted the wrong way, and (3) booked a
  // positive delta as a DEBIT, which doubles an excess of debits instead of offsetting it. Suppression (@decision Q3
  // AR/AP control, Q5 unrecognized settlements, Q6 refunds) removes amounts from one side only, so the only plug that
  // always restores debits = credits is (Σ debits − Σ credits) posted to the opposite side of the Cash Basis Adjustment
  // equity line. No account other than the adjustment line changes; the accrual TB is untouched.
  const preDebits = transformedRows.reduce((sum, row) => sum + row.total_debits, 0);
  const preCredits = transformedRows.reduce((sum, row) => sum + row.total_credits, 0);
  const excessDebits = preDebits - preCredits;
  if (excessDebits !== 0) {
    const label = computeCashBasisAdjustment({ assets: { total: 0 }, liabilities: { total: 0 }, equity: { total: 0 } });
    transformedRows.push({
      account_id: "cash-basis-adjustment",
      account_code: label.account_code,
      account_name: label.account_name,
      account_type: "Equity",
      total_debits: excessDebits < 0 ? -excessDebits : 0,
      total_credits: excessDebits > 0 ? excessDebits : 0,
      net_balance: -excessDebits,
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

/**
 * ACCT-F412 — `transformProfitLossToCashBasis` WAS HERE AND IS DELETED, not deprecated.
 *
 * It took the finished accrual P&L — already GROUP BY account / SUM(amount_cents) — and tried to
 * convert it to cash basis. By that point WHICH invoices produced the revenue, and whether any of
 * them were paid, no longer existed in the data it was handed. With nothing to date a line by, it
 * stamped every line `settlement_date = anchorDate`, where anchorDate IS the as-of date, so the
 * engine's own rule (`recognized = settlement_date <= as_of`) recognized 100% of every line, every
 * time. The cash-basis P&L was the accrual P&L with a different label, and the comparison report
 * printed the same column twice under two basis names.
 *
 * An aggregate cannot be disaggregated. It is deleted rather than left exported because a function
 * that silently returns accrual numbers when you ask for cash numbers is a loaded gun in a money
 * path: the next caller would have no way to know. The replacement is
 * `./profit-loss-cash.service.ts`, which reads the postings and their documents' settlements.
 *
 * The Balance Sheet and Trial Balance transforms above are NOT affected: @decision Q2 and Q3 restate
 * those by SUPPRESSING the AR and AP control accounts, which is a per-account operation an aggregate
 * can still answer. Only the P&L needed transaction-level data it did not have.
 */
