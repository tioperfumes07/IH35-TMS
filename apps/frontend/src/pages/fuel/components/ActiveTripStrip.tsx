import type { ReactNode } from "react";
import type { FuelActiveRoute } from "../../../api/fuelPlanner";

type Props = {
  route: FuelActiveRoute | null;
};

export function ActiveTripStrip({ route }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded border border-gray-200 bg-white p-2 text-xs md:grid-cols-3 xl:grid-cols-6">
      <Cell label="Load #">{route?.load_display_id ?? "—"}</Cell>
      <Cell label="Unit / Driver">{route?.unit_display_id ?? "—"}</Cell>
      <Cell label="Route">{route ? `${Number(route.total_distance_miles ?? 0).toFixed(0)} practical mi` : "—"}</Cell>
      <Cell label="Tank now">{route?.current_fuel_gallons != null ? `${Number(route.current_fuel_gallons).toFixed(1)} gal` : "—"}</Cell>
      <Cell label="MPG">{route?.current_mpg != null ? Number(route.current_mpg).toFixed(1) : "—"}</Cell>
      <Cell label="HOS left / Driving shift">{route ? `Updated ${new Date(route.computed_at).toLocaleTimeString()}` : "—"}</Cell>
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
