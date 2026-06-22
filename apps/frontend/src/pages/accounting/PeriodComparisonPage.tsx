import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getComparisonReport, type ComparisonReportBasis, type ComparisonReportType } from "../../api/accounting";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNav } from "./AccountingSubNav";

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

  return (
    <div className="space-y-3">
      <AccountingSubNav />
      <PageHeader
        title="Period comparison"
        subtitle="Side-by-side period variance for P&L or balance sheet with accrual/cash basis selection."
      />

      {!companyId ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Select an operating company before running comparison.</p>
      ) : null}

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-3">
        <label className="text-xs text-gray-600">
          Report type
          <select value={type} onChange={(event) => setType(event.target.value as ComparisonReportType)} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm">
            <option value="pl">P&L</option>
            <option value="bs">Balance Sheet</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Basis
          <select value={basis} onChange={(event) => setBasis(event.target.value as ComparisonReportBasis)} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm">
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
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">{reportQuery.data?.periods[0] ?? "Period 1"}</th>
              <th className="px-3 py-2">{reportQuery.data?.periods[1] ?? "Period 2"}</th>
              <th className="px-3 py-2">Variance</th>
              <th className="px-3 py-2">Variance %</th>
              <th className="px-3 py-2">Lineage</th>
            </tr>
          </thead>
          <tbody>
            {reportQuery.isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-gray-500">
                  Loading comparison...
                </td>
              </tr>
            ) : null}
            {reportQuery.isError ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-red-600">
                  Failed to load report. Use `YYYY-QN` or `YYYY-MM` in the periods input.
                </td>
              </tr>
            ) : null}
            {reportQuery.data?.rows.map((row) => (
              <tr key={row.row_key} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-900">{row.account}</td>
                <td className="px-3 py-2">{money(row.period_1_amount)}</td>
                <td className="px-3 py-2">{money(row.period_2_amount)}</td>
                <td className={`px-3 py-2 font-semibold ${row.variance_cents < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(row.variance_cents)}</td>
                <td className={`px-3 py-2 font-semibold ${row.variance_pct != null && row.variance_pct < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {row.variance_pct == null ? "n/a" : `${row.variance_pct.toFixed(2)}%`}
                </td>
                <td className="px-3 py-2">
                  <Link
                    to={`/accounting/posting-lineage?source_transaction_type=account&source_transaction_id=${encodeURIComponent(row.account_id ?? row.row_key)}`}
                    className="text-sm font-medium text-slate-700 hover:underline"
                  >
                    Open lineage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
