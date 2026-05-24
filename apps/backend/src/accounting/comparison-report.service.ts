import { withCompanyScope } from "./shared.js";
import { getProfitLossReport, type ProfitLossLine, type ProfitLossReport } from "./profit-loss.service.js";
import { getBalanceSheetReport, type BalanceSheetLine, type BalanceSheetReport } from "./balance-sheet.service.js";
import { transformProfitLossToCashBasis, transformBalanceSheetToCashBasis } from "./cash-basis/report-transforms.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";

export type ComparisonReportType = "pl" | "bs";
export type ComparisonBasis = "accrual" | "cash";

type ResolvedPeriod = {
  label: string;
  startDate: string;
  endDate: string;
};

export type ComparisonRow = {
  row_key: string;
  account: string;
  account_code: string | null;
  account_id: string | null;
  account_type: string | null;
  period_1_amount: number;
  period_2_amount: number;
  variance_cents: number;
  variance_pct: number | null;
};

export type ComparisonReport = {
  type: ComparisonReportType;
  basis: ComparisonBasis;
  periods: [string, string];
  rows: ComparisonRow[];
};

function parseYearMonth(label: string): ResolvedPeriod | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(label);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    label,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function parseYearQuarter(label: string): ResolvedPeriod | null {
  const match = /^(\d{4})-Q([1-4])$/i.exec(label);
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return {
    label,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function parsePeriodLabel(label: string): ResolvedPeriod {
  const quarter = parseYearQuarter(label);
  if (quarter) return quarter;
  const month = parseYearMonth(label);
  if (month) return month;
  throw new Error("invalid_periods");
}

function variancePct(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function buildRowsFromPL(report: ProfitLossReport) {
  const rows = new Map<string, Omit<ComparisonRow, "period_1_amount" | "period_2_amount" | "variance_cents" | "variance_pct">>();
  const push = (section: string, line: ProfitLossLine) => {
    const rowKey = `${section}:${line.account_code}:${line.account_name}`;
    rows.set(rowKey, {
      row_key: rowKey,
      account: `${line.account_code} ${line.account_name}`.trim(),
      account_code: line.account_code || null,
      account_id: null,
      account_type: line.account_type || null,
    });
  };
  report.revenue.lines.forEach((line) => push("revenue", line));
  report.cogs.lines.forEach((line) => push("cogs", line));
  report.operating_expenses.lines.forEach((line) => push("opex", line));
  return rows;
}

function buildRowsFromBS(report: BalanceSheetReport) {
  const rows = new Map<string, Omit<ComparisonRow, "period_1_amount" | "period_2_amount" | "variance_cents" | "variance_pct">>();
  const push = (section: string, line: BalanceSheetLine) => {
    const rowKey = `${section}:${line.account_id ?? line.account_code}:${line.account_name}`;
    rows.set(rowKey, {
      row_key: rowKey,
      account: `${line.account_code} ${line.account_name}`.trim(),
      account_code: line.account_code || null,
      account_id: line.account_id ?? null,
      account_type: line.account_type || null,
    });
  };
  report.assets.lines.forEach((line) => push("asset", line));
  report.liabilities.lines.forEach((line) => push("liability", line));
  report.equity.lines.forEach((line) => push("equity", line));
  rows.set("equity:current_year_earnings", {
    row_key: "equity:current_year_earnings",
    account: "Current Year Earnings",
    account_code: null,
    account_id: null,
    account_type: "Equity",
  });
  return rows;
}

function toValueMapPL(report: ProfitLossReport) {
  const out = new Map<string, number>();
  const add = (section: string, line: ProfitLossLine) => {
    out.set(`${section}:${line.account_code}:${line.account_name}`, Number(line.amount ?? 0));
  };
  report.revenue.lines.forEach((line) => add("revenue", line));
  report.cogs.lines.forEach((line) => add("cogs", line));
  report.operating_expenses.lines.forEach((line) => add("opex", line));
  return out;
}

function toValueMapBS(report: BalanceSheetReport) {
  const out = new Map<string, number>();
  const add = (section: string, line: BalanceSheetLine) => {
    out.set(`${section}:${line.account_id ?? line.account_code}:${line.account_name}`, Number(line.amount ?? 0));
  };
  report.assets.lines.forEach((line) => add("asset", line));
  report.liabilities.lines.forEach((line) => add("liability", line));
  report.equity.lines.forEach((line) => add("equity", line));
  out.set("equity:current_year_earnings", Number(report.equity.current_year_earnings ?? 0));
  return out;
}

async function resolvePLForPeriod(input: {
  userId: string;
  operatingCompanyId: string;
  basis: ComparisonBasis;
  period: ResolvedPeriod;
}) {
  const accrual = await getProfitLossReport({
    userId: input.userId,
    operating_company_id: input.operatingCompanyId,
    from_date: input.period.startDate,
    to_date: input.period.endDate,
  });
  if (input.basis === "cash") {
    return transformProfitLossToCashBasis(accrual, input.period.endDate);
  }
  return accrual;
}

async function resolveBSForPeriod(input: {
  userId: string;
  operatingCompanyId: string;
  basis: ComparisonBasis;
  period: ResolvedPeriod;
}) {
  const accrual = await getBalanceSheetReport({
    userId: input.userId,
    operating_company_id: input.operatingCompanyId,
    as_of_date: input.period.endDate,
  });
  if (input.basis === "cash") {
    const roleMatches = await withCompanyScope(input.userId, input.operatingCompanyId, async (client) => ({
      arControlAccountId: await resolveRoleAccountOptional(client, input.operatingCompanyId, "ar_control"),
      apControlAccountId: await resolveRoleAccountOptional(client, input.operatingCompanyId, "ap_control"),
    }));
    return transformBalanceSheetToCashBasis(accrual, input.period.endDate, roleMatches);
  }
  return accrual;
}

export async function getComparisonReport(input: {
  userId: string;
  operatingCompanyId: string;
  type: ComparisonReportType;
  basis: ComparisonBasis;
  periods: string;
}): Promise<ComparisonReport> {
  const periodLabels = input.periods.split(",").map((part) => part.trim()).filter(Boolean);
  if (periodLabels.length !== 2) throw new Error("invalid_periods");
  const period1 = parsePeriodLabel(periodLabels[0]);
  const period2 = parsePeriodLabel(periodLabels[1]);

  if (input.type === "pl") {
    const [first, second] = await Promise.all([
      resolvePLForPeriod({ userId: input.userId, operatingCompanyId: input.operatingCompanyId, basis: input.basis, period: period1 }),
      resolvePLForPeriod({ userId: input.userId, operatingCompanyId: input.operatingCompanyId, basis: input.basis, period: period2 }),
    ]);
    const rowInfo = buildRowsFromPL(first);
    for (const [key, value] of buildRowsFromPL(second)) rowInfo.set(key, value);
    const firstValues = toValueMapPL(first);
    const secondValues = toValueMapPL(second);

    const rows: ComparisonRow[] = Array.from(rowInfo.values()).map((info) => {
      const p1 = Number(firstValues.get(info.row_key) ?? 0);
      const p2 = Number(secondValues.get(info.row_key) ?? 0);
      const variance = p1 - p2;
      return {
        ...info,
        period_1_amount: p1,
        period_2_amount: p2,
        variance_cents: variance,
        variance_pct: variancePct(p1, p2),
      };
    });
    rows.sort((a, b) => a.account.localeCompare(b.account));
    return { type: input.type, basis: input.basis, periods: [period1.label, period2.label], rows };
  }

  const [first, second] = await Promise.all([
    resolveBSForPeriod({ userId: input.userId, operatingCompanyId: input.operatingCompanyId, basis: input.basis, period: period1 }),
    resolveBSForPeriod({ userId: input.userId, operatingCompanyId: input.operatingCompanyId, basis: input.basis, period: period2 }),
  ]);
  const rowInfo = buildRowsFromBS(first);
  for (const [key, value] of buildRowsFromBS(second)) rowInfo.set(key, value);
  const firstValues = toValueMapBS(first);
  const secondValues = toValueMapBS(second);

  const rows: ComparisonRow[] = Array.from(rowInfo.values()).map((info) => {
    const p1 = Number(firstValues.get(info.row_key) ?? 0);
    const p2 = Number(secondValues.get(info.row_key) ?? 0);
    const variance = p1 - p2;
    return {
      ...info,
      period_1_amount: p1,
      period_2_amount: p2,
      variance_cents: variance,
      variance_pct: variancePct(p1, p2),
    };
  });
  rows.sort((a, b) => a.account.localeCompare(b.account));
  return { type: input.type, basis: input.basis, periods: [period1.label, period2.label], rows };
}
