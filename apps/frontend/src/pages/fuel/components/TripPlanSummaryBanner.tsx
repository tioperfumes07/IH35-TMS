import type { ReactNode } from "react";
import type { FuelActiveRoute } from "../../../api/fuelPlanner";

type Props = {
  route: FuelActiveRoute | null;
};

export function TripPlanSummaryBanner({ route }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-sm border border-slate-300 bg-slate-100 px-3 py-2 text-xs md:grid-cols-6">
      <Cell label="Total miles">{route?.total_distance_miles != null ? `${Number(route.total_distance_miles).toFixed(0)} mi` : "—"}</Cell>
      <Cell label="Gallons needed">{route?.recommended_total_fuel_gallons != null ? `${Number(route.recommended_total_fuel_gallons).toFixed(1)} gal` : "—"}</Cell>
      <Cell label="Fuel stops">{route ? "Calculated" : "—"}</Cell>
      {/* FUEL-MONEY-F7387B: recommended_total_cost/station_avg_baseline_cost/savings_estimate and
          recommended_total_fuel_gallons are all independently nullable on the SQL view. An average
          formula needs BOTH the numerator and a real, positive gallons denominator to mean
          anything -- coercing either to 0/1 invents a plausible-looking dollar figure for a route
          with genuinely unknown economics. Preserve unknown as "—", exactly like the sibling
          miles/gallons cells above, and only ever divide when gallons is a real positive number. */}
      <Cell label="Avg recommended $">
        {route && route.recommended_total_cost != null && Number(route.recommended_total_fuel_gallons) > 0
          ? `$${(Number(route.recommended_total_cost) / Number(route.recommended_total_fuel_gallons)).toFixed(2)}`
          : "—"}
      </Cell>
      <Cell label="Avg pump price">
        {route && route.station_avg_baseline_cost != null && Number(route.recommended_total_fuel_gallons) > 0
          ? `$${(Number(route.station_avg_baseline_cost) / Number(route.recommended_total_fuel_gallons)).toFixed(2)}`
          : "—"}
      </Cell>
      <Cell label="Trip fuel cost">
        {route && route.recommended_total_cost != null ? `$${Number(route.recommended_total_cost).toFixed(2)}` : "—"}
      </Cell>
      <Cell label="Savings vs avg" className="text-green-700 font-semibold">
        {route && route.savings_estimate != null ? `$${Number(route.savings_estimate).toFixed(2)}` : "—"}
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
