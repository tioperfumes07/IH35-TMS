import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  getSettlementSummary,
  type SettlementDeductionBreakdown,
  type SettlementSummaryDriverRow,
  type SettlementSummaryResponse,
} from "../../api/reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportBlockTPendingBanner } from "./ReportBlockTPendingBanner";
import { ReportsSubNav } from "./ReportsSubNav";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

const DEDUCTION_ORDER: (keyof SettlementDeductionBreakdown)[] = [
  "fuel_advance",
  "tire_damage",
  "escrow_contribution",
  "abandonment_chargeback",
  "other",
];

const PIE_COLORS = ["#0d9488", "#6366f1", "#f59e0b", "#dc2626", "#64748b"];

function defaultRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function breakdownRows(b: SettlementDeductionBreakdown) {
  return DEDUCTION_ORDER.map((k) => ({ type: k, cents: b[k] ?? 0 })).filter((r) => r.cents > 0);
}

type SortKey = keyof SettlementSummaryDriverRow;

export function SettlementSummaryPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(defaultRange);
  const [applied, setApplied] = useState(defaultRange);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sortKey, setSortKey] = useState<SortKey>("net_pay_cents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const query = useQuery({
    queryKey: ["reports", "settlement-summary", companyId, applied.start, applied.end],
    queryFn: () =>
      getSettlementSummary({
        operating_company_id: companyId,
        period_start: applied.start,
        period_end: applied.end,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const pieData = useMemo(() => {
    const raw = query.data?.by_deduction_type ?? {};
    return Object.entries(raw)
      .map(([name, value]) => ({ name, value: Number(value) || 0 }))
      .filter((r) => r.value > 0);
  }, [query.data]);

  const sortedDrivers = useMemo(() => {
    const rows = query.data?.by_driver ?? [];
    const mul = sortDir === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "driver_name") return a.driver_name.localeCompare(b.driver_name) * mul;
      const av = a[sortKey as keyof SettlementSummaryDriverRow] as number;
      const bv = b[sortKey as keyof SettlementSummaryDriverRow] as number;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
      return 0;
    });
    return copy;
  }, [query.data?.by_driver, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function exportCsv(data: SettlementSummaryResponse) {
    const header = ["Driver", "Loads", "Settlements", "Gross", "Deductions", "Chargebacks", "Net", "Avg/Load"];
    const lines = (data.by_driver ?? []).map((r) =>
      [r.driver_name, r.load_count, r.settlement_count, r.gross_pay_cents, r.deduction_cents, r.chargeback_cents, r.net_pay_cents, r.avg_per_load_cents].join(
        ",",
      )
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `settlement-summary-${applied.start}-${applied.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white; } }
      `}</style>
      <ReportsSubNav />
      <PageHeader
        title="Settlement summary"
        subtitle="Driver pay, deductions, and chargebacks by period"
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              Print this page
            </Button>
            <Button size="sm" variant="secondary" disabled={!query.data} onClick={() => query.data && exportCsv(query.data)}>
              Export CSV
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
            onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <input
            type="date"
            className="mt-1 block h-9 rounded border border-gray-300 px-2"
            value={period.end}
            onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
          />
        </label>
        <Button
          size="sm"
          onClick={() => {
            setApplied({ ...period });
          }}
        >
          Apply
        </Button>
      </div>

      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {query.data ? (
        <>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Gross pay</div>
              <div className="text-lg font-semibold">{money(query.data.totals.gross_pay_cents)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Total deductions</div>
              <div className="text-lg font-semibold">{money(query.data.totals.deduction_total_cents)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Total chargebacks</div>
              <div className="text-lg font-semibold">{money(query.data.totals.chargeback_total_cents)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">Net pay</div>
              <div className="text-lg font-semibold">{money(query.data.totals.net_pay_cents)}</div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <div className="overflow-auto rounded border border-gray-200 bg-white">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
                  <tr>
                    <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("driver_name")}>
                      Driver
                    </th>
                    <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("load_count")}>
                      Loads
                    </th>
                    <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("settlement_count")}>
                      Settlements
                    </th>
                    <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("gross_pay_cents")}>
                      Gross
                    </th>
                    <th className="px-2 py-2 text-right">Deductions</th>
                    <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("chargeback_cents")}>
                      Chargebacks
                    </th>
                    <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("net_pay_cents")}>
                      Net
                    </th>
                    <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("avg_per_load_cents")}>
                      Avg/Load
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDrivers.map((r) => (
                    <Fragment key={r.driver_id}>
                      <tr
                        className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                        onClick={() => navigate(`/drivers/${r.driver_id}?tab=settlements`)}
                      >
                        <td className="px-2 py-2 font-medium text-gray-900">{r.driver_name}</td>
                        <td className="px-2 py-2 text-right">{r.load_count}</td>
                        <td className="px-2 py-2 text-right">{r.settlement_count}</td>
                        <td className="px-2 py-2 text-right">{money(r.gross_pay_cents)}</td>
                        <td
                          className="px-2 py-2 text-right text-blue-700 underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((prev) => {
                              const n = new Set(prev);
                              if (n.has(r.driver_id)) n.delete(r.driver_id);
                              else n.add(r.driver_id);
                              return n;
                            });
                          }}
                        >
                          {money(r.deduction_cents)}
                        </td>
                        <td className="px-2 py-2 text-right">{money(r.chargeback_cents)}</td>
                        <td className="px-2 py-2 text-right">{money(r.net_pay_cents)}</td>
                        <td className="px-2 py-2 text-right">{money(r.avg_per_load_cents)}</td>
                      </tr>
                      {expanded.has(r.driver_id) ? (
                        <tr className="bg-slate-50">
                          <td colSpan={8} className="px-4 py-2">
                            <div className="text-[11px] font-semibold uppercase text-gray-500">Deduction breakdown</div>
                            <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                              {breakdownRows(r.deductions_breakdown).map((row) => (
                                <li key={row.type}>
                                  <span className="text-gray-600">{row.type}:</span> {money(row.cents)}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="mb-2 text-sm font-semibold">Deductions by type</div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => money(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
