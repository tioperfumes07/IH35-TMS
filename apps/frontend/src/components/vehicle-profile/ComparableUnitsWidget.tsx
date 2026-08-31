import { useState } from "react";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { DataTable, type DataTableColumn } from "../DataTable";

type Comparable = {
  fleet_avg_maintenance_per_mile_cents?: number | null;
  this_unit_maintenance_per_mile_cents?: number | null;
  deviation_pct?: number | null;
  rank_in_fleet?: number | null;
  total_units_in_fleet?: number;
};

function usdPerMile(cents: number | null | undefined) {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}/mi`;
}

type ComparisonRow = {
  key: "maintenance" | "deviation" | "rank";
  metric: string;
  unit: string;
  fleet: string;
};

const comparisonColumns: DataTableColumn<ComparisonRow>[] = [
  { key: "metric", label: "Metric", align: "left" },
  { key: "unit", label: "This unit", align: "right", numeric: true },
  { key: "fleet", label: "Fleet", align: "right", numeric: true },
];

export function ComparableUnitsWidget({
  unitId,
  unitNumber,
  comparable,
}: {
  unitId: string;
  unitNumber: string;
  comparable: Comparable;
}) {
  const [open, setOpen] = useState(false);
  const dev = comparable.deviation_pct ?? 0;
  const showBanner = dev > 15;
  const comparisonRows: ComparisonRow[] = [
    {
      key: "maintenance",
      metric: "Maintenance per mile",
      unit: usdPerMile(comparable.this_unit_maintenance_per_mile_cents),
      fleet: usdPerMile(comparable.fleet_avg_maintenance_per_mile_cents),
    },
    {
      key: "deviation",
      metric: "Difference from fleet",
      unit: comparable.deviation_pct == null ? "—" : `${dev > 0 ? "+" : ""}${dev}%`,
      fleet: "Baseline",
    },
    {
      key: "rank",
      metric: "Fleet rank",
      unit: String(comparable.rank_in_fleet ?? "—"),
      fleet: `of ${comparable.total_units_in_fleet ?? "—"}`,
    },
  ];

  return (
    <div className="mt-3 rounded-sm border border-gray-200 p-3" data-testid="vp-comparable-units">
      {showBanner ? (
        <div className="mb-2 rounded-sm bg-red-50 px-2 py-1 text-xs text-red-800" data-testid="vp-comparable-banner">
          Above-fleet-avg maintenance — review recommended (+{dev}%).
        </div>
      ) : null}
      <p className="text-sm text-gray-800">
        Truck{" "}
        <EntityLinkOrTombstone kind="unit" id={unitId} name={unitNumber} noun="Unit" className="font-medium text-slate-700 hover:underline" />{" "}
        is rank {comparable.rank_in_fleet ?? "—"} of {comparable.total_units_in_fleet ?? "—"} in fleet.
      </p>
      <p className="text-xs text-gray-600">
        Maintenance per mile: {usdPerMile(comparable.this_unit_maintenance_per_mile_cents)} (fleet avg:{" "}
        {usdPerMile(comparable.fleet_avg_maintenance_per_mile_cents)}
        {dev !== 0 ? `, ${dev > 0 ? "+" : ""}${dev}%` : ""})
      </p>
      <button
        type="button"
        className="mt-2 text-xs text-slate-700 underline"
        aria-expanded={open}
        aria-controls="fleet-unit-comparison-detail"
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide detailed comparison" : "View detailed comparison"}
      </button>
      {open ? (
        <div
          id="fleet-unit-comparison-detail"
          role="region"
          aria-label={`Fleet comparison for unit ${unitNumber}`}
          className="mt-2 overflow-hidden"
        >
          <DataTable
            columns={comparisonColumns}
            rows={comparisonRows}
            rowKey={(row) => row.key}
            hideToolbar
            hidePager
          />
        </div>
      ) : null}
    </div>
  );
}
