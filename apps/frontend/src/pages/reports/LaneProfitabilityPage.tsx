import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
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
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { SelectCombobox } from "../../components/Combobox";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";

import { formatUsdCents } from "../../lib/money";

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  return formatUsdCents(cents);
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

export function LaneProfitabilityPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const emptyFilters = { period: "YTD" as LaneProfitabilityPeriod, customStart: "", customEnd: "" };
  const [applied, setApplied] = useState(emptyFilters);
  const staged = useStagedListFilters({
    applied,
    empty: emptyFilters,
    onApply: setApplied,
  });
  const [selectedLane, setSelectedLane] = useState<LaneProfitabilityLane | null>(null);

  const query = useQuery({
    queryKey: ["reports", "lane-profitability", companyId, applied.period, applied.customStart, applied.customEnd],
    queryFn: () =>
      getLaneProfitability({
        operating_company_id: companyId,
        period: applied.period,
        start: applied.period === "custom" ? applied.customStart : undefined,
        end: applied.period === "custom" ? applied.customEnd : undefined,
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

  const rows = query.data?.lanes ?? [];

  const laneColumns = useMemo<ParityColumn<LaneProfitabilityLane>[]>(
    () => [
      {
        key: "lane",
        label: "Lane",
        alwaysVisible: true,
        render: (lane) => `${lane.origin_city}, ${lane.origin_state} → ${lane.destination_city}, ${lane.destination_state}`,
      },
      { key: "load_count", label: "Loads", sortable: true, className: "text-right", cellClass: "text-right" },
      { key: "total_revenue_cents", label: "Revenue", sortable: true, className: "text-right", cellClass: "text-right", render: (lane) => money(lane.total_revenue_cents) },
      {
        key: "costs",
        label: "Costs",
        className: "text-right",
        cellClass: "text-right",
        render: (lane) => money(lane.total_driver_pay_cents + lane.total_fuel_cost_cents + lane.total_maintenance_cost_cents),
      },
      { key: "gross_profit_cents", label: "Profit", sortable: true, className: "text-right", cellClass: "text-right", render: (lane) => money(lane.gross_profit_cents) },
      {
        key: "profit_per_mile_cents",
        label: "Profit/mi",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (lane) => (lane.profit_per_mile_cents != null ? money(lane.profit_per_mile_cents) : "—"),
      },
      {
        key: "margin_pct",
        label: "Margin",
        sortable: true,
        className: "text-right",
        cellClass: `text-right`,
        render: (lane) => <span className={marginClass(lane.margin_pct)}>{pct(lane.margin_pct)}</span>,
      },
    ],
    [],
  );

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

  function exportCsv() {
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

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Lane profitability" subtitle="Corridor P&L heatmap · which lanes to chase or drop" />
      <ReportsSubNav />

      {!companyId ? <p className="text-xs text-red-600">Select operating company.</p> : null}

      <div className="flex flex-wrap items-end gap-3">
        <CollapsedListFilters
          activeFilterCount={JSON.stringify(applied) !== JSON.stringify(emptyFilters) ? 1 : 0}
          onApply={staged.apply}
          onReset={staged.reset}
          onCancel={staged.cancel}
          applyDisabled={!staged.dirty}
          testIdPrefix="reports-lane-profitability"
          className="rounded-sm border border-slate-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-600">
              Period
              <SelectCombobox
                className="mt-1 block"
                value={staged.draft.period}
                onChange={(e) => staged.setDraft((p) => ({ ...p, period: e.target.value as LaneProfitabilityPeriod }))}
              >
                <option value="YTD">YTD</option>
                <option value="quarter">Last quarter</option>
                <option value="month">Last month</option>
                <option value="custom">Custom</option>
              </SelectCombobox>
            </label>
            {staged.draft.period === "custom" ? (
              <>
                <label className="text-xs text-slate-600">
                  Start
                  <DatePicker className="mt-1 block" value={staged.draft.customStart} onChange={(next) => staged.setDraft((p) => ({ ...p, customStart: next }))} />
                </label>
                <label className="text-xs text-slate-600">
                  End
                  <DatePicker className="mt-1 block" value={staged.draft.customEnd} onChange={(next) => staged.setDraft((p) => ({ ...p, customEnd: next }))} />
                </label>
              </>
            ) : null}
          </div>
        </CollapsedListFilters>
        <Button type="button" variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>

      {query.isError ? (
        <ListErrorState
          title="Couldn't load lane profitability"
          {...formatQueryErrorDetail(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.data ? (
        <>
          {/* Flat KPI strip — single section frame, no nested bordered tiles (BOX-IN-BOX). */}
          <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
            <div className="grid md:grid-cols-3 md:divide-x md:divide-slate-100">
              <div className="border-t border-slate-100 px-4 py-3 first:border-t-0 md:border-t-0">
                <div className="text-xs uppercase text-slate-500">Total loads</div>
                <div className="text-page-title font-semibold text-slate-900">{query.data.totals.load_count}</div>
              </div>
              <div className="border-t border-slate-100 bg-emerald-50 px-4 py-3 md:border-t-0">
                <div className="text-xs uppercase text-emerald-800">Most profitable lane</div>
                <div className="text-xs font-semibold text-emerald-900">
                  {query.data.most_profitable_lane
                    ? `${query.data.most_profitable_lane.origin_city}, ${query.data.most_profitable_lane.origin_state} → ${query.data.most_profitable_lane.destination_city}, ${query.data.most_profitable_lane.destination_state}`
                    : "—"}
                </div>
                <div className="text-xs text-emerald-800">
                  {query.data.most_profitable_lane ? money(query.data.most_profitable_lane.gross_profit_cents) : ""}
                </div>
              </div>
              <div className="border-t border-slate-100 bg-rose-50 px-4 py-3 md:border-t-0">
                <div className="text-xs uppercase text-rose-800">Least profitable lane</div>
                <div className="text-xs font-semibold text-rose-900">
                  {query.data.least_profitable_lane
                    ? `${query.data.least_profitable_lane.origin_city}, ${query.data.least_profitable_lane.origin_state} → ${query.data.least_profitable_lane.destination_city}, ${query.data.least_profitable_lane.destination_state}`
                    : "—"}
                </div>
                <div className="text-xs text-rose-800">
                  {query.data.least_profitable_lane ? money(query.data.least_profitable_lane.gross_profit_cents) : ""}
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-2">
              <h2 className="text-xs font-semibold text-slate-900">Profit per mile by lane (top 8)</h2>
            </div>
            <div className="h-72 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}/mi`, "Profit/mile"]} />
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
          </section>

          <ParityTable
            rows={rows}
            columns={laneColumns}
            rowKey={(lane) => `${lane.origin_city}, ${lane.origin_state} → ${lane.destination_city}, ${lane.destination_state}`}
            loading={query.isPending || (query.isFetching && rows.length === 0)}
            storageKey="lane-profitability"
            emptyText="No lanes match the current filters."
            onRowClick={(lane) => setSelectedLane(lane)}
          />
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
