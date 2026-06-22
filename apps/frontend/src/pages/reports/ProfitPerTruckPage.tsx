import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getProfitPerTruck, type ProfitPerTruckResponse, type ProfitPerTruckRow, type ProfitPerTruckFlag } from "../../api/reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportBlockTPendingBanner } from "./ReportBlockTPendingBanner";
import { ReportsSubNav } from "./ReportsSubNav";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function pct(n: number) {
  return `${(Number(n) || 0).toFixed(1)}%`;
}

function currentQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const startMonth = q * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const FLAG_UI: Record<ProfitPerTruckFlag, { emoji: string; className: string; label: string }> = {
  most_profitable: { emoji: "🏆", className: "border-amber-200 bg-amber-50 text-amber-900", label: "most_profitable" },
  least_profitable: { emoji: "🚫", className: "border-rose-200 bg-rose-50 text-rose-900", label: "least_profitable" },
  high_maintenance: { emoji: "🔧", className: "border-orange-200 bg-orange-50 text-orange-900", label: "high_maintenance" },
  underutilized: { emoji: "💤", className: "border-slate-200 bg-slate-50 text-slate-800", label: "underutilized" },
};

type SortKey = keyof ProfitPerTruckRow;
type FlagFilter = "all" | ProfitPerTruckFlag;

