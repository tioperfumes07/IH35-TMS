import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { Button } from "../Button";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

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

export function TripCostCalculator({
  unitId,
  companyId,
  unitNumber,
}: {
  unitId: string;
  companyId: string;
  unitNumber?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [result, setResult] = useState<TripCostResult | null>(null);
  const [requestError, setRequestError] = useState<unknown>(null);
  const scopeGenerationRef = useRef(0);

  const mutation = useMutation({
    mutationFn: (input: { unitId: string; companyId: string; destination: string; generation: number }) =>
      apiRequest<TripCostResult>(
        `/api/v1/mdata/units/${input.unitId}/trip-cost?operating_company_id=${encodeURIComponent(input.companyId)}`,
        { method: "POST", body: { destination_zip: input.destination } }
      ),
    onMutate: () => setRequestError(null),
    onSuccess: (next, input) => {
      if (input.generation === scopeGenerationRef.current) setResult(next);
    },
    onError: (error, input) => {
      if (input.generation === scopeGenerationRef.current) setRequestError(error);
    },
  });

  useEffect(() => {
    scopeGenerationRef.current += 1;
    mutation.reset();
    setOpen(false);
    setDestination("");
    setResult(null);
    setRequestError(null);
  }, [companyId, unitId]);

  const r = result;
  const destinationValid = destination.trim().length >= 3;

  return (
    <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-3" data-testid="vp-trip-cost">
      <button type="button" className="text-sm font-semibold text-gray-800" onClick={() => setOpen(!open)}>
        Trip cost calculator {open ? "▾" : "▸"}
      </button>
      <p className="mt-1 text-xs text-gray-600">
        Estimate for unit{" "}
        <EntityLinkOrTombstone
          kind="unit"
          id={unitId}
          name={unitNumber}
          noun="Unit"
          className="font-semibold text-slate-700 underline"
          data-testid="vp-trip-cost-unit-link"
        />
        . ZIP-only estimator — not a load quote writer.
      </p>
      {open ? (
        <div className="mt-2 space-y-2">
          <input
            className="w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
            placeholder="Destination ZIP"
            value={destination}
            aria-invalid={destination.length > 0 && !destinationValid}
            aria-describedby="vp-trip-cost-status"
            onChange={(e) => {
              setDestination(e.target.value);
              mutation.reset();
              setResult(null);
              setRequestError(null);
            }}
          />
          <Button
            size="sm"
            loading={mutation.isPending}
            disabled={!destinationValid}
            onClick={() => mutation.mutate({
              unitId,
              companyId,
              destination: destination.trim(),
              generation: scopeGenerationRef.current,
            })}
          >
            Compute
          </Button>
          <div id="vp-trip-cost-status" aria-live="polite">
            {!destinationValid ? (
              <p className="text-xs text-gray-600">Enter a destination ZIP (at least 3 characters) to compute.</p>
            ) : null}
            {requestError ? (
              <p className="text-xs text-red-700" role="alert">
                Couldn&apos;t compute trip cost. {(requestError as Error)?.message ?? "Try again."}
              </p>
            ) : null}
          </div>
          {r ? (
            <div className="text-xs text-gray-700">
              <div>
                Fuel {usd(r.estimated_fuel_cost_cents)} · Driver {usd(r.estimated_driver_pay_cents)} · Maint{" "}
                {usd(r.estimated_maintenance_accrual_cents)}
              </div>
              <div className="font-semibold">Suggested quote floor: {usd(r.suggested_quote_floor_cents)}</div>
              <div className="text-gray-500">{r.estimated_miles} mi estimated</div>
              <p className="mt-1 text-gray-500" data-testid="vp-trip-cost-no-quote-writer">
                Add to quote is not available — this surface does not create or link loads.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
