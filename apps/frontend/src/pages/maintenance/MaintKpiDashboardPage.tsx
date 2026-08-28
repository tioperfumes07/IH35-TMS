import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getMaintenanceKpiDrilldown,
  getMaintenanceKpiPmCompliance,
  getMaintenanceKpiSummary,
  type MaintKpiDrilldownKind,
  type MaintKpiSparkPoint,
} from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/forms/shared/PageHeader";

type KpiTileId = MaintKpiDrilldownKind | "pm_compliance";
type DrillRow = Record<string, unknown>;

function defaultPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function formatUsdFromCents(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function MiniSparkline({ points, testId }: { points: MaintKpiSparkPoint[]; testId: string }) {
  const width = 120;
  const height = 28;
  const values = points.map((p) => p.value);
  const max = Math.max(1, ...values);
  const coords = values
    .map((v, i) => {
      const x = values.length <= 1 ? width / 2 : (i / (values.length - 1)) * width;
      const y = height - (v / max) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="text-slate-600" data-testid={testId} aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={coords} />
    </svg>
  );
}

function KpiTile({
  label,
  value,
  hint,
  sparkline,
  active,
  onSelect,
  testId,
}: {
  label: string;
  value: string;
  hint: string;
  sparkline: MaintKpiSparkPoint[];
  active: boolean;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded border px-3 py-2 text-left transition ${
        active ? "border-slate-500 bg-slate-50 ring-1 ring-slate-300" : "border-gray-200 bg-white hover:border-slate-300"
      }`}
      data-testid={testId}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-900">{value}</div>
      <div className="text-[10px] text-slate-500">{hint}</div>
      <div className="mt-1">
        <MiniSparkline points={sparkline} testId={`${testId}-sparkline`} />
      </div>
    </button>
  );
}

export function MaintKpiDashboardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const defaults = useMemo(() => defaultPeriod(), []);
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const [unitId, setUnitId] = useState("");
  const staged = useStagedListFilters({
    applied: { periodStart, periodEnd, unitId }, empty: { periodStart: defaults.start, periodEnd: defaults.end, unitId: "" },
    onApply: (next) => { setPeriodStart(next.periodStart); setPeriodEnd(next.periodEnd); setUnitId(next.unitId); },
  });
  const [activeKpi, setActiveKpi] = useState<KpiTileId>("downtime");
  const [pmPage, setPmPage] = useState(1);
  const pmPageSize = 25;
  const [drillPage, setDrillPage] = useState(1);
  const drillPageSize = 25;

  const summaryQ = useQuery({
    queryKey: ["maintenance", "kpi-dashboard", "summary", companyId, periodStart, periodEnd, unitId],
    queryFn: () => getMaintenanceKpiSummary(companyId, periodStart, periodEnd, unitId || undefined),
    enabled: Boolean(companyId),
  });

  const drilldownQ = useQuery({
    queryKey: ["maintenance", "kpi-dashboard", "drilldown", activeKpi, companyId, periodStart, periodEnd, unitId, pmPage, drillPage],
    queryFn: async () => {
      if (activeKpi === "pm_compliance") {
        const pm = await getMaintenanceKpiPmCompliance(companyId, periodStart, periodEnd, unitId || undefined, { limit: pmPageSize, offset: (pmPage - 1) * pmPageSize });
        return { kind: "pm_compliance" as const, rows: pm.rows as Record<string, unknown>[], total_count: pm.total_count };
      }
      const res = await getMaintenanceKpiDrilldown(activeKpi, companyId, periodStart, periodEnd, unitId || undefined, { limit: drillPageSize, offset: (drillPage - 1) * drillPageSize });
      return { kind: res.kind, rows: res.rows, total_count: res.total_count };
    },
    enabled: Boolean(companyId),
  });

  useEffect(() => { setPmPage(1); setDrillPage(1); }, [companyId, periodStart, periodEnd, unitId]);
  useEffect(() => { setPmPage(1); setDrillPage(1); }, [activeKpi]);

  const summary = summaryQ.isError ? undefined : summaryQ.data;

  const tiles = useMemo(
    () => [
      {
        id: "downtime" as const,
        label: "Downtime",
        value: `${summary?.downtime_hours ?? 0} h`,
        hint: "WO shop hours + OOS overlap",
        sparkline: summary?.sparklines.downtime ?? [],
      },
      {
        id: "mtbf" as const,
        label: "MTBF",
        value: summary?.mtbf_hours != null ? `${summary.mtbf_hours} h` : "—",
        hint: "Mean time between repair WOs",
        sparkline: summary?.sparklines.mtbf ?? [],
      },
      {
        id: "cpm" as const,
        label: "CPM",
        value: formatUsdFromCents(summary?.cpm_cents ?? null),
        hint: "Maintenance cost per mile",
        sparkline: summary?.sparklines.cpm ?? [],
      },
      {
        id: "cost_per_truck" as const,
        label: "Cost / truck",
        value: formatUsdFromCents(summary?.cost_per_truck_cents ?? 0),
        hint: "Average spend per active unit",
        sparkline: summary?.sparklines.cost_per_truck ?? [],
      },
      {
        id: "pm_compliance" as const,
        label: "PM compliance",
        value: `${summary?.pm_compliance_pct ?? 0}%`,
        hint: "Schedules without open PM alerts",
        sparkline: summary?.sparklines.pm_compliance ?? [],
      },
    ],
    [summary]
  );

  const drillRows = useMemo<DrillRow[]>(
    () => (drilldownQ.data?.rows ?? []).map((row, index) => ({ ...row, __row_key: index })),
    [drilldownQ.data?.rows],
  );

  const drillColumns = useMemo<ParityColumn<DrillRow>[]>(() => {
    const first = drillRows[0];
    if (!first) return [];
    return Object.keys(first)
      .filter((key) => key !== "__row_key")
      .map((key) => ({
        key,
        label: key.replace(/_/g, " "),
        sortable: true,
        render: (row: DrillRow) => String(row[key] ?? "—"),
      }));
  }, [drillRows]);

  return (
    <div className="space-y-4" data-testid="maint-kpi-dashboard">
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see VehiclesMasterDataPage.tsx sibling comment. */}
      <PageHeader
        title="Maintenance KPI Dashboard"
        subtitle="Downtime, MTBF, CPM, cost-per-truck, and PM compliance with drill-down."
        breadcrumb={[{ label: "Maintenance" }, { label: "KPI Dashboard" }]}
        backHref="/maintenance"
      />
      <p className="-mt-2 text-xs text-gray-500">
        Cross-link:{" "}
        <Link to="/reports/maintenance-cost-per-unit" className="font-semibold text-slate-700 underline">
          maintenance cost per unit report
        </Link>
      </p>
      <div className="flex flex-wrap items-end justify-end gap-3">
        <div data-maint-kpi-filter-toolbar="collapsed">
          <CollapsedListFilters
            activeFilterCount={
              (periodStart !== defaults.start ? 1 : 0) + (periodEnd !== defaults.end ? 1 : 0) + (unitId ? 1 : 0)
            }
            testIdPrefix="maint-kpi"
            onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
          >
            <div className="flex flex-wrap items-end gap-2 text-xs">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase text-slate-500">From</span>
                <DatePicker
                  className=""
                  value={staged.draft.periodStart}
                  onChange={(next) => staged.setDraft({ ...staged.draft, periodStart: next })}
                  data-testid="maint-kpi-filter-start"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase text-slate-500">To</span>
                <DatePicker
                  className=""
                  value={staged.draft.periodEnd}
                  onChange={(next) => staged.setDraft({ ...staged.draft, periodEnd: next })}
                  data-testid="maint-kpi-filter-end"
                />
              </label>
              <div className="flex min-w-48 flex-col gap-0.5">
                <span className="text-[10px] uppercase text-slate-500">Unit</span>
                <EntityPicker
                  kind="unit"
                  operatingCompanyId={companyId}
                  value={staged.draft.unitId || null}
                  onChange={(next) => staged.setDraft({ ...staged.draft, unitId: next ?? "" })}
                  allowCreate={false}
                  placeholder="All fleet"
                  dataTestId="maint-kpi-filter-unit"
                />
              </div>
            </div>
          </CollapsedListFilters>
        </div>
      </div>

      {summaryQ.isError ? (
        <ListErrorState
          title="Couldn't load maintenance KPI summary"
          status={0}
          message={(summaryQ.error as Error)?.message}
          onRetry={() => void summaryQ.refetch()}
        />
      ) : (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((tile) => (
          <KpiTile
            key={tile.id}
            label={tile.label}
            value={tile.value}
            hint={tile.hint}
            sparkline={tile.sparkline}
            active={activeKpi === tile.id}
            onSelect={() => setActiveKpi(tile.id)}
            testId={`maint-kpi-tile-${tile.id}`}
          />
        ))}
      </div>
      )}

      <section className="rounded-sm border border-slate-200 bg-slate-50 p-3" data-testid="maint-kpi-pm-hub">
        <div className="text-xs font-semibold uppercase text-slate-900">PM compliance hub</div>
        <p className="mt-1 text-xs text-slate-800">
          Manage schedules and the auto-WO engine from linked maintenance surfaces.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            to="/maintenance/pm-auto-engine"
            className="rounded-sm bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
            data-testid="maint-kpi-link-pm-engine"
          >
            PM auto engine
          </Link>
          <Link
            to="/maintenance/pm-schedule"
            className="rounded-sm border border-slate-400 bg-white px-3 py-1 text-xs font-semibold text-slate-900"
            data-testid="maint-kpi-link-pm-schedule"
          >
            PM schedule
          </Link>
        </div>
      </section>

      <section className="overflow-x-auto rounded-sm border border-gray-200 bg-white" data-testid="maint-kpi-drilldown">
        <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-slate-800">
          Drill-down — {activeKpi.replace(/_/g, " ")}
        </div>
        {drilldownQ.isError ? (
          <ListErrorState
            title="Couldn't load maintenance KPI details"
            status={0}
            message={(drilldownQ.error as Error)?.message}
            onRetry={() => void drilldownQ.refetch()}
          />
        ) : (
          <ParityTable
            rows={drillRows}
            columns={drillColumns}
            rowKey={(row) => String(row.__row_key)}
            loading={drilldownQ.isLoading}
            storageKey={`maintenance-kpi-drilldown-${activeKpi}`}
            emptyText="No drill-down rows for this filter window."
            exportFilename={`maint-kpi-drilldown-${activeKpi}`}
            pageSize={drillRows.length || (activeKpi === "pm_compliance" ? pmPageSize : drillPageSize)}
            pageSizeOptions={[activeKpi === "pm_compliance" ? pmPageSize : drillPageSize]}
            hidePager
          />
        )}
        {activeKpi === "pm_compliance" && !drilldownQ.isError && Number(drilldownQ.data?.total_count ?? 0) > 0 ? (
          <nav className="flex items-center justify-between border-t border-gray-100 px-3 py-2 text-xs" data-testid="maint-kpi-pm-server-pager">
            <span>{(pmPage - 1) * pmPageSize + 1}–{Math.min(pmPage * pmPageSize, Number(drilldownQ.data?.total_count ?? 0))} of {Number(drilldownQ.data?.total_count ?? 0)}</span>
            <div className="flex gap-2">
              <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={pmPage === 1 || drilldownQ.isFetching} onClick={() => setPmPage((value) => Math.max(1, value - 1))}>Previous</button>
              <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={pmPage * pmPageSize >= Number(drilldownQ.data?.total_count ?? 0) || drilldownQ.isFetching} onClick={() => setPmPage((value) => value + 1)}>Next</button>
            </div>
          </nav>
        ) : null}
        {activeKpi !== "pm_compliance" && !drilldownQ.isError && Number(drilldownQ.data?.total_count ?? 0) > 0 ? (
          <nav className="flex items-center justify-between border-t border-gray-100 px-3 py-2 text-xs" data-testid="maint-kpi-drilldown-server-pager">
            <span>{(drillPage - 1) * drillPageSize + 1}–{Math.min(drillPage * drillPageSize, Number(drilldownQ.data?.total_count ?? 0))} of {Number(drilldownQ.data?.total_count ?? 0)}</span>
            <div className="flex gap-2">
              <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={drillPage === 1 || drilldownQ.isFetching} onClick={() => setDrillPage((value) => Math.max(1, value - 1))}>Previous</button>
              <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={drillPage * drillPageSize >= Number(drilldownQ.data?.total_count ?? 0) || drilldownQ.isFetching} onClick={() => setDrillPage((value) => value + 1)}>Next</button>
            </div>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
