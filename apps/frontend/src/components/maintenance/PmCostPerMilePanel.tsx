import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPmCostPerMile, type PmCostPerMileUnitRow, type PmCpm } from "../../api/maintenance";
import { companyToday } from "../../lib/businessDate";
import { formatNumberTable, formatUsdCentsTable } from "../../lib/money";
import { formatDateTimeUS } from "../../lib/formatDate";
import { DatePicker } from "../forms/DatePicker";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { EntityLink } from "../shared/EntityLink";

/**
 * E-15 PM cost per mile. Real driven miles (odometer) are the true basis; practical (billed) and short (paid)
 * sit beside it for the three-mile comparison. Every figure names the mileage it divides by; a missing real
 * mileage shows "—" with the reason, never a number borrowed from another basis.
 */
const BASIS_SHORT: Record<PmCpm["basis"], string> = { real_driven: "Real driven", practical: "Practical (billed)", short: "Short (paid)" };

function daysAgo(n: number): string {
  return companyToday(new Date(Date.now() - n * 86_400_000));
}

function cpmText(c: PmCpm | undefined): string {
  if (!c || c.cents_per_mile == null) return "—";
  return `$${(c.cents_per_mile / 100).toFixed(3)}/mi`;
}

export function PmCostPerMilePanel({ operatingCompanyId, unitId }: { operatingCompanyId: string; unitId?: string }) {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(companyToday());
  const query = useQuery({
    queryKey: ["maintenance", "pm-cost-per-mile", operatingCompanyId, unitId ?? null, from, to],
    queryFn: () => getPmCostPerMile(operatingCompanyId, { from, to, unit_id: unitId }),
    enabled: Boolean(operatingCompanyId && from && to && from <= to),
  });
  const rows = query.data?.units ?? [];
  const fleet = query.data?.fleet;

  const columns = useMemo<ParityColumn<PmCostPerMileUnitRow>[]>(
    () => [
      {
        key: "unit_number",
        label: "Unit",
        alwaysVisible: true,
        render: (r) => <EntityLink kind="unit" id={r.unit_id} label={r.unit_number} className="font-semibold underline" />,
      },
      {
        key: "real_driven_miles",
        label: "Real driven mi",
        sortValue: (r) => r.real_driven_miles,
        render: (r) =>
          r.real_driven_miles != null ? (
            <span title={`${r.odometer_start_anchor ? formatDateTimeUS(r.odometer_start_anchor.read_at) : ""} → ${r.odometer_end_anchor ? formatDateTimeUS(r.odometer_end_anchor.read_at) : ""}`}>
              {formatNumberTable(r.real_driven_miles, 1)}
            </span>
          ) : (
            <span className="text-gray-500" title={r.real_driven_reason ?? undefined}>— <span className="text-section-header">{r.real_driven_reason}</span></span>
          ),
      },
      { key: "practical_miles", label: "Practical mi (billed)", sortable: true, sortValue: (r) => r.practical_miles, render: (r) => formatNumberTable(r.practical_miles, 1) },
      { key: "short_miles", label: "Short mi (paid)", sortable: true, sortValue: (r) => r.short_miles, render: (r) => formatNumberTable(r.short_miles, 1) },
      { key: "loads_in_period", label: "Loads delivered", sortable: true, sortValue: (r) => r.loads_in_period, render: (r) => String(r.loads_in_period) },
      { key: "pm_cost_cents", label: "PM cost", sortable: true, sortValue: (r) => r.pm_cost_cents, render: (r) => formatUsdCentsTable(r.pm_cost_cents) },
      { key: "maintenance_cost_cents", label: "Maintenance cost", sortable: true, sortValue: (r) => r.maintenance_cost_cents, render: (r) => formatUsdCentsTable(r.maintenance_cost_cents) },
      ...(["real_driven", "practical", "short"] as const).map((b, i) => ({
        key: `cpm_${b}`,
        label: `CPM · ${BASIS_SHORT[b]}`,
        sortValue: (r: PmCostPerMileUnitRow) => r.maintenance_cpm[i]?.cents_per_mile ?? null,
        render: (r: PmCostPerMileUnitRow) => (
          <span title={r.maintenance_cpm[i]?.reason ?? r.maintenance_cpm[i]?.basis_label}>{cpmText(r.maintenance_cpm[i])}</span>
        ),
      })),
      {
        key: "work_order_ids",
        label: "Work orders",
        render: (r) =>
          r.work_order_ids.length ? (
            <span className="flex flex-wrap gap-1">
              {r.work_order_ids.map((id, n) => <EntityLink key={id} kind="work_order" id={id} label={`WO ${n + 1}`} className="underline" />)}
            </span>
          ) : "—",
      },
      {
        key: "bill_ids",
        label: "Bills",
        render: (r) =>
          r.bill_ids.length ? (
            <span className="flex flex-wrap gap-1">
              {r.bill_ids.map((id, n) => <EntityLink key={id} kind="bill" id={id} label={`Bill ${n + 1}`} className="underline" />)}
            </span>
          ) : "—",
      },
    ],
    []
  );

  const realFleet = fleet?.maintenance_cpm?.[0];
  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="pm-cost-per-mile-panel">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-900">PM cost per mile — real driven miles</h3>
        <div className="flex items-end gap-2 text-xs text-gray-600">
          <label className="flex flex-col gap-1">From<DatePicker value={from} onChange={setFrom} /></label>
          <label className="flex flex-col gap-1">To<DatePicker value={to} onChange={setTo} /></label>
        </div>
      </div>
      {!unitId && fleet?.maintenance_cpm ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4" data-testid="pm-cpm-fleet">
          {fleet.maintenance_cpm.map((c) => (
            <div key={c.basis} className="border-b border-gray-200 p-2">
              <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">Fleet CPM · {BASIS_SHORT[c.basis]}</div>
              <div className="text-xs font-semibold text-slate-900">{cpmText(c)}</div>
              <div className="text-section-header text-gray-500">
                {c.cents_per_mile != null ? `${formatNumberTable(c.miles, 1)} mi · ${c.units_included} units (${c.units_excluded} without this basis)` : c.reason}
              </div>
            </div>
          ))}
          <div className="border-b border-gray-200 p-2">
            <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">Driven − paid (unbilled, unpaid)</div>
            <div className="text-xs font-semibold text-slate-900">{fleet.real_minus_short_miles != null ? `${formatNumberTable(fleet.real_minus_short_miles, 1)} mi` : "—"}</div>
            <div className="text-section-header text-gray-500">{fleet.real_minus_short_miles != null ? "units with both bases" : "no unit has both real and short miles"}</div>
          </div>
        </div>
      ) : null}
      {realFleet && realFleet.cents_per_mile == null && !unitId ? (
        <p className="text-xs text-gray-600">Real-driven CPM not measurable for this period: {realFleet.reason}</p>
      ) : null}
      {query.isError ? (
        <ListErrorState status={0} message="Could not load PM cost per mile." onRetry={() => void query.refetch()} />
      ) : (
        <ParityTable
          embedded
          rows={rows}
          columns={columns}
          rowKey={(r) => r.unit_id}
          loading={query.isLoading}
          storageKey={unitId ? "unit-pm-cost-per-mile" : "maintenance-pm-cost-per-mile"}
          exportFilename="pm-cost-per-mile"
          tableTestId="pm-cost-per-mile-table"
          emptyText="No active units for this entity."
        />
      )}
    </section>
  );
}
