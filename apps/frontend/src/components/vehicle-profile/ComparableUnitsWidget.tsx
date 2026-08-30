import { useState } from "react";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

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
          {/* MOBILE-RESPONSIVE-AUDIT: overflow-x-auto lets this table scroll horizontally on a
              narrow viewport instead of clipping under the parent's overflow-hidden (border-radius
              clip) — no visual change at normal widths, defensive on a 375px mobile viewport. */}
          <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-2 py-1.5 font-medium">Metric</th>
                <th className="px-2 py-1.5 text-right font-medium">This unit</th>
                <th className="px-2 py-1.5 text-right font-medium">Fleet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-800">
              <tr>
                <td className="px-2 py-1.5">Maintenance per mile</td>
                <td className="px-2 py-1.5 text-right">{usdPerMile(comparable.this_unit_maintenance_per_mile_cents)}</td>
                <td className="px-2 py-1.5 text-right">{usdPerMile(comparable.fleet_avg_maintenance_per_mile_cents)}</td>
              </tr>
              <tr>
                <td className="px-2 py-1.5">Difference from fleet</td>
                <td className="px-2 py-1.5 text-right">{comparable.deviation_pct == null ? "—" : `${dev > 0 ? "+" : ""}${dev}%`}</td>
                <td className="px-2 py-1.5 text-right">Baseline</td>
              </tr>
              <tr>
                <td className="px-2 py-1.5">Fleet rank</td>
                <td className="px-2 py-1.5 text-right">{comparable.rank_in_fleet ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">of {comparable.total_units_in_fleet ?? "—"}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
