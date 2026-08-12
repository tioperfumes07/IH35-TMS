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
import { useListState } from "../../components/list-state";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";

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

const FLAG_UI: Record<ProfitPerTruckFlag, { className: string; label: string }> = {
  most_profitable: { className: "border-slate-300 bg-slate-100 text-[#1f2a44]", label: "most_profitable" },
  least_profitable: { className: "border-slate-300 bg-slate-100 text-slate-700", label: "least_profitable" },
  high_maintenance: { className: "border-slate-300 bg-slate-100 text-slate-700", label: "high_maintenance" },
  underutilized: { className: "border-slate-200 bg-slate-50 text-slate-800", label: "underutilized" },
};

type FlagFilter = "all" | ProfitPerTruckFlag;

export function ProfitPerTruckPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);
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

  const sorted = filteredRows;

  const listState = useListState(query, sorted.length === 0);

  const columns = useMemo<ParityColumn<ProfitPerTruckRow>[]>(
    () => [
      {
        key: "unit_number",
        label: "Unit #",
        sortable: true,
        render: (r) => (
          <EntityLink kind="unit" id={r.unit_id} label={entityLabel(r.unit_number, r.unit_id, "Unit")} className="font-medium text-gray-900" onClick={(event) => event.stopPropagation()} />
        ),
      },
      { key: "truck_type", label: "Type", sortable: true },
      {
        key: "primary_driver_name",
        label: "Driver",
        sortable: true,
        render: (r) => entityLabel(r.primary_driver_name, r.primary_driver_id, "Driver"),
      },
      { key: "load_count", label: "Loads", sortable: true, className: "text-right", cellClass: "text-right" },
      { key: "miles_driven", label: "Miles", sortable: true, className: "text-right", cellClass: "text-right" },
      { key: "revenue_cents", label: "Revenue", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.revenue_cents) },
      { key: "driver_pay_cents", label: "Driver pay", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.driver_pay_cents) },
      { key: "fuel_cents", label: "Fuel", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.fuel_cents) },
      { key: "maintenance_cents", label: "Maint", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.maintenance_cents) },
      { key: "net_profit_cents", label: "Net profit", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.net_profit_cents) },
      { key: "margin_pct", label: "Margin", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => pct(r.margin_pct) },
      { key: "revenue_per_mile_cents", label: "Rev/mi", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.revenue_per_mile_cents) },
      { key: "cost_per_mile_cents", label: "Cost/mi", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.cost_per_mile_cents) },
      { key: "profit_per_mile_cents", label: "Profit/mi", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.profit_per_mile_cents) },
      {
        key: "flags",
        label: "Flags",
        render: (r) => (
          <div className="flex flex-wrap gap-1">
            {(r.flags ?? []).map((f) => {
              const meta = FLAG_UI[f];
              return (
                <span key={f} className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${meta.className}`} title={meta.label}>
                  {meta.label}
                </span>
              );
            })}
          </div>
        ),
      },
    ],
    [],
  );

  const perMileChart = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) => b.profit_per_mile_cents - a.profit_per_mile_cents);
    return rows.slice(0, 10).map((r) => {
      const unitLabel = entityLabel(r.unit_number, r.unit_id, "Unit");
      return {
        name: unitLabel.length > 10 ? `${unitLabel.slice(0, 8)}…` : unitLabel,
        revenuePerMile: r.revenue_per_mile_cents,
        costPerMile: r.cost_per_mile_cents,
        profitPerMile: r.profit_per_mile_cents,
      };
    });
  }, [filteredRows]);

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
        backHref="/reports"
        breadcrumb={["Reports", "Per-Truck CPM Dashboard"]}
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

      <div className="no-print flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          From
          <DatePicker
            className="mt-1 block h-9 rounded-sm border border-gray-300 px-2"
            value={period.start}
            onChange={(next) => setPeriod((p) => ({ ...p, start: next }))}
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker
            className="mt-1 block h-9 rounded-sm border border-gray-300 px-2"
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
            className="mt-1 block h-9 w-52 rounded-sm border border-gray-300 px-2"
            value={search}
            placeholder="e.g. 102 or Pat"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="text-xs text-gray-600">
          Flag
          <select
            className="mt-1 block h-9 rounded-sm border border-gray-300 px-2"
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
              ["Best CPM", bestCpmTruck ? `${entityLabel(bestCpmTruck.unit_number, bestCpmTruck.unit_id, "Unit")} (${money(bestCpmTruck.cost_per_mile_cents)})` : "—"],
              ["Worst CPM", worstCpmTruck ? `${entityLabel(worstCpmTruck.unit_number, worstCpmTruck.unit_id, "Unit")} (${money(worstCpmTruck.cost_per_mile_cents)})` : "—"],
            ] as const
          ).map(([label, val]) => (
            <div key={label} className="rounded-sm border border-gray-200 bg-white px-2 py-2">
              <div className="text-[10px] font-semibold uppercase text-gray-500">{label}</div>
              <div className="text-sm font-semibold leading-tight">{val}</div>
            </div>
          ))}
        </div>
      ) : null}

      {query.data ? (
        <>
          <ParityTable
            rows={sorted}
            columns={columns}
            rowKey={(r) => r.unit_id}
            loading={listState.isLoading}
            storageKey="profit-per-truck"
            emptyText="No trucks match the current filters for this period."
            exportFilename={`profit-per-truck-${applied.start}-${applied.end}`}
            onRowClick={(r) => navigate(`/fleet/units/${r.unit_id}?tab=financial`)}
          />

          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold">Top 10 trucks by per-mile metrics</div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perMileChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => money(Number(v))} width={72} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => money(Number(v))} />
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
