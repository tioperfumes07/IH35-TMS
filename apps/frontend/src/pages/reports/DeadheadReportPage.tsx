import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportsSubNav } from "./ReportsSubNav";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { EntityLink } from "../../components/shared/EntityLink";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

type DeadheadPeriod = "last_4_weeks" | "last_12_weeks" | "YTD";

type DeadheadUnitRow = {
  unit_id: string;
  unit_number: string;
  week_starting: string;
  total_miles: number;
  loaded_miles: number;
  deadhead_miles: number;
  deadhead_pct: number | null;
  load_count: number;
  fleet_avg_deadhead_pct: number | null;
  rank_in_fleet: number | null;
};

type DeadheadReport = {
  period: { start: string; end: string; label: string };
  fleet: {
    avg_deadhead_pct: number | null;
    total_deadhead_miles: number;
    total_miles: number;
    estimated_deadhead_cost_cents: number;
    truck_count: number;
  };
  units: DeadheadUnitRow[];
  weekly_trend?: Array<{
    week_starting: string;
    deadhead_pct: number | null;
    deadhead_miles: number;
    loaded_miles: number;
  }>;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function pct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

function fetchDeadheadReport(companyId: string, period: DeadheadPeriod, unitId?: string) {
  const q = new URLSearchParams({ operating_company_id: companyId, period });
  if (unitId) q.set("unit_id", unitId);
  return apiRequest<DeadheadReport>(`/api/v1/reports/deadhead?${q.toString()}`);
}

export function DeadheadReportPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [appliedPeriod, setAppliedPeriod] = useState<DeadheadPeriod>("last_4_weeks");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const staged = useStagedListFilters({
    applied: { period: appliedPeriod },
    empty: { period: "last_4_weeks" as DeadheadPeriod },
    onApply: (next) => {
      setSelectedUnitId(null);
      setAppliedPeriod(next.period);
    },
  });

  const reportQuery = useQuery({
    queryKey: ["reports", "deadhead", companyId, appliedPeriod],
    queryFn: () => fetchDeadheadReport(companyId, appliedPeriod),
    enabled: Boolean(companyId),
    retry: false,
  });

  const drilldownQuery = useQuery({
    queryKey: ["reports", "deadhead", "drilldown", companyId, appliedPeriod, selectedUnitId],
    queryFn: () => fetchDeadheadReport(companyId, appliedPeriod, selectedUnitId ?? undefined),
    enabled: Boolean(companyId && selectedUnitId),
    retry: false,
  });

  const sortedUnits = useMemo(() => {
    const rows = [...(reportQuery.data?.units ?? [])];
    rows.sort((a, b) => (b.deadhead_pct ?? 0) - (a.deadhead_pct ?? 0));
    return rows;
  }, [reportQuery.data?.units]);

  const best = sortedUnits[sortedUnits.length - 1];
  const worst = sortedUnits[0];
  const trend = drilldownQuery.data?.weekly_trend ?? [];

  const columns = useMemo<ParityColumn<DeadheadUnitRow>[]>(
    () => [
      { key: "unit_number", label: "Truck", sortable: true, render: (row) => <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit")} className="font-medium" /> },
      { key: "deadhead_pct", label: "Deadhead %", sortable: true, render: (row) => pct(row.deadhead_pct) },
      { key: "deadhead_miles", label: "Deadhead mi", sortable: true, render: (row) => row.deadhead_miles.toLocaleString() },
      { key: "loaded_miles", label: "Loaded mi", sortable: true, render: (row) => row.loaded_miles.toLocaleString() },
      { key: "total_miles", label: "Total mi", sortable: true, render: (row) => row.total_miles.toLocaleString() },
      { key: "load_count", label: "Loads", sortable: true },
      { key: "rank_in_fleet", label: "Fleet rank", sortable: true, render: (row) => row.rank_in_fleet ?? "—" },
    ],
    [],
  );

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Deadhead optimization"
        subtitle="Empty vs loaded miles by truck · backhaul planning"
        backHref="/reports"
        breadcrumb={["Reports", "Deadhead Optimization"]}
      />
      <ReportsSubNav />

      {!companyId ? <p className="text-sm text-red-600">Select operating company.</p> : null}

      <CollapsedListFilters
        activeFilterCount={appliedPeriod !== "last_4_weeks" ? 1 : 0}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="reports-deadhead"
        className="flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-4"
      >
        <label className="text-xs text-gray-600">
          Period
          <SelectCombobox
            className="mt-1 block rounded-sm border border-gray-300 px-2 py-1 text-sm"
            value={staged.draft.period}
            onChange={(e) => staged.setDraft({ period: e.target.value as DeadheadPeriod })}
          >
            <option value="last_4_weeks">Last 4 weeks</option>
            <option value="last_12_weeks">Last 12 weeks</option>
            <option value="YTD">Year to date</option>
          </SelectCombobox>
        </label>
      </CollapsedListFilters>

      {reportQuery.data ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-sm border border-gray-200 bg-white p-4">
              <div className="text-xs text-gray-500">Fleet avg deadhead</div>
              <div className="text-2xl font-semibold">{pct(reportQuery.data.fleet.avg_deadhead_pct)}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white p-4">
              <div className="text-xs text-gray-500">Total deadhead miles</div>
              <div className="text-2xl font-semibold">{reportQuery.data.fleet.total_deadhead_miles.toLocaleString()}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white p-4">
              <div className="text-xs text-gray-500">Est. deadhead cost</div>
              <div className="text-2xl font-semibold">{money(reportQuery.data.fleet.estimated_deadhead_cost_cents)}</div>
              <div className="text-[11px] text-gray-500">Fuel CPM × 1.4 driver-pay adj</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white p-4">
              <div className="text-xs text-gray-500">Trucks tracked</div>
              <div className="text-2xl font-semibold">{reportQuery.data.fleet.truck_count}</div>
            </div>
          </div>

          {best && worst && best.unit_id !== worst.unit_id ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-sm border border-emerald-200 bg-emerald-50 p-3 text-sm">
                Best performer: <EntityLink kind="unit" id={best.unit_id} label={entityLabel(best.unit_number, best.unit_id, "Unit")} className="font-semibold" /> at {pct(best.deadhead_pct)} deadhead
              </div>
              <div className="rounded-sm border border-rose-200 bg-rose-50 p-3 text-sm">
                Needs attention: <EntityLink kind="unit" id={worst.unit_id} label={entityLabel(worst.unit_number, worst.unit_id, "Unit")} className="font-semibold" /> at {pct(worst.deadhead_pct)} deadhead
              </div>
            </div>
          ) : null}

          <ParityTable
            rows={sortedUnits}
            columns={columns}
            rowKey={(row) => row.unit_id}
            loading={reportQuery.isPending || (reportQuery.isFetching && sortedUnits.length === 0)}
            storageKey="deadhead-report"
            emptyText="No trucks with deadhead data for this period."
            rowClassName={(row) => (selectedUnitId === row.unit_id ? "bg-slate-100" : "")}
            onRowClick={(row) => setSelectedUnitId(row.unit_id)}
          />

          {selectedUnitId && trend.length > 0 ? (
            <div className="rounded-sm border border-gray-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-800">Weekly deadhead trend</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week_starting" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                    <Line type="monotone" dataKey="deadhead_pct" stroke="#dc2626" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {reportQuery.isError ? (
        <ListErrorState
          title="Couldn't load deadhead report"
          {...formatQueryErrorDetail(reportQuery.error)}
          onRetry={() => void reportQuery.refetch()}
        />
      ) : null}
    </div>
  );
}
