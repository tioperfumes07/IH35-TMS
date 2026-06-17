import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getDispatchMargin, type DispatchMarginRow } from "../../api/reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
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

type SortKey = keyof DispatchMarginRow;

export function DispatchMarginPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const [sortKey, setSortKey] = useState<SortKey>("margin_cents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const query = useQuery({
    queryKey: ["reports", "dispatch-margin", companyId, applied.start, applied.end, basis],
    queryFn: () =>
      getDispatchMargin({
        operating_company_id: companyId,
        from: applied.start,
        to: applied.end,
        basis,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const sorted = useMemo(() => {
    const rows = query.data?.rows ?? [];
    const mul = sortDir === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * mul;
      return ((Number(av) || 0) - (Number(bv) || 0)) * mul;
    });
    return copy;
  }, [query.data?.rows, sortDir, sortKey]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-3">
      <ReportsSubNav />
      <PageHeader
        title="Dispatch margin"
        actions={
          <Button variant="secondary" onClick={() => navigate("/reports")}>
            Back
          </Button>
        }
      />

      <section className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-white p-3">
        <label className="text-sm">
          From
          <DatePicker className="ml-2 rounded border px-2 py-1" value={period.start} onChange={(next) => setPeriod((p) => ({ ...p, start: next }))} />
        </label>
        <label className="text-sm">
          To
          <DatePicker className="ml-2 rounded border px-2 py-1" value={period.end} onChange={(next) => setPeriod((p) => ({ ...p, end: next }))} />
        </label>
        <label className="text-sm">
          Basis
          <select className="ml-2 rounded border px-2 py-1" value={basis} onChange={(e) => setBasis(e.target.value as "accrual" | "cash")}>
            <option value="accrual">Accrual</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        <Button onClick={() => setApplied(period)}>Apply</Button>
      </section>

      {query.isLoading ? <div className="rounded border bg-white p-4 text-sm text-slate-500">Loading…</div> : null}
      {query.isError ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load dispatch margin. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button>
        </div>
      ) : null}

      {query.data ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded border bg-white p-3">
              <div className="text-xs text-slate-500">Revenue</div>
              <div className="text-lg font-semibold">{money(query.data.totals.revenue_cents)}</div>
            </div>
            <div className="rounded border bg-white p-3">
              <div className="text-xs text-slate-500">Direct cost</div>
              <div className="text-lg font-semibold">{money(query.data.totals.direct_cost_cents)}</div>
            </div>
            <div className="rounded border bg-white p-3">
              <div className="text-xs text-slate-500">Margin</div>
              <div className="text-lg font-semibold">{money(query.data.totals.margin_cents)}</div>
            </div>
            <div className="rounded border bg-white p-3">
              <div className="text-xs text-slate-500">Loads</div>
              <div className="text-lg font-semibold">{query.data.totals.load_count}</div>
            </div>
          </div>

          {sorted.length === 0 ? (
            <div className="rounded border bg-white p-4 text-sm text-slate-500">No loads in this period.</div>
          ) : (
            <div className="overflow-x-auto rounded border bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    {[
                      ["load_number", "Load"],
                      ["customer_name", "Customer"],
                      ["revenue_cents", "Revenue"],
                      ["direct_cost_cents", "Direct cost"],
                      ["margin_cents", "Margin"],
                      ["margin_pct", "Margin %"],
                    ].map(([key, label]) => (
                      <th key={key} className="cursor-pointer px-3 py-2" onClick={() => toggleSort(key as SortKey)}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr key={row.load_id} className="border-t">
                      <td className="px-3 py-2">{row.load_number ?? row.load_id.slice(0, 8)}</td>
                      <td className="px-3 py-2">{row.customer_name ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{money(row.revenue_cents)}</td>
                      <td className="px-3 py-2 text-right">{money(row.direct_cost_cents)}</td>
                      <td className="px-3 py-2 text-right">{money(row.margin_cents)}</td>
                      <td className="px-3 py-2 text-right">{row.margin_pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
