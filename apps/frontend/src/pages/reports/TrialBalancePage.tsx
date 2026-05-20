import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  exportTrialBalanceReport,
  getTrialBalanceReport,
  type AccountingTrialBalanceRow,
} from "../../api/reports";
import { ReportBlockTPendingBanner } from "./ReportBlockTPendingBanner";
import { ReportsSubNav } from "./ReportsSubNav";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function currentQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const startMonth = q * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

type SortKey = keyof AccountingTrialBalanceRow;

export function TrialBalancePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);
  const [sortKey, setSortKey] = useState<SortKey>("account_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const query = useQuery({
    queryKey: ["reports", "trial-balance", companyId, applied.start, applied.end],
    queryFn: () =>
      getTrialBalanceReport({
        operating_company_id: companyId,
        from_date: applied.start,
        to_date: applied.end,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const rows = useMemo(() => {
    const input = query.data?.rows ?? [];
    const mul = sortDir === "asc" ? 1 : -1;
    const output = [...input];
    output.sort((a, b) => {
      if (sortKey === "account_code" || sortKey === "account_name" || sortKey === "account_type") {
        return String(a[sortKey]).localeCompare(String(b[sortKey])) * mul;
      }
      return ((a[sortKey] as number) - (b[sortKey] as number)) * mul;
    });
    return output;
  }, [query.data?.rows, sortDir, sortKey]);

  function toggleSort(next: SortKey) {
    if (sortKey === next) {
      setSortDir((value) => (value === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(next);
    setSortDir(next === "account_code" || next === "account_name" || next === "account_type" ? "asc" : "desc");
  }

  const summary = query.data?.summary;

  return (
    <div className="space-y-4 print:space-y-2">
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white; } }
      `}</style>
      <ReportsSubNav />
      <PageHeader
        title="Trial balance"
        subtitle="Ledger debits and credits by account · Accrual basis"
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
                exportTrialBalanceReport({
                  operating_company_id: companyId,
                  as_of_date: applied.end,
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
                exportTrialBalanceReport({
                  operating_company_id: companyId,
                  as_of_date: applied.end,
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

      {summary ? (
        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-gray-500">Grand total debits</div>
            <div className="text-lg font-semibold">{money(summary.grand_total_debits)}</div>
          </div>
          <div className="rounded border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-gray-500">Grand total credits</div>
            <div className="text-lg font-semibold">{money(summary.grand_total_credits)}</div>
          </div>
          <div className={`rounded border bg-white px-3 py-2 ${summary.balanced ? "border-emerald-200" : "border-rose-300"}`}>
            <div className="text-[11px] font-semibold uppercase text-gray-500">Balance check</div>
            <div className={`text-lg font-semibold ${summary.balanced ? "text-emerald-700" : "text-rose-700"}`}>
              {summary.balanced ? "Balanced" : "Out of balance"}
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("account_code")}>
                Account #
              </th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("account_name")}>
                Account
              </th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("account_type")}>
                Type
              </th>
              <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("total_debits")}>
                Debits
              </th>
              <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("total_credits")}>
                Credits
              </th>
              <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("net_balance")}>
                Net
              </th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!query.isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-gray-500">
                  No rows
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.account_id} className="border-b border-gray-100">
                <td className="px-3 py-2 font-medium text-gray-900">{row.account_code || "—"}</td>
                <td className="px-3 py-2">{row.account_name || "—"}</td>
                <td className="px-3 py-2">{row.account_type || "—"}</td>
                <td className="px-3 py-2 text-right">{money(row.total_debits)}</td>
                <td className="px-3 py-2 text-right">{money(row.total_credits)}</td>
                <td className={`px-3 py-2 text-right ${row.net_balance < 0 ? "text-rose-700" : "text-slate-900"}`}>{money(row.net_balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
