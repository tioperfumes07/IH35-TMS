import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { BasisSelector, type AccountingBasis } from "../../components/accounting/BasisSelector";
import {
  exportBalanceSheetReport,
  getBalanceSheetReport,
  type AccountingBalanceSheetLine,
} from "../../api/reports";
import { ReportBlockTPendingBanner } from "./ReportBlockTPendingBanner";
import { ReportsSubNav } from "./ReportsSubNav";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function sortLines(lines: AccountingBalanceSheetLine[]) {
  return [...lines].sort((a, b) => String(a.account_code || "").localeCompare(String(b.account_code || "")));
}

export function BalanceSheetPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [appliedAsOf, setAppliedAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [basis, setBasis] = useState<AccountingBasis>("accrual");

  const query = useQuery({
    queryKey: ["reports", "balance-sheet", companyId, appliedAsOf, basis],
    queryFn: () =>
      getBalanceSheetReport({
        operating_company_id: companyId,
        as_of_date: appliedAsOf,
        basis,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const assets = useMemo(() => sortLines(query.data?.assets.lines ?? []), [query.data?.assets.lines]);
  const liabilities = useMemo(() => sortLines(query.data?.liabilities.lines ?? []), [query.data?.liabilities.lines]);
  const equity = useMemo(() => sortLines(query.data?.equity.lines ?? []), [query.data?.equity.lines]);
  const cashBasisAdjustment = useMemo(
    () =>
      equity.find(
        (line) =>
          String(line.account_name).toLowerCase() === "cash basis adjustment" ||
          String(line.account_code).toUpperCase() === "CASH_BASIS_ADJ",
      ) ?? null,
    [equity],
  );
  const equityLinesWithoutAdjustment = useMemo(
    () =>
      equity.filter(
        (line) =>
          !(String(line.account_name).toLowerCase() === "cash basis adjustment" || String(line.account_code).toUpperCase() === "CASH_BASIS_ADJ"),
      ),
    [equity],
  );

  return (
    <div className="space-y-4 print:space-y-2">
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white; } }
      `}</style>
      <ReportsSubNav />
      <PageHeader
        title="Balance sheet"
        subtitle={`As of ${appliedAsOf} · ${basis === "cash" ? "Cash" : "Accrual"} basis`}
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
                exportBalanceSheetReport({
                  operating_company_id: companyId,
                  as_of_date: appliedAsOf,
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
                exportBalanceSheetReport({
                  operating_company_id: companyId,
                  as_of_date: appliedAsOf,
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
        <BasisSelector value={basis} onChange={setBasis} />
        <label className="text-xs text-gray-600">
          As-of date
          <DatePicker className="mt-1 block h-9 rounded border border-gray-300 px-2" value={asOf} onChange={(next) => setAsOf(next)} />
        </label>
        <Button size="sm" onClick={() => setAppliedAsOf(asOf)}>
          Apply
        </Button>
      </div>

      {query.data ? (
        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-gray-500">Assets</div>
            <div className="text-lg font-semibold">{money(query.data.assets.total)}</div>
          </div>
          <div className="rounded border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-gray-500">Liabilities + equity</div>
            <div className="text-lg font-semibold">{money(query.data.total_liabilities_and_equity)}</div>
          </div>
          <div className={`rounded border bg-white px-3 py-2 ${query.data.balanced ? "border-emerald-200" : "border-rose-300"}`}>
            <div className="text-[11px] font-semibold uppercase text-gray-500">Balance check</div>
            <div className={`text-lg font-semibold ${query.data.balanced ? "text-emerald-700" : "text-rose-700"}`}>
              {query.data.balanced ? "Balanced" : "Out of balance"}
            </div>
          </div>
        </div>
      ) : null}

      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {query.data ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="overflow-auto rounded border border-gray-200 bg-white">
            <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold">Assets</div>
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-3 py-2">Account #</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {assets.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-gray-500">
                      No rows
                    </td>
                  </tr>
                ) : (
                  assets.map((line) => (
                    <tr key={`asset-${line.account_code}-${line.account_name}`} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{line.account_code || "—"}</td>
                      <td className="px-3 py-2">{line.account_name || "—"}</td>
                      <td className="px-3 py-2 text-right">{money(line.amount)}</td>
                    </tr>
                  ))
                )}
                <tr className="bg-slate-50 font-semibold">
                  <td colSpan={2} className="px-3 py-2 text-right">
                    Total assets
                  </td>
                  <td className="px-3 py-2 text-right">{money(query.data.assets.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-3">
            <div className="overflow-auto rounded border border-gray-200 bg-white">
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold">Liabilities</div>
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Account #</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {liabilities.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-gray-500">
                        No rows
                      </td>
                    </tr>
                  ) : (
                    liabilities.map((line) => (
                      <tr key={`liability-${line.account_code}-${line.account_name}`} className="border-b border-gray-100">
                        <td className="px-3 py-2 font-medium text-gray-900">{line.account_code || "—"}</td>
                        <td className="px-3 py-2">{line.account_name || "—"}</td>
                        <td className="px-3 py-2 text-right">{money(line.amount)}</td>
                      </tr>
                    ))
                  )}
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={2} className="px-3 py-2 text-right">
                      Total liabilities
                    </td>
                    <td className="px-3 py-2 text-right">{money(query.data.liabilities.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="overflow-auto rounded border border-gray-200 bg-white">
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold">Equity</div>
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Account #</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {equityLinesWithoutAdjustment.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-gray-500">
                        No rows
                      </td>
                    </tr>
                  ) : (
                    equityLinesWithoutAdjustment.map((line) => (
                      <tr key={`equity-${line.account_code}-${line.account_name}`} className="border-b border-gray-100">
                        <td className="px-3 py-2 font-medium text-gray-900">{line.account_code || "—"}</td>
                        <td className="px-3 py-2">{line.account_name || "—"}</td>
                        <td className="px-3 py-2 text-right">{money(line.amount)}</td>
                      </tr>
                    ))
                  )}
                  {basis === "cash" ? (
                    <tr className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{cashBasisAdjustment?.account_code ?? "CASH_BASIS_ADJ"}</td>
                      <td className="px-3 py-2">{cashBasisAdjustment?.account_name ?? "Cash Basis Adjustment"}</td>
                      <td className="px-3 py-2 text-right">{money(cashBasisAdjustment?.amount ?? 0)}</td>
                    </tr>
                  ) : null}
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={2} className="px-3 py-2 text-right">
                      Current year earnings
                    </td>
                    <td className="px-3 py-2 text-right">{money(query.data.equity.current_year_earnings)}</td>
                  </tr>
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={2} className="px-3 py-2 text-right">
                      Total equity
                    </td>
                    <td className="px-3 py-2 text-right">{money(query.data.equity.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
