import type { ReactNode } from "react";
import type { FuelActiveRoute } from "../../../api/fuelPlanner";

type Props = {
  route: FuelActiveRoute | null;
};

export function ActiveTripStrip({ route }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded border border-gray-200 bg-white p-2 text-xs md:grid-cols-3 xl:grid-cols-6">
      <Cell label="Load #">{route?.load_display_id ?? "—"}</Cell>
      <Cell label="Route Summary">{route ? `${Number(route.total_distance_miles ?? 0).toFixed(0)} miles` : "—"}</Cell>
      <Cell label="Unit/Trailer">{route?.unit_display_id ?? "—"}</Cell>
      <Cell label="Current Fuel">{route?.current_fuel_gallons != null ? `${Number(route.current_fuel_gallons).toFixed(1)} gal` : "—"}</Cell>
      <Cell label="Live MPG">{route?.current_mpg != null ? Number(route.current_mpg).toFixed(1) : "—"}</Cell>
      <Cell label="HOS Remaining">Phase 3 stub</Cell>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className="font-semibold text-gray-900">{children}</div>
    </div>
  );
}
