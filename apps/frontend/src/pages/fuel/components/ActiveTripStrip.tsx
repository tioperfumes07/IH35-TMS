import type { ReactNode } from "react";
import type { FuelActiveRoute } from "../../../api/fuelPlanner";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";

type Props = {
  route: FuelActiveRoute | null;
};

export function ActiveTripStrip({ route }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-sm border border-gray-200 bg-white p-2 text-xs md:grid-cols-3 xl:grid-cols-6">
      <Cell label="Load #">
        <EntityLink
          kind="load"
          id={route?.load_id ?? undefined}
          label={entityLabel(route?.load_display_id, route?.load_id, "Load") ?? "—"}
          data-testid="fuel-planner-load-link"
        />
      </Cell>
      <Cell label="Unit / Driver">
        {route ? (
          <span className="inline-flex flex-wrap items-center gap-1">
            <EntityLink
              kind="unit"
              id={route.unit_id}
              label={entityLabel(route.unit_display_id, route.unit_id, "Unit") ?? "—"}
              data-testid="fuel-planner-unit-link"
            />
            <span className="font-normal text-gray-400">/</span>
            <EntityLink
              kind="driver"
              id={route.driver_id}
              label={entityLabel(route.driver_full_name || route.driver_display_id, route.driver_id, "Driver") ?? "—"}
              data-testid="fuel-planner-driver-link"
            />
          </span>
        ) : (
          "—"
        )}
      </Cell>
      <Cell label="Route">{route?.total_distance_miles != null ? `${Number(route.total_distance_miles).toFixed(0)} practical mi` : "—"}</Cell>
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
