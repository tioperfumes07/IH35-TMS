import { useMemo, useState } from "react";
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
import { apiRequest } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";

type KpiTileId = MaintKpiDrilldownKind | "pm_compliance";

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
  const [activeKpi, setActiveKpi] = useState<KpiTileId>("downtime");

  const summaryQ = useQuery({
    queryKey: ["maintenance", "kpi-dashboard", "summary", companyId, periodStart, periodEnd, unitId],
    queryFn: () => getMaintenanceKpiSummary(companyId, periodStart, periodEnd, unitId || undefined),
    enabled: Boolean(companyId),
  });

  const unitsQ = useQuery({
    queryKey: ["maintenance", "kpi-dashboard", "units", companyId],
    queryFn: () =>
      apiRequest<{ rows: Array<{ id: string; unit_number: string }> }>(
        `/api/v1/maintenance/fleet-table/rows?operating_company_id=${encodeURIComponent(companyId)}`
      ),
    enabled: Boolean(companyId),
  });

  const drilldownQ = useQuery({
    queryKey: ["maintenance", "kpi-dashboard", "drilldown", activeKpi, companyId, periodStart, periodEnd, unitId],
    queryFn: async () => {
      if (activeKpi === "pm_compliance") {
        const pm = await getMaintenanceKpiPmCompliance(companyId, periodStart, periodEnd, unitId || undefined);
        return { kind: "pm_compliance" as const, rows: pm.rows as Record<string, unknown>[] };
      }
      const res = await getMaintenanceKpiDrilldown(activeKpi, companyId, periodStart, periodEnd, unitId || undefined);
      return { kind: res.kind, rows: res.rows };
    },
    enabled: Boolean(companyId),
  });

  const summary = summaryQ.data;

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

  const drillRows = drilldownQ.data?.rows ?? [];

  return (
    <div className="space-y-4" data-testid="maint-kpi-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Maintenance KPI Dashboard</h2>
          <p className="text-xs text-gray-500">
            Downtime, MTBF, CPM, cost-per-truck, and PM compliance with drill-down. Cross-link:{" "}
            <Link to="/reports/maintenance-cost-per-unit" className="font-semibold text-slate-700 underline">
              maintenance cost per unit report
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase text-slate-500">From</span>
            <DatePicker
              className="rounded border border-gray-300 px-2 py-1"
              value={periodStart}
              onChange={(next) => setPeriodStart(next)}
              data-testid="maint-kpi-filter-start"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase text-slate-500">To</span>
            <DatePicker
              className="rounded border border-gray-300 px-2 py-1"
              value={periodEnd}
              onChange={(next) => setPeriodEnd(next)}
              data-testid="maint-kpi-filter-end"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase text-slate-500">Unit</span>
            <select
              className="min-w-[8rem] rounded border border-gray-300 px-2 py-1"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              data-testid="maint-kpi-filter-unit"
            >
              <option value="">All fleet</option>
              {(unitsQ.data?.rows ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.unit_number}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

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

      <section className="rounded border border-slate-200 bg-slate-50 p-3" data-testid="maint-kpi-pm-hub">
        <div className="text-xs font-semibold uppercase text-slate-900">PM compliance hub</div>
        <p className="mt-1 text-xs text-slate-800">
          Manage schedules and the auto-WO engine from linked maintenance surfaces.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            to="/maintenance/pm-auto-engine"
            className="rounded bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
            data-testid="maint-kpi-link-pm-engine"
          >
            PM auto engine
          </Link>
          <Link
            to="/maintenance/pm-schedule"
            className="rounded border border-slate-400 bg-white px-3 py-1 text-xs font-semibold text-slate-900"
            data-testid="maint-kpi-link-pm-schedule"
          >
            PM schedule
          </Link>
        </div>
      </section>

      <section className="overflow-x-auto rounded border border-gray-200 bg-white" data-testid="maint-kpi-drilldown">
        <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-slate-800">
          Drill-down — {activeKpi.replace(/_/g, " ")}
        </div>
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              {drillRows[0]
                ? Object.keys(drillRows[0]).map((key) => (
                    <th key={key} className="px-2 py-1 text-left">
                      {key.replace(/_/g, " ")}
                    </th>
                  ))
                : (
                    <th className="px-2 py-1 text-left">No rows</th>
                  )}
            </tr>
          </thead>
          <tbody>
            {drillRows.map((row, idx) => (
              <tr key={idx} className="border-t border-gray-100">
                {Object.values(row).map((val, colIdx) => (
                  <td key={colIdx} className="px-2 py-1">
                    {String(val ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
            {drillRows.length === 0 ? (
              <tr>
                <td className="px-2 py-3 text-slate-500" colSpan={6}>
                  No drill-down rows for this filter window.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
