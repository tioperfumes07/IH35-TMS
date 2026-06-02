import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { Button } from "../Button";

type TripCostResult = {
  estimated_fuel_cost_cents: number;
  estimated_driver_pay_cents: number;
  estimated_maintenance_accrual_cents: number;
  total_estimated_cost_cents: number;
  suggested_quote_floor_cents: number;
  estimated_miles: number;
};

function usd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function TripCostCalculator({ unitId, companyId }: { unitId: string; companyId: string }) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest<TripCostResult>(
        `/api/v1/mdata/units/${unitId}/trip-cost?operating_company_id=${encodeURIComponent(companyId)}`,
        { method: "POST", body: { destination_zip: destination } }
      ),
  });

  const r = mutation.data;

  return (
    <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-3" data-testid="vp-trip-cost">
      <button type="button" className="text-sm font-semibold text-gray-800" onClick={() => setOpen(!open)}>
        Trip cost calculator {open ? "▾" : "▸"}
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          <input
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder="Destination ZIP"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
          <Button size="sm" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Compute
          </Button>
          {r ? (
            <div className="text-xs text-gray-700">
              <div>Fuel {usd(r.estimated_fuel_cost_cents)} · Driver {usd(r.estimated_driver_pay_cents)} · Maint{" "}
                {usd(r.estimated_maintenance_accrual_cents)}</div>
              <div className="font-semibold">Suggested quote floor: {usd(r.suggested_quote_floor_cents)}</div>
              <div className="text-gray-500">{r.estimated_miles} mi estimated</div>
              <Button size="sm" className="mt-1" disabled title="V1 no-op">
                + Add to Quote
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