export function ProfitPerTruckPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);
  const [sortKey, setSortKey] = useState<SortKey>("net_profit_cents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [flagFilter, setFlagFilter] = useState<FlagFilter>("all");

  const query = useQuery({
    queryKey: ["reports", "profit-per-truck", companyId, applied.start, applied.end],
    queryFn: () =>
      getProfitPerTruck({
        operating_company_id: companyId,
        period_start: applied.start,
        period_end: applied.end,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const filteredRows = useMemo(() => {
    const rows = query.data?.by_truck ?? [];
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch =
        term.length === 0 ||
        row.unit_number.toLowerCase().includes(term) ||
        row.truck_type.toLowerCase().includes(term) ||
        (row.primary_driver_name ?? "").toLowerCase().includes(term);
      const matchesFlag = flagFilter === "all" || row.flags.includes(flagFilter);
      return matchesSearch && matchesFlag;
    });
  }, [flagFilter, query.data?.by_truck, search]);

  const sorted = useMemo(() => {
    const rows = filteredRows;
    const mul = sortDir === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "unit_number" || sortKey === "truck_type") {
        const av = String(a[sortKey] ?? "");
        const bv = String(b[sortKey] ?? "");
        return av.localeCompare(bv) * mul;
      }
      if (sortKey === "primary_driver_name") {
        const av = a.primary_driver_name ?? "";
        const bv = b.primary_driver_name ?? "";
        return av.localeCompare(bv) * mul;
      }
      const av = a[sortKey] as number | string | null;
      const bv = b[sortKey] as number | string | null;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
      if (av == null && bv == null) return 0;
      if (av == null) return 1 * mul;
      if (bv == null) return -1 * mul;
      return 0;
    });
    return copy;
  }, [filteredRows, sortKey, sortDir]);

  const perMileChart = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) => b.profit_per_mile_cents - a.profit_per_mile_cents);
    return rows.slice(0, 10).map((r) => ({
      name: r.unit_number.length > 10 ? `${r.unit_number.slice(0, 8)}…` : r.unit_number,
      revenuePerMile: r.revenue_per_mile_cents,
      costPerMile: r.cost_per_mile_cents,
      profitPerMile: r.profit_per_mile_cents,
    }));
  }, [filteredRows]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function exportCsv(data: ProfitPerTruckResponse) {
    const header = [
      "Unit",
      "Type",
      "Driver",
      "Loads",
      "Miles",
      "Revenue",
      "DriverPay",
      "Fuel",
      "Maint",
      "NetProfit",
      "MarginPct",
      "PerMile",
      "Flags",
    ];
    const lines = (data.by_truck ?? []).map((r) =>
      [
        r.unit_number,
        r.truck_type,
        r.primary_driver_name ?? "",
        r.load_count,
        r.miles_driven,
        r.revenue_cents,
        r.driver_pay_cents,
        r.fuel_cents,
        r.maintenance_cents,
        r.net_profit_cents,
        r.margin_pct,
        r.profit_per_mile_cents,
        (r.flags ?? []).join("|"),
      ].join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `profit-per-truck-${applied.start}-${applied.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const t = query.data?.totals;
  const fleetMiles = useMemo(() => sorted.reduce((sum, row) => sum + row.miles_driven, 0), [sorted]);
  const fleetRevenuePerMile = fleetMiles > 0 && t ? Math.round(t.revenue_cents / fleetMiles) : 0;
  const fleetCostPerMile = fleetMiles > 0 && t ? Math.round((t.driver_pay_cents + t.fuel_cost_cents + t.maintenance_cost_cents + t.depreciation_cents + t.other_direct_cost_cents) / fleetMiles) : 0;
  const fleetProfitPerMile = fleetMiles > 0 && t ? Math.round(t.net_profit_cents / fleetMiles) : 0;
  const cpmSorted = useMemo(() => [...sorted].sort((a, b) => a.cost_per_mile_cents - b.cost_per_mile_cents), [sorted]);
  const bestCpmTruck = cpmSorted[0] ?? null;
  const worstCpmTruck = cpmSorted[cpmSorted.length - 1] ?? null;

  return (
    <div className="space-y-4 print:space-y-2">
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white; } }
      `}</style>
      <ReportsSubNav />
      <PageHeader
        title="Per-truck CPM dashboard"
        subtitle="Real cost-per-mile, revenue-per-mile, and margin by fleet unit"
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
          <DatePicker
            className="mt-1 block h-9 rounded border border-gray-300 px-2"
            value={period.start}
            onChange={(next) => setPeriod((p) => ({ ...p, start: next }))}
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker
            className="mt-1 block h-9 rounded border border-gray-300 px-2"
            value={period.end}
            onChange={(next) => setPeriod((p) => ({ ...p, end: next }))}
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
        <label className="text-xs text-gray-600">
          Search truck/driver
          <input
            className="mt-1 block h-9 w-52 rounded border border-gray-300 px-2"
            value={search}
            placeholder="e.g. 102 or Pat"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="text-xs text-gray-600">
          Flag
          <select
            className="mt-1 block h-9 rounded border border-gray-300 px-2"
            value={flagFilter}
            onChange={(event) => setFlagFilter(event.target.value as FlagFilter)}
          >
            <option value="all">All</option>
            <option value="most_profitable">Most profitable</option>
            <option value="least_profitable">Least profitable</option>
            <option value="high_maintenance">High maintenance</option>
            <option value="underutilized">Underutilized</option>
          </select>
        </label>
      </div>

      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {t ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {(
            [
              ["Revenue", money(t.revenue_cents)],
              ["Driver pay", money(t.driver_pay_cents)],
              ["Fuel", money(t.fuel_cost_cents)],
              ["Maintenance", money(t.maintenance_cost_cents)],
              ["Depreciation", money(t.depreciation_cents)],
              ["Other", money(t.other_direct_cost_cents)],
              ["Net profit", money(t.net_profit_cents)],
              ["Truck count", String(t.truck_count)],
              ["Fleet avg CPM", money(fleetCostPerMile)],
              ["Fleet avg RPM", money(fleetRevenuePerMile)],
              ["Fleet avg PPM", money(fleetProfitPerMile)],
              ["Best CPM", bestCpmTruck ? `${bestCpmTruck.unit_number} (${money(bestCpmTruck.cost_per_mile_cents)})` : "—"],
              ["Worst CPM", worstCpmTruck ? `${worstCpmTruck.unit_number} (${money(worstCpmTruck.cost_per_mile_cents)})` : "—"],
            ] as const
          ).map(([label, val]) => (
            <div key={label} className="rounded border border-gray-200 bg-white px-2 py-2">
              <div className="text-[10px] font-semibold uppercase text-gray-500">{label}</div>
              <div className="text-sm font-semibold leading-tight">{val}</div>
            </div>
          ))}
        </div>
      ) : null}

      {query.data ? (
        <>
          <div className="overflow-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
                <tr>
                  <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("unit_number")}>
                    Unit #
                  </th>
                  <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("truck_type")}>
                    Type
                  </th>
                  <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("primary_driver_name")}>
                    Driver
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("load_count")}>
                    Loads
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("miles_driven")}>
                    Miles
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("revenue_cents")}>
                    Revenue
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("driver_pay_cents")}>
                    Driver pay
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("fuel_cents")}>
                    Fuel
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("maintenance_cents")}>
                    Maint
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("net_profit_cents")}>
                    Net profit
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("margin_pct")}>
                    Margin
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("revenue_per_mile_cents")}>
                    Rev/mi
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("cost_per_mile_cents")}>
                    Cost/mi
                  </th>
                  <th className="cursor-pointer px-2 py-2 text-right" onClick={() => toggleSort("profit_per_mile_cents")}>
                    Profit/mi
                  </th>
                  <th className="px-2 py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.unit_id}
                    className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                    onClick={() => navigate(`/fleet/units/${r.unit_id}?tab=financial`)}
                  >
                    <td className="px-2 py-2 font-medium text-gray-900">{r.unit_number}</td>
                    <td className="px-2 py-2">{r.truck_type}</td>
                    <td className="px-2 py-2">{r.primary_driver_name ?? "—"}</td>
                    <td className="px-2 py-2 text-right">{r.load_count}</td>
                    <td className="px-2 py-2 text-right">{r.miles_driven}</td>
                    <td className="px-2 py-2 text-right">{money(r.revenue_cents)}</td>
                    <td className="px-2 py-2 text-right">{money(r.driver_pay_cents)}</td>
                    <td className="px-2 py-2 text-right">{money(r.fuel_cents)}</td>
                    <td className="px-2 py-2 text-right">{money(r.maintenance_cents)}</td>
                    <td className="px-2 py-2 text-right">{money(r.net_profit_cents)}</td>
                    <td className="px-2 py-2 text-right">{pct(r.margin_pct)}</td>
                    <td className="px-2 py-2 text-right">{money(r.revenue_per_mile_cents)}</td>
                    <td className="px-2 py-2 text-right">{money(r.cost_per_mile_cents)}</td>
                    <td className="px-2 py-2 text-right">{money(r.profit_per_mile_cents)}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(r.flags ?? []).map((f) => {
                          const meta = FLAG_UI[f];
                          return (
                            <span key={f} className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${meta.className}`} title={meta.label}>
                              {meta.emoji} {meta.label}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500">No trucks match the current filters for this period.</div>
            ) : null}
          </div>

          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold">Top 10 trucks by per-mile metrics</div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perMileChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => money(Number(v))} width={72} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => money(Number(v))} />
                  <Legend />
                  <Bar dataKey="revenuePerMile" name="Revenue / mi" fill="#334155" />
                  <Bar dataKey="costPerMile" name="Cost / mi" fill="#f59e0b" />
                  <Bar dataKey="profitPerMile" name="Profit / mi" fill="#155e75" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
