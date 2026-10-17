// TABLE_DATE_OMIT: this table has no date column by design — three fixed metric rows (maintenance per mile, difference from fleet, fleet rank), a current-state comparison, not a time series.
import { useState } from "react";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";

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

// A fixed 3-row metric comparison (maintenance/deviation/rank), not a record list. Headers keep the
// app-wide sortable default (owner 2026-09-03 — every column header sorts, GLOBAL-TYPE-SIZE-BASELINE).
const comparisonColumns: ParityColumn<ComparisonRow>[] = [
  { key: "metric", label: "Metric", sortable: true, cellClass: "text-left", alwaysVisible: true },
  { key: "unit", label: "This unit", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
  { key: "fleet", label: "Fleet", sortable: true, kind: "number", cellClass: "text-right tabular-nums" },
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
      <p className="text-xs text-gray-800">
        Truck{" "}
        <EntityLinkOrTombstone kind="unit" id={unitId} name={unitNumber} noun="Unit" className="font-medium text-[#1F2A44] hover:underline" />{" "}
        is rank {comparable.rank_in_fleet ?? "—"} of {comparable.total_units_in_fleet ?? "—"} in fleet.
      </p>
      <p className="text-xs text-gray-600">
        Maintenance per mile: {usdPerMile(comparable.this_unit_maintenance_per_mile_cents)} (fleet avg:{" "}
        {usdPerMile(comparable.fleet_avg_maintenance_per_mile_cents)}
        {dev !== 0 ? `, ${dev > 0 ? "+" : ""}${dev}%` : ""})
      </p>
      <button
        type="button"
        className="mt-2 text-xs text-[#1F2A44] underline"
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
          <ParityTable
            storageKey="vehicle-fleet-unit-comparison"
            columns={comparisonColumns}
            rows={comparisonRows}
            rowKey={(row) => row.key}
            suppressToolbarSearch
            suppressToolbarRange
            hidePager
            pageSize={comparisonRows.length}
          />
        </div>
      ) : null}
    </div>
  );
}
