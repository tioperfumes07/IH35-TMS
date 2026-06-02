import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getLaneProfitability,
  getLaneProfitabilityLoads,
  type LaneProfitabilityLane,
  type LaneProfitabilityPeriod,
} from "../../api/reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { LaneDetailModal } from "../../components/reports/LaneDetailModal";
import { ReportsSubNav } from "./ReportsSubNav";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function pct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

function marginClass(margin: number | null) {
  if (margin == null) return "text-gray-600";
  if (margin >= 20) return "text-emerald-700 font-semibold";
  if (margin >= 10) return "text-amber-700";
  return "text-rose-700 font-semibold";
}

type SortKey = keyof Pick<
  LaneProfitabilityLane,
  "load_count" | "total_revenue_cents" | "gross_profit_cents" | "profit_per_mile_cents" | "margin_pct"
>;

export function LaneProfitabilityPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState<LaneProfitabilityPeriod>("YTD");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [applied, setApplied] = useState<{ period: LaneProfitabilityPeriod; start?: string; end?: string }>({
    period: "YTD",
  });
  const [sortKey, setSortKey] = useState<SortKey>("gross_profit_cents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedLane, setSelectedLane] = useState<LaneProfitabilityLane | null>(null);

  const query = useQuery({
    queryKey: ["reports", "lane-profitability", companyId, applied.period, applied.start, applied.end],
    queryFn: () =>
      getLaneProfitability({
        operating_company_id: companyId,
        period: applied.period,
        start: applied.start,
        end: applied.end,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const detailQuery = useQuery({
    queryKey: [
      "reports",
      "lane-profitability-loads",
      companyId,
      query.data?.period.start,
      query.data?.period.end,
      selectedLane?.origin_city,
      selectedLane?.origin_state,
      selectedLane?.destination_city,
      selectedLane?.destination_state,
    ],
    queryFn: () =>
      getLaneProfitabilityLoads({
        operating_company_id: companyId,
        period_start: query.data!.period.start,
        period_end: query.data!.period.end,
        origin_city: selectedLane!.origin_city,
        origin_state: selectedLane!.origin_state,
        destination_city: selectedLane!.destination_city,
        destination_state: selectedLane!.destination_state,
      }),
    enabled: Boolean(companyId && selectedLane && query.data?.period),
    retry: false,
  });

  const sorted = useMemo(() => {
    const rows = [...(query.data?.lanes ?? [])];
    const mul = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return ((Number(av) || 0) - (Number(bv) || 0)) * mul;
    });
    return rows;
  }, [query.data?.lanes, sortDir, sortKey]);

  const chartData = useMemo(() => {
    return [...(query.data?.lanes ?? [])]
      .sort((a, b) => (b.profit_per_mile_cents ?? 0) - (a.profit_per_mile_cents ?? 0))
      .slice(0, 8)
      .map((lane) => ({
        name: `${lane.origin_city}→${lane.destination_city}`,
        profit_per_mile: (lane.profit_per_mile_cents ?? 0) / 100,
        margin: lane.margin_pct ?? 0,
      }));
  }, [query.data?.lanes]);

  function applyPeriod() {
    setApplied({
      period,
      start: period === "custom" ? customStart : undefined,
      end: period === "custom" ? customEnd : undefined,
    });
  }

  function exportCsv() {
    const rows = sorted;
    const header = [
      "Origin City",
      "Origin State",
      "Destination City",
      "Destination State",
      "Load Count",
      "Revenue",
      "Gross Profit",
      "Profit/Mile",
      "Margin %",
    ];
    const lines = rows.map((lane) =>
      [
        lane.origin_city,
        lane.origin_state,
        lane.destination_city,
        lane.destination_state,
        lane.load_count,
        (lane.total_revenue_cents / 100).toFixed(2),
        (lane.gross_profit_cents / 100).toFixed(2),
        lane.profit_per_mile_cents != null ? (lane.profit_per_mile_cents / 100).toFixed(2) : "",
        lane.margin_pct ?? "",
      ].join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lane-profitability-${query.data?.period.start ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  }

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Lane profitability" subtitle="Corridor P&L heatmap · which lanes to chase or drop" />
      <ReportsSubNav />

      {!companyId ? <p className="text-sm text-red-600">Select operating company.</p> : null}

      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-4">
        <label className="text-xs text-gray-600">
          Period
          <select
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value as LaneProfitabilityPeriod)}
          >
            <option value="YTD">YTD</option>
            <option value="quarter">Last quarter</option>
            <option value="month">Last month</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {period === "custom" ? (
          <>
            <label className="text-xs text-gray-600">
              Start
              <input
                type="date"
                className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </label>
            <label className="text-xs text-gray-600">
              End
              <input
                type="date"
                className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </label>
          </>
        ) : null}
        <Button type="button" onClick={applyPeriod}>
          Apply
        </Button>
        <Button type="button" variant="secondary" onClick={exportCsv} disabled={sorted.length === 0}>
          Export CSV
        </Button>
      </div>

      {query.isError ? <p className="text-sm text-red-600">Failed to load lane profitability.</p> : null}

      {query.data ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border border-gray-200 bg-white p-4">
              <div className="text-xs uppercase text-gray-500">Total loads</div>
              <div className="text-2xl font-semibold">{query.data.totals.load_count}</div>
            </div>
            <div className="rounded border border-emerald-100 bg-emerald-50 p-4">
              <div className="text-xs uppercase text-emerald-800">Most profitable lane</div>
              <div className="text-sm font-semibold text-emerald-900">
                {query.data.most_profitable_lane
                  ? `${query.data.most_profitable_lane.origin_city}, ${query.data.most_profitable_lane.origin_state} → ${query.data.most_profitable_lane.destination_city}, ${query.data.most_profitable_lane.destination_state}`
                  : "—"}
              </div>
              <div className="text-xs text-emerald-800">
                {query.data.most_profitable_lane ? money(query.data.most_profitable_lane.gross_profit_cents) : ""}
              </div>
            </div>
            <div className="rounded border border-rose-100 bg-rose-50 p-4">
              <div className="text-xs uppercase text-rose-800">Least profitable lane</div>
              <div className="text-sm font-semibold text-rose-900">
                {query.data.least_profitable_lane
                  ? `${query.data.least_profitable_lane.origin_city}, ${query.data.least_profitable_lane.origin_state} → ${query.data.least_profitable_lane.destination_city}, ${query.data.least_profitable_lane.destination_state}`
                  : "—"}
              </div>
              <div className="text-xs text-rose-800">
                {query.data.least_profitable_lane ? money(query.data.least_profitable_lane.gross_profit_cents) : ""}
              </div>
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Profit per mile by lane (top 8)</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}/mi`, "Profit/mile"]} />
                  <Bar dataKey="profit_per_mile" name="Profit/mile">
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.margin >= 20 ? "#059669" : entry.margin >= 10 ? "#d97706" : "#e11d48"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2">Lane</th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("load_count")}>
                    Loads
                  </th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("total_revenue_cents")}>
                    Revenue
                  </th>
                  <th className="px-3 py-2">Costs</th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("gross_profit_cents")}>
                    Profit
                  </th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("profit_per_mile_cents")}>
                    Profit/mi
                  </th>
                  <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("margin_pct")}>
                    Margin
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((lane) => {
                  const totalCosts =
                    lane.total_driver_pay_cents + lane.total_fuel_cost_cents + lane.total_maintenance_cost_cents;
                  const label = `${lane.origin_city}, ${lane.origin_state} → ${lane.destination_city}, ${lane.destination_state}`;
                  return (
                    <tr
                      key={label}
                      className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                      onClick={() => setSelectedLane(lane)}
                    >
                      <td className="px-3 py-2 font-medium">{label}</td>
                      <td className="px-3 py-2">{lane.load_count}</td>
                      <td className="px-3 py-2">{money(lane.total_revenue_cents)}</td>
                      <td className="px-3 py-2">{money(totalCosts)}</td>
                      <td className="px-3 py-2">{money(lane.gross_profit_cents)}</td>
                      <td className="px-3 py-2">
                        {lane.profit_per_mile_cents != null ? money(lane.profit_per_mile_cents) : "—"}
                      </td>
                      <td className={`px-3 py-2 ${marginClass(lane.margin_pct)}`}>{pct(lane.margin_pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <LaneDetailModal
        open={Boolean(selectedLane)}
        lane={selectedLane}
        loads={detailQuery.data ?? []}
        loading={detailQuery.isLoading}
        onClose={() => setSelectedLane(null)}
      />
    </div>
  );
}
