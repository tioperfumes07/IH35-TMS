import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
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
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";

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

const FLAG_META: Record<MaintenanceCostFlag, { label: string }> = {
  high_cost: { label: "high_cost" },
  low_cost: { label: "low_cost" },
  inspection_due: { label: "inspection_due" },
  reliable: { label: "reliable" },
};

const PIE_COLORS = ["#0d9488", "#155e75", "#f59e0b", "#dc2626", "#64748b", "#1e293b"];

export function MaintenanceCostPerUnitPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);

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
    const raw = query.data?.by_category ?? {};
    return Object.entries(raw)
      .map(([category, cents]) => ({ name: category, value: Number(cents) || 0 }))
      .filter((r) => r.value > 0);
  }, [query.data?.by_category]);

  const rows = query.data?.by_truck ?? [];

  const columns = useMemo<ParityColumn<MaintenanceCostUnitRow>[]>(
    () => [
      {
        key: "unit_number",
        label: "Unit #",
        sortable: true,
        render: (r) => (
          <EntityLink
            kind="unit"
            id={r.unit_id}
            label={entityLabel(r.unit_number, r.unit_id, "Unit")}
            className="font-medium"
            onClick={(event) => event.stopPropagation()}
          />
        ),
      },
      { key: "wo_count", label: "WO count", sortable: true, className: "text-right", cellClass: "text-right" },
      { key: "parts_cents", label: "Parts", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.parts_cents) },
      { key: "labor_cents", label: "Labor", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.labor_cents) },
      { key: "outsourced_cents", label: "Outsourced", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.outsourced_cents) },
      { key: "total_cents", label: "Total", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => money(r.total_cents) },
      { key: "miles_driven", label: "Miles", sortable: true, className: "text-right", cellClass: "text-right" },
      { key: "cost_per_mile_cents", label: "$/Mile", sortable: true, className: "text-right", cellClass: "text-right", render: (r) => (r.cost_per_mile_cents === null ? "—" : money(r.cost_per_mile_cents)) },
      {
        key: "flags",
        label: "Flags",
        render: (r) => (
          <div className="flex flex-wrap gap-1">
            {(r.flags ?? []).map((f) => (
              <span key={f} className="rounded-sm border border-slate-300 bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-700" title={FLAG_META[f].label}>
                {FLAG_META[f].label}
              </span>
            ))}
          </div>
        ),
      },
    ],
    [],
  );

  function exportCsv(data: MaintenanceCostPerUnitResponse) {
    const h = ["Unit", "WOs", "Parts", "Labor", "Outsourced", "Total", "Miles", "PerMile", "Flags"];
    const lines = (data.by_truck ?? []).map((r) =>
      [r.unit_number, r.wo_count, r.parts_cents, r.labor_cents, r.outsourced_cents, r.total_cents, r.miles_driven, r.cost_per_mile_cents ?? "", r.flags.join("|")].join(","),
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
        backHref="/reports"
        breadcrumb={["Reports", "Maintenance Cost Per Unit"]}
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

      <div className="no-print flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          From
          <DatePicker className="mt-1 block h-9" value={period.start} onChange={(next) => setPeriod((p) => ({ ...p, start: next }))} />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker className="mt-1 block h-9" value={period.end} onChange={(next) => setPeriod((p) => ({ ...p, end: next }))} />
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
              ["Parts", money(t.total_parts_cents)],
              ["Labor", money(t.total_labor_cents)],
              ["Outsourced", money(t.total_outsourced_cents)],
              ["Grand total", money(t.grand_total_cents)],
              ["Truck count", String(t.truck_count)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-sm border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500">{k}</div>
              <div className="text-lg font-semibold">{v}</div>
            </div>
          ))}
        </div>
      ) : null}

      {query.data ? (
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <ParityTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.unit_id}
            loading={query.isPending || (query.isFetching && rows.length === 0)}
            storageKey="maintenance-cost-per-unit"
            emptyText="No trucks match the current filters for this period."
            exportFilename={`maintenance-cost-per-unit-${applied.start}-${applied.end}`}
            onRowClick={(r) => navigate(`/fleet/units/${r.unit_id}?tab=maintenance`)}
          />

          {pieData.length > 0 ? (
            <div className="h-72 rounded-sm border border-gray-200 bg-white p-2">
              <div className="text-xs font-semibold text-gray-700">By category</div>
              <ResponsiveContainer width="100%" height="90%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => money(Number(value))} />
                  <Legend formatter={(value: string, _entry: unknown, i: number) => `${formatChartLegendLabel(value)} · ${money(pieData[i]?.value ?? 0)}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
