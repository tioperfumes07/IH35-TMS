import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  getMaintenanceCostPerUnit,
  type MaintenanceCostFlag,
  type MaintenanceCostPerUnitResponse,
  type MaintenanceCostUnitRow,
} from "../../api/reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportBlockVPendingBanner } from "./ReportBlockVPendingBanner";
import { ReportsSubNav } from "./ReportsSubNav";
import { formatChartLegendLabel } from "../../lib/chartLegend";

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

const FLAG_META: Record<MaintenanceCostFlag, { emoji: string; label: string }> = {
  high_cost: { emoji: "🚨", label: "high_cost" },
  low_cost: { emoji: "🟢", label: "low_cost" },
  inspection_due: { emoji: "🔧", label: "inspection_due" },
  reliable: { emoji: "⭐", label: "reliable" },
};

const PIE_COLORS = ["#0d9488", "#6366f1", "#f59e0b", "#dc2626", "#64748b", "#8b5cf6"];

type SortKey = keyof MaintenanceCostUnitRow;

export function MaintenanceCostPerUnitPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);
  const [sortKey, setSortKey] = useState<SortKey>("total_cents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const query = useQuery({
    queryKey: ["reports", "maintenance-cost-per-unit", companyId, applied.start, applied.end],
    queryFn: () =>
      getMaintenanceCostPerUnit({
        operating_company_id: companyId,
        period_start: applied.start,
        period_end: applied.end,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const pieData = useMemo(() => {
    const raw = query.data?.by_category ?? [];
    return raw.map((c) => ({ name: c.category, value: c.amount_cents })).filter((r) => r.value > 0);
  }, [query.data?.by_category]);

  const sorted = useMemo(() => {
    const rows = query.data?.by_truck ?? [];
    const mul = sortDir === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "unit_number") return a.unit_number.localeCompare(b.unit_number) * mul;
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return (av - bv) * mul;
    });
    return copy;
  }, [query.data?.by_truck, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function exportCsv(data: MaintenanceCostPerUnitResponse) {
    const h = ["Unit", "WOs", "Parts", "Labor", "Outsourced", "Total", "Miles", "PerMile", "Flags"];
    const lines = (data.by_truck ?? []).map((r) =>
      [r.unit_number, r.wo_count, r.parts_cents, r.labor_cents, r.outsourced_cents, r.total_cents, r.miles, r.cost_per_mile_cents, r.flags.join("|")].join(","),
    );
    const blob = new Blob([[h.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maintenance-cost-per-unit-${applied.start}-${applied.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const t = query.data?.totals;

  return (
    <div className="space-y-4 print:space-y-2">
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <ReportsSubNav />
      <PageHeader
        title="Maintenance cost per unit"
        subtitle="WO parts, labor, and outsourced spend by truck"
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
      {query.isError ? <ReportBlockVPendingBanner error={query.error} onRetry={() => void query.refetch()} /> : null}

      <div className="no-print flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          From
          <input type="date" className="mt-1 block h-9 rounded border px-2" value={period.start} onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))} />
        </label>
        <label className="text-xs text-gray-600">
          To
          <input type="date" className="mt-1 block h-9 rounded border px-2" value={period.end} onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))} />
        </label>
        <Button size="sm" onClick={() => setApplied({ ...period })}>
          Apply
        </Button>
      </div>

      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {t ? (
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {(
            [
              ["WO count", String(t.wo_count)],
              ["Parts", money(t.parts_cents)],
              ["Labor", money(t.labor_cents)],
              ["Outsourced", money(t.outsourced_cents)],
              ["Grand total", money(t.grand_total_cents)],
              ["Truck count", String(t.truck_count)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">{k}</div>
              <div className="text-lg font-semibold">{v}</div>
            </div>
          ))}
        </div>
      ) : null}

      {query.data ? (
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="overflow-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
                <tr>
                  <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("unit_number")}>
                    Unit #
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("wo_count")}>
                    WO count
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("parts_cents")}>
                    Parts
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("labor_cents")}>
                    Labor
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("outsourced_cents")}>
                    Outsourced
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("total_cents")}>
                    Total
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("miles")}>
                    Miles
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("cost_per_mile_cents")}>
                    $/Mile
                  </th>
                  <th className="px-2 py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r: MaintenanceCostUnitRow) => (
                  <tr
                    key={r.unit_id}
                    className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                    onClick={() => navigate(`/fleet/units/${r.unit_id}?tab=maintenance`)}
                  >
                    <td className="px-2 py-2 font-medium">{r.unit_number}</td>
                    <td className="px-2 py-2 text-right">{r.wo_count}</td>
                    <td className="px-2 py-2 text-right">{money(r.parts_cents)}</td>
                    <td className="px-2 py-2 text-right">{money(r.labor_cents)}</td>
                    <td className="px-2 py-2 text-right">{money(r.outsourced_cents)}</td>
                    <td className="px-2 py-2 text-right">{money(r.total_cents)}</td>
                    <td className="px-2 py-2 text-right">{r.miles}</td>
                    <td className="px-2 py-2 text-right">{money(r.cost_per_mile_cents)}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(r.flags ?? []).map((f) => (
                          <span key={f} className="rounded border border-gray-200 px-1 py-0.5 text-[10px] font-semibold" title={FLAG_META[f].label}>
                            {FLAG_META[f].emoji} {FLAG_META[f].label}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pieData.length > 0 ? (
            <div className="h-72 rounded border border-gray-200 bg-white p-2">
              <div className="text-xs font-semibold text-gray-700">By category</div>
              <ResponsiveContainer width="100%" height="90%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => money(value)} />
                  <Legend formatter={(value, _entry, i) => `${formatChartLegendLabel(value)} · ${money(pieData[i]?.value ?? 0)}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
