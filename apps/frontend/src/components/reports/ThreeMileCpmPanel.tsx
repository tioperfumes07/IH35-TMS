import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getThreeMileCpm, type ThreeMileBasisFigure, type ThreeMileGroupBy, type ThreeMileMpg, type ThreeMileRow } from "../../api/reports-three-mile";
import { companyToday } from "../../lib/businessDate";
import { formatNumberTable, formatUsdCentsTable } from "../../lib/money";
import { DatePicker } from "../forms/DatePicker";
import { SegmentedControl } from "../SegmentedControl";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { EntityLink } from "../shared/EntityLink";

/**
 * ORDER-2026-09-04 three-mile cost per mile: one direct cost (canonical per-load cost rollup) divided by three
 * NAMED mileages -- practical (billed), short (paid), real driven (odometer). A basis no load in the group has
 * shows "—" with the reason; it is never filled from another basis.
 */
const BASIS_SHORT = { real_driven: "Real driven", practical: "Practical (billed)", short: "Short (paid)" } as const;
const GROUPS: Array<{ value: ThreeMileGroupBy; label: string }> = [
  { value: "unit", label: "Truck" },
  { value: "driver", label: "Driver" },
  { value: "lane", label: "Lane" },
  { value: "load", label: "Load" },
];

function daysAgo(n: number): string {
  return companyToday(new Date(Date.now() - n * 86_400_000));
}
function cpmText(c: ThreeMileBasisFigure | undefined): string {
  return !c || c.cents_per_mile == null ? "—" : `$${(c.cents_per_mile / 100).toFixed(3)}/mi`;
}
function mpgText(m: ThreeMileMpg | undefined): string {
  return !m || m.mpg == null ? "—" : `${m.mpg.toFixed(2)} mpg`;
}

function groupCell(r: ThreeMileRow) {
  if (r.group === "unit" && r.ref_id) return <EntityLink kind="unit" id={r.ref_id} label={r.label} className="font-semibold underline" />;
  if (r.group === "driver" && r.ref_id) return <EntityLink kind="driver" id={r.ref_id} label={r.label} className="font-semibold underline" />;
  if (r.group === "load" && r.ref_id) return <EntityLink kind="load" id={r.ref_id} label={r.label} className="font-semibold underline" />;
  return <span className="font-semibold">{r.label}</span>;
}

export function ThreeMileCpmPanel({ operatingCompanyId }: { operatingCompanyId: string }) {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(companyToday());
  const [groupBy, setGroupBy] = useState<ThreeMileGroupBy>("unit");
  const query = useQuery({
    queryKey: ["reports", "three-mile-cpm", operatingCompanyId, from, to, groupBy],
    queryFn: () => getThreeMileCpm(operatingCompanyId, { from, to, group_by: groupBy }),
    enabled: Boolean(operatingCompanyId && from && to && from <= to),
  });
  const fleet = query.data?.fleet;

  const columns = useMemo<ParityColumn<ThreeMileRow>[]>(
    () => [
      { key: "label", label: GROUPS.find((g) => g.value === groupBy)?.label ?? "Group", alwaysVisible: true, render: groupCell },
      { key: "loads", label: "Loads delivered", sortValue: (r) => r.loads, render: (r) => String(r.loads) },
      { key: "direct_cost_cents", label: "Direct cost", sortValue: (r) => r.direct_cost_cents, render: (r) => formatUsdCentsTable(r.direct_cost_cents) },
      ...(["real_driven", "practical", "short"] as const).map((b, i) => ({
        key: `cpm_${b}`,
        label: `CPM · ${BASIS_SHORT[b]}`,
        sortValue: (r: ThreeMileRow) => r.cpm[i]?.cents_per_mile ?? null,
        render: (r: ThreeMileRow) => {
          const c = r.cpm[i];
          const title = c?.reason ?? (c ? `${c.basis_label} — ${formatNumberTable(c.miles ?? 0, 1)} mi over ${c.loads_included} load(s)` : undefined);
          return <span title={title}>{cpmText(c)}</span>;
        },
      })),
      { key: "mpg_real", label: "MPG · Real driven", render: (r) => <span title={r.mpg[0]?.reason ?? undefined}>{mpgText(r.mpg[0])}</span> },
      { key: "mpg_practical", label: "MPG · Practical", render: (r) => <span title={r.mpg[1]?.reason ?? undefined}>{mpgText(r.mpg[1])}</span> },
      {
        key: "real_minus_practical_miles",
        label: "Driven − billed",
        sortValue: (r) => r.real_minus_practical_miles,
        render: (r) => (r.real_minus_practical_miles == null ? "—" : `${formatNumberTable(r.real_minus_practical_miles, 1)} mi`),
      },
    ],
    [groupBy]
  );

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="three-mile-cpm-panel">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-900">Three-mile cost per mile — billed vs paid vs really driven</h3>
        <div className="flex flex-wrap items-end gap-2 text-xs text-gray-600">
          <SegmentedControl value={groupBy} options={GROUPS} onChange={setGroupBy} testId="three-mile-group-by" />
          <label className="flex flex-col gap-1">From<DatePicker value={from} onChange={setFrom} /></label>
          <label className="flex flex-col gap-1">To<DatePicker value={to} onChange={setTo} /></label>
        </div>
      </div>
      {fleet ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5" data-testid="three-mile-fleet">
          {fleet.cpm.map((c) => (
            <div key={c.basis} className="rounded-sm border border-gray-200 p-2">
              <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">Fleet CPM · {BASIS_SHORT[c.basis]}</div>
              <div className="text-xs font-semibold text-slate-900">{cpmText(c)}</div>
              <div className="text-section-header text-gray-500">
                {c.cents_per_mile != null ? `${formatNumberTable(c.miles ?? 0, 1)} mi · ${c.loads_included} loads (${c.loads_excluded} without this basis)` : c.reason}
              </div>
            </div>
          ))}
          {fleet.mpg.map((m) => (
            <div key={m.basis} className="rounded-sm border border-gray-200 p-2">
              <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">Fleet MPG · {BASIS_SHORT[m.basis]}</div>
              <div className="text-xs font-semibold text-slate-900">{mpgText(m)}</div>
              <div className="text-section-header text-gray-500">{m.mpg != null ? `${formatNumberTable(m.miles ?? 0, 1)} mi / ${formatNumberTable(m.gallons ?? 0, 1)} gal diesel` : m.reason}</div>
            </div>
          ))}
        </div>
      ) : null}
      {query.data ? <p className="text-section-header text-gray-500">Direct cost: {query.data.cost_source}.</p> : null}
      {query.isError ? (
        <ListErrorState status={0} message="Could not load the three-mile cost per mile." onRetry={() => void query.refetch()} />
      ) : (
        <ParityTable
          embedded
          rows={query.data?.rows ?? []}
          columns={columns}
          rowKey={(r) => r.key}
          loading={query.isLoading}
          storageKey={`three-mile-cpm-${groupBy}`}
          exportFilename={`three-mile-cpm-${groupBy}`}
          tableTestId="three-mile-cpm-table"
          emptyText="No loads delivered in this period."
        />
      )}
    </section>
  );
}
