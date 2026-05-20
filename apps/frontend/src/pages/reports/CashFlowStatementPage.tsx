import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  exportCashFlowStatementReport,
  getCashFlowStatementReport,
  type AccountingCashFlowLine,
} from "../../api/reports";
import { ReportBlockTPendingBanner } from "./ReportBlockTPendingBanner";
import { ReportsSubNav } from "./ReportsSubNav";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function sortLines(lines: AccountingCashFlowLine[]) {
  return [...lines].sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
}

export function CashFlowStatementPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(currentMonthRange);
  const [applied, setApplied] = useState(currentMonthRange);

  const query = useQuery({
    queryKey: ["reports", "cash-flow-statement", companyId, applied.start, applied.end],
    queryFn: () =>
      getCashFlowStatementReport({
        operating_company_id: companyId,
        from_date: applied.start,
        to_date: applied.end,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const operatingLines = useMemo(() => sortLines(query.data?.operating.lines ?? []), [query.data?.operating.lines]);
  const investingLines = useMemo(() => sortLines(query.data?.investing.lines ?? []), [query.data?.investing.lines]);
  const financingLines = useMemo(() => sortLines(query.data?.financing.lines ?? []), [query.data?.financing.lines]);

  return (
    <div className="space-y-4 print:space-y-2">
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white; } }
      `}</style>
      <ReportsSubNav />
      <PageHeader
        title="Cash flow statement"
        subtitle="Operating, investing, and financing movements · Accrual basis"
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              Print this page
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!companyId}
              onClick={() =>
                exportCashFlowStatementReport({
                  operating_company_id: companyId,
                  range_key: "custom",
                  from_date: applied.start,
                  to_date: applied.end,
                  format: "pdf",
                })
              }
            >
              Export PDF
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!companyId}
              onClick={() =>
                exportCashFlowStatementReport({
                  operating_company_id: companyId,
                  range_key: "custom",
                  from_date: applied.start,
                  to_date: applied.end,
                  format: "xlsx",
                })
              }
            >
              Export XLSX
            </Button>
          </div>
        }
      />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {query.isError ? <ReportBlockTPendingBanner error={query.error} onRetry={() => void query.refetch()} /> : null}

      <div className="no-print flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          From
          <input
            type="date"
            className="mt-1 block h-9 rounded border border-gray-300 px-2"
            value={period.start}
            onChange={(event) => setPeriod((previous) => ({ ...previous, start: event.target.value }))}
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <input
            type="date"
            className="mt-1 block h-9 rounded border border-gray-300 px-2"
            value={period.end}
            onChange={(event) => setPeriod((previous) => ({ ...previous, end: event.target.value }))}
          />
        </label>
        <Button size="sm" onClick={() => setApplied({ ...period })}>
          Apply
        </Button>
      </div>

      {query.data ? (
        <div className="grid gap-2 md:grid-cols-4">
          <div className="rounded border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-gray-500">Net cash change</div>
            <div className="text-lg font-semibold">{money(query.data.net_cash_change)}</div>
          </div>
          <div className="rounded border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-gray-500">Cash at start</div>
            <div className="text-lg font-semibold">{money(query.data.cash_at_start)}</div>
          </div>
          <div className="rounded border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-gray-500">Cash at end</div>
            <div className="text-lg font-semibold">{money(query.data.cash_at_end)}</div>
          </div>
          <div className={`rounded border bg-white px-3 py-2 ${query.data.reconciled ? "border-emerald-200" : "border-amber-300"}`}>
            <div className="text-[11px] font-semibold uppercase text-gray-500">Reconciliation</div>
            <div className={`text-lg font-semibold ${query.data.reconciled ? "text-emerald-700" : "text-amber-700"}`}>
              {query.data.reconciled ? "Reconciled" : "Needs review"}
            </div>
            <div className="text-[11px] text-gray-500">Unclassified legs: {query.data.unclassified_leg_count}</div>
          </div>
        </div>
      ) : null}

      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {query.data ? (
        <div className="space-y-3">
          {[
            { key: "operating", title: "Operating activities", lines: operatingLines, total: query.data.operating.total },
            { key: "investing", title: "Investing activities", lines: investingLines, total: query.data.investing.total },
            { key: "financing", title: "Financing activities", lines: financingLines, total: query.data.financing.total },
          ].map((section) => (
            <div key={section.key} className="overflow-auto rounded border border-gray-200 bg-white">
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold">{section.title}</div>
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Class</th>
                    <th className="px-3 py-2">Subtype</th>
                    <th className="px-3 py-2">Label</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {section.lines.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-gray-500">
                        No rows
                      </td>
                    </tr>
                  ) : (
                    section.lines.map((line) => (
                      <tr key={`${section.key}-${line.label}`} className="border-b border-gray-100">
                        <td className="px-3 py-2">{line.account_type || "—"}</td>
                        <td className="px-3 py-2">{line.account_subtype || "—"}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{line.label || "—"}</td>
                        <td className="px-3 py-2 text-right">{money(line.amount)}</td>
                      </tr>
                    ))
                  )}
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={3} className="px-3 py-2 text-right">
                      Section total
                    </td>
                    <td className="px-3 py-2 text-right">{money(section.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
