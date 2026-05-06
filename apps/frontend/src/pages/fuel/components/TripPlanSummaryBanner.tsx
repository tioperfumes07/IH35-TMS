import type { ReactNode } from "react";
import type { FuelActiveRoute } from "../../../api/fuelPlanner";

type Props = {
  route: FuelActiveRoute | null;
};

export function TripPlanSummaryBanner({ route }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded border border-green-300 bg-green-50 px-3 py-2 text-xs md:grid-cols-5">
      <Cell label="Total Distance">{route ? `${Number(route.total_distance_miles ?? 0).toFixed(0)} mi` : "—"}</Cell>
      <Cell label="Total Fuel">{route ? `${Number(route.recommended_total_fuel_gallons ?? 0).toFixed(1)} gal` : "—"}</Cell>
      <Cell label="Recommended Cost">{route ? `$${Number(route.recommended_total_cost ?? 0).toFixed(2)}` : "—"}</Cell>
      <Cell label="Station-Average Baseline">{route ? `$${Number(route.station_avg_baseline_cost ?? 0).toFixed(2)}` : "—"}</Cell>
      <Cell label="Savings ⚡" className="text-green-700 font-semibold">
        {route ? `$${Number(route.savings_estimate ?? 0).toFixed(2)} (${Number(route.savings_percent ?? 0).toFixed(1)}%)` : "—"}
      </Cell>
    </div>
  );
}

function Cell({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-gray-600">{label}</div>
      <div className={`text-gray-900 ${className}`}>{children}</div>
    </div>
  );
}
