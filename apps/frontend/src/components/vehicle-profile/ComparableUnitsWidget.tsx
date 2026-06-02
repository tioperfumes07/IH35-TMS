import { useState } from "react";

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

export function ComparableUnitsWidget({ unitNumber, comparable }: { unitNumber: string; comparable: Comparable }) {
  const [open, setOpen] = useState(false);
  const dev = comparable.deviation_pct ?? 0;
  const showBanner = dev > 15;

  return (
    <div className="mt-3 rounded border border-gray-200 p-3" data-testid="vp-comparable-units">
      {showBanner ? (
        <div className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800" data-testid="vp-comparable-banner">
          Above-fleet-avg maintenance — review recommended (+{dev}%).
        </div>
      ) : null}
      <p className="text-sm text-gray-800">
        Truck {unitNumber} is rank {comparable.rank_in_fleet ?? "—"} of {comparable.total_units_in_fleet ?? "—"} in fleet.
      </p>
      <p className="text-xs text-gray-600">
        Maintenance per mile: {usdPerMile(comparable.this_unit_maintenance_per_mile_cents)} (fleet avg:{" "}
        {usdPerMile(comparable.fleet_avg_maintenance_per_mile_cents)}
        {dev !== 0 ? `, ${dev > 0 ? "+" : ""}${dev}%` : ""})
      </p>
      <button type="button" className="mt-2 text-xs text-blue-700 underline" onClick={() => setOpen(!open)}>
        View detailed comparison
      </button>
      {open ? (
        <p className="mt-2 text-xs text-gray-500">Fleet comparison table (modal V1 placeholder).</p>
      ) : null}
    </div>
  );
}
