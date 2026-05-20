import { withCurrentUser } from "../auth/db.js";
import { getApAgingReport } from "./ap-aging.service.js";
import { getArAgingReport } from "./ar-aging.service.js";
import { getBalanceSheetReport } from "./balance-sheet.service.js";
import { getCashFlowReport } from "./cash-flow.service.js";
import { getProfitLossReport } from "./profit-loss.service.js";
import { getTrialBalanceReport } from "./trial-balance.service.js";
import {
  buildAsOfSegment,
  buildRangeSegment,
  buildStatementExportFilename,
  centsToUsdNumber,
  formatUsdFromCents,
  type StatementExportFormat,
} from "./statement-export.helpers.js";
import { renderStatementPdf } from "./statement-export-pdf.service.js";
import {
  isExportRangeKey,
  resolveExportRange,
  type ExportRangeKey,
} from "./statement-export-range-resolver.js";
import { renderStatementXlsx } from "./statement-export-xlsx.service.js";

type ExportResult = {
  filename: string;
  contentType: string;
  buffer: Buffer;
};

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

async function fetchCompanyCode(userId: string, operatingCompanyId: string): Promise<string> {
  const row = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<{ code: string | null }>(
      `
        SELECT code
        FROM mdata.companies
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [operatingCompanyId],
    );
    return res.rows[0] ?? null;
  });
  return row?.code ?? "COMPANY";
}

function tableStyles() {
  return {
    generated_at: new Date().toISOString(),
    styles:
      "body{font-family:Arial,sans-serif;color:#0f172a;font-size:12px;line-height:1.45;padding:20px;}" +
      "h1{margin:0 0 8px 0;font-size:20px;}h2{margin:16px 0 6px 0;font-size:14px;}" +
      ".meta{margin-bottom:12px;color:#334155;}.integrity{margin:12px 0;font-weight:700;}" +
      "table{width:100%;border-collapse:collapse;margin-top:8px;}" +
      "th,td{border:1px solid #d1d5db;padding:6px;vertical-align:top;}" +
      "th{background:#f8fafc;text-align:left;}.amount{text-align:right;white-space:nowrap;}" +
      ".empty{color:#475569;font-style:italic;}",
  };
}

export async function exportTrialBalanceStatement(input: {
  userId: string;
  operating_company_id: string;
  as_of_date: string;
  format: StatementExportFormat;
}): Promise<ExportResult> {
  const companyCode = await fetchCompanyCode(input.userId, input.operating_company_id);
  const report = await getTrialBalanceReport({
    userId: input.userId,
    operating_company_id: input.operating_company_id,
    to_date: input.as_of_date,
  });
  const periodSegment = buildAsOfSegment(input.as_of_date);
  const filename = buildStatementExportFilename({
    companyCode,
    reportKey: "trial-balance",
    periodSegment,
    format: input.format,
  });

  if (input.format === "pdf") {
    const buffer = await renderStatementPdf({
      templateName: "trial-balance",
      viewModel: {
        ...tableStyles(),
        title: "Trial Balance",
        company_code: companyCode,
        period_label: `As of ${input.as_of_date}`,
        rows: report.rows.map((row) => ({
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: row.account_type,
          total_debits: formatUsdFromCents(row.total_debits),
          total_credits: formatUsdFromCents(row.total_credits),
          net_balance: formatUsdFromCents(row.net_balance),
        })),
        summary: {
          grand_total_debits: formatUsdFromCents(report.summary.grand_total_debits),
          grand_total_credits: formatUsdFromCents(report.summary.grand_total_credits),
        },
        balanced: yesNo(report.summary.balanced),
        has_rows: report.rows.length > 0,
      },
    });
    return { filename, contentType: "application/pdf", buffer };
  }

  const rows: Array<Array<string | number>> = [
    ["Trial Balance"],
    ["Company", companyCode],
    ["As of", input.as_of_date],
    ["Balanced", yesNo(report.summary.balanced)],
    [],
    ["Account Code", "Account Name", "Account Type", "Total Debits (USD)", "Total Credits (USD)", "Net Balance (USD)"],
  ];
  if (report.rows.length === 0) {
    rows.push(["No data", "", "", "", "", ""]);
  } else {
    for (const row of report.rows) {
      rows.push([
        row.account_code,
        row.account_name,
        row.account_type,
        centsToUsdNumber(row.total_debits),
        centsToUsdNumber(row.total_credits),
        centsToUsdNumber(row.net_balance),
      ]);
    }
  }
  rows.push(
    [],
    ["Totals", "", "", centsToUsdNumber(report.summary.grand_total_debits), centsToUsdNumber(report.summary.grand_total_credits), ""],
  );
  return {
    filename,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: renderStatementXlsx({ sheetName: "Trial Balance", rows }),
  };
}

export async function exportProfitLossStatement(input: {
  userId: string;
  operating_company_id: string;
  range_key?: string;
  from_date?: string;
  to_date?: string;
  format: StatementExportFormat;
}): Promise<ExportResult> {
  const companyCode = await fetchCompanyCode(input.userId, input.operating_company_id);
  const rangeKey = input.range_key;
  if (rangeKey && !isExportRangeKey(rangeKey)) throw new Error("invalid_range_key");
  const resolved = resolveExportRange({
    range_key: rangeKey as ExportRangeKey | undefined,
    from_date: input.from_date,
    to_date: input.to_date,
  });
  const report = await getProfitLossReport({
    userId: input.userId,
    operating_company_id: input.operating_company_id,
    from_date: resolved.from_date,
    to_date: resolved.to_date,
  });
  const periodSegment = buildRangeSegment(resolved.from_date ?? "all-time", resolved.to_date);
  const filename = buildStatementExportFilename({
    companyCode,
    reportKey: "profit-loss",
    periodSegment,
    format: input.format,
  });

  if (input.format === "pdf") {
    const buffer = await renderStatementPdf({
      templateName: "profit-loss",
      viewModel: {
        ...tableStyles(),
        title: "Profit and Loss",
        company_code: companyCode,
        period_label: `${resolved.from_date ?? "all-time"} to ${resolved.to_date}`,
        revenue_lines: report.revenue.lines.map((line) => ({
          account_code: line.account_code,
          account_name: line.account_name,
          account_type: line.account_type,
          amount: formatUsdFromCents(line.amount),
        })),
        cogs_lines: report.cogs.lines.map((line) => ({
          account_code: line.account_code,
          account_name: line.account_name,
          account_type: line.account_type,
          amount: formatUsdFromCents(line.amount),
        })),
        operating_expense_lines: report.operating_expenses.lines.map((line) => ({
          account_code: line.account_code,
          account_name: line.account_name,
          account_type: line.account_type,
          amount: formatUsdFromCents(line.amount),
        })),
        revenue_total: formatUsdFromCents(report.revenue.total),
        cogs_total: formatUsdFromCents(report.cogs.total),
        gross_profit: formatUsdFromCents(report.gross_profit),
        operating_expense_total: formatUsdFromCents(report.operating_expenses.total),
        net_income: formatUsdFromCents(report.net_income),
        integrity_label: "Integrity",
        integrity_value: "not_applicable",
      },
    });
    return { filename, contentType: "application/pdf", buffer };
  }

  const rows: Array<Array<string | number>> = [
    ["Profit and Loss"],
    ["Company", companyCode],
    ["Period", `${resolved.from_date ?? "all-time"} to ${resolved.to_date}`],
    ["Integrity", "not_applicable"],
    [],
    ["Section", "Account Code", "Account Name", "Account Type", "Amount (USD)"],
  ];
  const pushSectionRows = (section: string, sectionRows: Array<{ account_code: string; account_name: string; account_type: string; amount: number }>) => {
    if (sectionRows.length === 0) {
      rows.push([section, "No data", "", "", ""]);
      return;
    }
    for (const row of sectionRows) {
      rows.push([section, row.account_code, row.account_name, row.account_type, centsToUsdNumber(row.amount)]);
    }
  };
  pushSectionRows("Revenue", report.revenue.lines);
  rows.push(["Revenue Total", "", "", "", centsToUsdNumber(report.revenue.total)], []);
  pushSectionRows("Cost of Goods Sold", report.cogs.lines);
  rows.push(["COGS Total", "", "", "", centsToUsdNumber(report.cogs.total)]);
  rows.push(["Gross Profit", "", "", "", centsToUsdNumber(report.gross_profit)], []);
  pushSectionRows("Operating Expenses", report.operating_expenses.lines);
  rows.push(
    ["Operating Expenses Total", "", "", "", centsToUsdNumber(report.operating_expenses.total)],
    ["Net Income", "", "", "", centsToUsdNumber(report.net_income)],
  );
  return {
    filename,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: renderStatementXlsx({ sheetName: "Profit Loss", rows }),
  };
}

export async function exportBalanceSheetStatement(input: {
  userId: string;
  operating_company_id: string;
  as_of_date: string;
  format: StatementExportFormat;
}): Promise<ExportResult> {
  const companyCode = await fetchCompanyCode(input.userId, input.operating_company_id);
  const report = await getBalanceSheetReport({
    userId: input.userId,
    operating_company_id: input.operating_company_id,
    as_of_date: input.as_of_date,
  });
  const periodSegment = buildAsOfSegment(input.as_of_date);
  const filename = buildStatementExportFilename({
    companyCode,
    reportKey: "balance-sheet",
    periodSegment,
    format: input.format,
  });

  if (input.format === "pdf") {
    const buffer = await renderStatementPdf({
      templateName: "balance-sheet",
      viewModel: {
        ...tableStyles(),
        title: "Balance Sheet",
        company_code: companyCode,
        period_label: `As of ${input.as_of_date}`,
        assets_lines: report.assets.lines.map((line) => ({
          account_code: line.account_code,
          account_name: line.account_name,
          amount: formatUsdFromCents(line.amount),
        })),
        liabilities_lines: report.liabilities.lines.map((line) => ({
          account_code: line.account_code,
          account_name: line.account_name,
          amount: formatUsdFromCents(line.amount),
        })),
        equity_lines: report.equity.lines.map((line) => ({
          account_code: line.account_code,
          account_name: line.account_name,
          amount: formatUsdFromCents(line.amount),
        })),
        assets_total: formatUsdFromCents(report.assets.total),
        liabilities_total: formatUsdFromCents(report.liabilities.total),
        equity_total: formatUsdFromCents(report.equity.total),
        current_year_earnings: formatUsdFromCents(report.equity.current_year_earnings),
        total_liabilities_and_equity: formatUsdFromCents(report.total_liabilities_and_equity),
        balanced: yesNo(report.balanced),
      },
    });
    return { filename, contentType: "application/pdf", buffer };
  }

  const rows: Array<Array<string | number>> = [
    ["Balance Sheet"],
    ["Company", companyCode],
    ["As of", input.as_of_date],
    ["Balanced", yesNo(report.balanced)],
    [],
    ["Section", "Account Code", "Account Name", "Amount (USD)"],
  ];

  const pushSectionRows = (section: string, sectionRows: Array<{ account_code: string; account_name: string; amount: number }>) => {
    if (sectionRows.length === 0) {
      rows.push([section, "No data", "", ""]);
      return;
    }
    for (const row of sectionRows) {
      rows.push([section, row.account_code, row.account_name, centsToUsdNumber(row.amount)]);
    }
  };

  pushSectionRows("Assets", report.assets.lines);
  rows.push(["Assets Total", "", "", centsToUsdNumber(report.assets.total)], []);
  pushSectionRows("Liabilities", report.liabilities.lines);
  rows.push(["Liabilities Total", "", "", centsToUsdNumber(report.liabilities.total)], []);
  pushSectionRows("Equity", report.equity.lines);
  rows.push(
    ["Current Year Earnings", "", "", centsToUsdNumber(report.equity.current_year_earnings)],
    ["Equity Total", "", "", centsToUsdNumber(report.equity.total)],
    ["Total Liabilities and Equity", "", "", centsToUsdNumber(report.total_liabilities_and_equity)],
  );

  return {
    filename,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: renderStatementXlsx({ sheetName: "Balance Sheet", rows }),
  };
}

export async function exportCashFlowStatement(input: {
  userId: string;
  operating_company_id: string;
  range_key?: string;
  from_date?: string;
  to_date?: string;
  format: StatementExportFormat;
}): Promise<ExportResult> {
  const companyCode = await fetchCompanyCode(input.userId, input.operating_company_id);
  const rangeKey = input.range_key;
  if (rangeKey && !isExportRangeKey(rangeKey)) throw new Error("invalid_range_key");
  const resolved = resolveExportRange({
    range_key: rangeKey as ExportRangeKey | undefined,
    from_date: input.from_date,
    to_date: input.to_date,
  });
  const report = await getCashFlowReport({
    userId: input.userId,
    operating_company_id: input.operating_company_id,
    from_date: resolved.from_date,
    to_date: resolved.to_date,
  });
  const periodSegment = buildRangeSegment(resolved.from_date ?? "all-time", resolved.to_date);
  const filename = buildStatementExportFilename({
    companyCode,
    reportKey: "cash-flow",
    periodSegment,
    format: input.format,
  });

  if (input.format === "pdf") {
    const buffer = await renderStatementPdf({
      templateName: "cash-flow",
      viewModel: {
        ...tableStyles(),
        title: "Cash Flow",
        company_code: companyCode,
        period_label: `${resolved.from_date ?? "all-time"} to ${resolved.to_date}`,
        operating_lines: report.operating.lines.map((line) => ({
          label: line.label,
          account_type: line.account_type,
          account_subtype: line.account_subtype ?? "",
          amount: formatUsdFromCents(line.amount),
        })),
        investing_lines: report.investing.lines.map((line) => ({
          label: line.label,
          account_type: line.account_type,
          account_subtype: line.account_subtype ?? "",
          amount: formatUsdFromCents(line.amount),
        })),
        financing_lines: report.financing.lines.map((line) => ({
          label: line.label,
          account_type: line.account_type,
          account_subtype: line.account_subtype ?? "",
          amount: formatUsdFromCents(line.amount),
        })),
        operating_total: formatUsdFromCents(report.operating.total),
        investing_total: formatUsdFromCents(report.investing.total),
        financing_total: formatUsdFromCents(report.financing.total),
        net_cash_change: formatUsdFromCents(report.net_cash_change),
        cash_at_start: formatUsdFromCents(report.cash_at_start),
        cash_at_end: formatUsdFromCents(report.cash_at_end),
        unclassified_leg_count: report.unclassified_leg_count,
        reconciled: yesNo(report.reconciled),
      },
    });
    return { filename, contentType: "application/pdf", buffer };
  }

  const rows: Array<Array<string | number>> = [
    ["Cash Flow"],
    ["Company", companyCode],
    ["Period", `${resolved.from_date ?? "all-time"} to ${resolved.to_date}`],
    ["Reconciled", yesNo(report.reconciled)],
    ["Unclassified Leg Count", report.unclassified_leg_count],
    [],
    ["Section", "Label", "Account Type", "Account Subtype", "Amount (USD)"],
  ];

  const pushSectionRows = (
    section: string,
    sectionRows: Array<{ label: string; account_type: string; account_subtype: string | null; amount: number }>,
  ) => {
    if (sectionRows.length === 0) {
      rows.push([section, "No data", "", "", ""]);
      return;
    }
    for (const row of sectionRows) {
      rows.push([section, row.label, row.account_type, row.account_subtype ?? "", centsToUsdNumber(row.amount)]);
    }
  };

  pushSectionRows("Operating", report.operating.lines);
  rows.push(["Operating Total", "", "", "", centsToUsdNumber(report.operating.total)], []);
  pushSectionRows("Investing", report.investing.lines);
  rows.push(["Investing Total", "", "", "", centsToUsdNumber(report.investing.total)], []);
  pushSectionRows("Financing", report.financing.lines);
  rows.push(
    ["Financing Total", "", "", "", centsToUsdNumber(report.financing.total)],
    ["Net Cash Change", "", "", "", centsToUsdNumber(report.net_cash_change)],
    ["Cash at Start", "", "", "", centsToUsdNumber(report.cash_at_start)],
    ["Cash at End", "", "", "", centsToUsdNumber(report.cash_at_end)],
  );

  return {
    filename,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: renderStatementXlsx({ sheetName: "Cash Flow", rows }),
  };
}

export async function exportArAgingStatement(input: {
  userId: string;
  operating_company_id: string;
  as_of_date: string;
  format: StatementExportFormat;
}): Promise<ExportResult> {
  const companyCode = await fetchCompanyCode(input.userId, input.operating_company_id);
  const report = await getArAgingReport({
    userId: input.userId,
    operating_company_id: input.operating_company_id,
    as_of_date: input.as_of_date,
  });
  const periodSegment = buildAsOfSegment(input.as_of_date);
  const filename = buildStatementExportFilename({
    companyCode,
    reportKey: "ar-aging",
    periodSegment,
    format: input.format,
  });

  if (input.format === "pdf") {
    const buffer = await renderStatementPdf({
      templateName: "ar-aging",
      viewModel: {
        ...tableStyles(),
        title: "AR Aging",
        company_code: companyCode,
        period_label: `As of ${input.as_of_date}`,
        customers: report.customers.map((row) => ({
          customer_name: row.customer_name,
          customer_id: row.customer_id,
          current: formatUsdFromCents(row.current),
          d1_30: formatUsdFromCents(row.d1_30),
          d31_60: formatUsdFromCents(row.d31_60),
          d61_90: formatUsdFromCents(row.d61_90),
          d90_plus: formatUsdFromCents(row.d90_plus),
          total_outstanding: formatUsdFromCents(row.total_outstanding),
        })),
        totals: {
          current: formatUsdFromCents(report.totals.current),
          d1_30: formatUsdFromCents(report.totals.d1_30),
          d31_60: formatUsdFromCents(report.totals.d31_60),
          d61_90: formatUsdFromCents(report.totals.d61_90),
          d90_plus: formatUsdFromCents(report.totals.d90_plus),
          total_outstanding: formatUsdFromCents(report.totals.total_outstanding),
        },
        integrity_label: "Integrity",
        integrity_value: "not_applicable",
        has_rows: report.customers.length > 0,
      },
    });
    return { filename, contentType: "application/pdf", buffer };
  }

  const rows: Array<Array<string | number>> = [
    ["AR Aging"],
    ["Company", companyCode],
    ["As of", input.as_of_date],
    ["Integrity", "not_applicable"],
    [],
    ["Customer Name", "Customer ID", "Current", "1-30", "31-60", "61-90", "90+", "Total Outstanding (USD)"],
  ];
  if (report.customers.length === 0) {
    rows.push(["No data", "", "", "", "", "", "", ""]);
  } else {
    for (const row of report.customers) {
      rows.push([
        row.customer_name,
        row.customer_id,
        centsToUsdNumber(row.current),
        centsToUsdNumber(row.d1_30),
        centsToUsdNumber(row.d31_60),
        centsToUsdNumber(row.d61_90),
        centsToUsdNumber(row.d90_plus),
        centsToUsdNumber(row.total_outstanding),
      ]);
    }
  }
  rows.push(
    [],
    [
      "Totals",
      "",
      centsToUsdNumber(report.totals.current),
      centsToUsdNumber(report.totals.d1_30),
      centsToUsdNumber(report.totals.d31_60),
      centsToUsdNumber(report.totals.d61_90),
      centsToUsdNumber(report.totals.d90_plus),
      centsToUsdNumber(report.totals.total_outstanding),
    ],
  );
  return {
    filename,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: renderStatementXlsx({ sheetName: "AR Aging", rows }),
  };
}

export async function exportApAgingStatement(input: {
  userId: string;
  operating_company_id: string;
  as_of_date: string;
  format: StatementExportFormat;
}): Promise<ExportResult> {
  const companyCode = await fetchCompanyCode(input.userId, input.operating_company_id);
  const report = await getApAgingReport({
    userId: input.userId,
    operating_company_id: input.operating_company_id,
    as_of_date: input.as_of_date,
  });
  const periodSegment = buildAsOfSegment(input.as_of_date);
  const filename = buildStatementExportFilename({
    companyCode,
    reportKey: "ap-aging",
    periodSegment,
    format: input.format,
  });

  if (input.format === "pdf") {
    const buffer = await renderStatementPdf({
      templateName: "ap-aging",
      viewModel: {
        ...tableStyles(),
        title: "AP Aging",
        company_code: companyCode,
        period_label: `As of ${input.as_of_date}`,
        vendors: report.vendors.map((row) => ({
          vendor_name: row.vendor_name,
          vendor_id: row.vendor_id ?? "",
          current: formatUsdFromCents(row.current),
          d1_30: formatUsdFromCents(row.d1_30),
          d31_60: formatUsdFromCents(row.d31_60),
          d61_90: formatUsdFromCents(row.d61_90),
          d90_plus: formatUsdFromCents(row.d90_plus),
          total_outstanding: formatUsdFromCents(row.total_outstanding),
        })),
        totals: {
          current: formatUsdFromCents(report.totals.current),
          d1_30: formatUsdFromCents(report.totals.d1_30),
          d31_60: formatUsdFromCents(report.totals.d31_60),
          d61_90: formatUsdFromCents(report.totals.d61_90),
          d90_plus: formatUsdFromCents(report.totals.d90_plus),
          total_outstanding: formatUsdFromCents(report.totals.total_outstanding),
        },
        integrity_label: "Integrity",
        integrity_value: "not_applicable",
        has_rows: report.vendors.length > 0,
      },
    });
    return { filename, contentType: "application/pdf", buffer };
  }

  const rows: Array<Array<string | number>> = [
    ["AP Aging"],
    ["Company", companyCode],
    ["As of", input.as_of_date],
    ["Integrity", "not_applicable"],
    [],
    ["Vendor Name", "Vendor ID", "Current", "1-30", "31-60", "61-90", "90+", "Total Outstanding (USD)"],
  ];
  if (report.vendors.length === 0) {
    rows.push(["No data", "", "", "", "", "", "", ""]);
  } else {
    for (const row of report.vendors) {
      rows.push([
        row.vendor_name,
        row.vendor_id ?? "",
        centsToUsdNumber(row.current),
        centsToUsdNumber(row.d1_30),
        centsToUsdNumber(row.d31_60),
        centsToUsdNumber(row.d61_90),
        centsToUsdNumber(row.d90_plus),
        centsToUsdNumber(row.total_outstanding),
      ]);
    }
  }
  rows.push(
    [],
    [
      "Totals",
      "",
      centsToUsdNumber(report.totals.current),
      centsToUsdNumber(report.totals.d1_30),
      centsToUsdNumber(report.totals.d31_60),
      centsToUsdNumber(report.totals.d61_90),
      centsToUsdNumber(report.totals.d90_plus),
      centsToUsdNumber(report.totals.total_outstanding),
    ],
  );
  return {
    filename,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: renderStatementXlsx({ sheetName: "AP Aging", rows }),
  };
}
