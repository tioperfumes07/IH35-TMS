import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getComparisonReport, type ComparisonReportBasis, type ComparisonReportRow, type ComparisonReportType } from "../../api/accounting";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function defaultPeriods() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter},${year - 1}-Q${quarter}`;
}

export function PeriodComparisonPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [type, setType] = useState<ComparisonReportType>("pl");
  const [basis, setBasis] = useState<ComparisonReportBasis>("accrual");
  const [periods, setPeriods] = useState(defaultPeriods);

  const reportQuery = useQuery({
    queryKey: ["accounting", "comparison-report", companyId, type, basis, periods],
    queryFn: () => getComparisonReport(companyId, { type, basis, periods }),
    enabled: Boolean(companyId),
  });

  const rows = reportQuery.data?.rows ?? [];
  const period1Label = reportQuery.data?.periods[0] ?? "Period 1";
  const period2Label = reportQuery.data?.periods[1] ?? "Period 2";

  // Columns are memoized on the period labels so the two amount headers track the loaded report
  // while ParityTable still owns sort (by the underlying numeric field) / resize / column-toggle.
  const columns = useMemo<Array<ParityColumn<ComparisonReportRow>>>(
    () => [
      {
        key: "account",
        label: "Account",
        sortable: true,
        render: (row) => <span className="text-gray-900">{row.account}</span>,
      },
      {
        key: "period_1_amount",
        label: period1Label,
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        render: (row) => money(row.period_1_amount),
      },
      {
        key: "period_2_amount",
        label: period2Label,
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        render: (row) => money(row.period_2_amount),
      },
      {
        key: "variance_cents",
        label: "Variance",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        render: (row) => (
          <span className={`font-semibold ${row.variance_cents < 0 ? "text-red-700" : "text-slate-700"}`}>{money(row.variance_cents)}</span>
        ),
      },
      {
        key: "variance_pct",
        label: "Variance %",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (row) => row.variance_pct,
        render: (row) => (
          <span className={`font-semibold ${row.variance_pct != null && row.variance_pct < 0 ? "text-red-700" : "text-slate-700"}`}>
            {row.variance_pct == null ? "n/a" : `${row.variance_pct.toFixed(2)}%`}
          </span>
        ),
      },
      {
        key: "lineage",
        label: "Lineage",
        alwaysVisible: true,
        render: (row) => (
          <Link
            to={`/accounting/posting-lineage?source_transaction_type=account&source_transaction_id=${encodeURIComponent(row.account_id ?? row.row_key)}`}
            className="text-sm font-medium text-slate-700 hover:underline"
          >
            Open lineage
          </Link>
        ),
      },
    ],
    [period1Label, period2Label],
  );

  return (
    <AccountingSubNavWrapper title="Period comparison" subtitle="Side-by-side period variance for P&L or balance sheet with accrual/cash basis selection.">

      {!companyId ? (
        <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">Select an operating company before running comparison.</p>
      ) : null}

      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-3">
        <label className="text-xs text-gray-600">
          Report type
          <select value={type} onChange={(event) => setType(event.target.value as ComparisonReportType)} className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm">
            <option value="pl">P&L</option>
            <option value="bs">Balance Sheet</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Basis
          <select value={basis} onChange={(event) => setBasis(event.target.value as ComparisonReportBasis)} className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm">
            <option value="accrual">Accrual</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Periods (comma-separated)
          <input
            value={periods}
            onChange={(event) => setPeriods(event.target.value)}
            placeholder="2026-Q1,2025-Q1"
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
        </label>
      </div>

      {reportQuery.isError ? (
        <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Failed to load report. Use `YYYY-QN` or `YYYY-MM` in the periods input.
        </p>
      ) : null}

      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.row_key}
        loading={reportQuery.isLoading}
        emptyText="No comparison rows for the selected periods."
        storageKey="accounting-period-comparison"
        exportFilename="period-comparison"
      />
    </AccountingSubNavWrapper>
  );
}
