export type StatementReportKey =
  | "trial-balance"
  | "profit-loss"
  | "balance-sheet"
  | "cash-flow"
  | "ar-aging"
  | "ap-aging";

export type StatementExportFormat = "pdf" | "xlsx";

export function centsToUsdNumber(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export function formatUsdFromCents(cents: number): string {
  const usd = centsToUsdNumber(cents);
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function normalizeCompanyCode(input: string | null | undefined): string {
  const normalized = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
  return normalized || "COMPANY";
}

export function buildAsOfSegment(asOfDate: string): string {
  return `as-of_${asOfDate}`;
}

export function buildRangeSegment(fromDate: string | null | undefined, toDate: string): string {
  const from = fromDate ?? "all-time";
  return `${from}_to_${toDate}`;
}

export function buildStatementExportFilename(input: {
  companyCode: string;
  reportKey: StatementReportKey;
  periodSegment: string;
  format: StatementExportFormat;
}): string {
  return `${normalizeCompanyCode(input.companyCode)}_${input.reportKey}_${input.periodSegment}.${input.format}`;
}
