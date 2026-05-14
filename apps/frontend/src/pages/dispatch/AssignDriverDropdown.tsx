import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useId } from "react";
import { getDispatchAvailableDrivers, type AvailableDriverRow } from "../../api/dispatch";

export type AssignDriverDropdownProps = {
  loadId: string;
  operatingCompanyId: string;
  value: string;
  onChange: (driverId: string) => void;
  forPickupAt?: string;
  disabled?: boolean;
  /** When set (e.g. in tests), skips network fetch. */
  driversOverride?: AvailableDriverRow[];
};

export const REASSIGN_REASON_CODES = [
  { value: "driver_request", label: "Driver request" },
  { value: "breakdown", label: "Breakdown / equipment" },
  { value: "hos_reset", label: "HOS / reset" },
  { value: "customer_change", label: "Customer / shipper change" },
  { value: "other", label: "Other" },
] as const;

export function AssignDriverDropdown({
  loadId,
  operatingCompanyId,
  value,
  onChange,
  forPickupAt,
  disabled,
  driversOverride,
}: AssignDriverDropdownProps) {
  const q = useQuery({
    queryKey: ["dispatch", "available-drivers", loadId, operatingCompanyId, forPickupAt ?? ""],
    queryFn: () =>
      getDispatchAvailableDrivers({
        operating_company_id: operatingCompanyId,
        load_id: loadId,
        for_pickup_at: forPickupAt,
      }),
    enabled: Boolean(loadId && operatingCompanyId && driversOverride == null),
  });

  const drivers = driversOverride ?? q.data?.drivers ?? [];
  const sorted = useMemo(() => {
    const copy = [...drivers];
    copy.sort((a, b) => {
      if (a.hos_safe !== b.hos_safe) return a.hos_safe ? -1 : 1;
      return a.distance_to_pickup_miles - b.distance_to_pickup_miles;
    });
    return copy;
  }, [drivers]);

  const [pendingUnsafe, setPendingUnsafe] = useState<AvailableDriverRow | null>(null);
  const selectId = useId();

  const onSelectId = (id: string) => {
    const row = sorted.find((d) => d.driver_id === id);
    if (!row) {
      onChange(id);
      return;
    }
    if (!row.hos_safe) {
      setPendingUnsafe(row);
      return;
    }
    onChange(id);
  };

  return (
    <div className="space-y-1">
      <label htmlFor={selectId} className="text-xs font-semibold text-gray-600">
        Driver
      </label>
      <select
        id={selectId}
        className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
        value={value}
        disabled={disabled || (!driversOverride && q.isLoading)}
        onChange={(e) => onSelectId(e.target.value)}
      >
        <option value="">{q.isLoading ? "Loading…" : "Select driver"}</option>
        {sorted.map((d) => (
          <option
            key={d.driver_id}
            value={d.driver_id}
            disabled={false}
            className={d.hos_safe ? undefined : "text-gray-400"}
            title={d.hos_safe ? undefined : "Out of hours today"}
          >
            {d.display_name}
            {!d.hos_safe ? " — out of HOS" : ""}
          </option>
        ))}
      </select>
      {pendingUnsafe ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="font-semibold">Driver is out of hours today</p>
          <p className="mt-1">{pendingUnsafe.display_name} may not have enough on-duty time for this pickup.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded bg-amber-700 px-2 py-1 text-white"
              onClick={() => {
                onChange(pendingUnsafe.driver_id);
                setPendingUnsafe(null);
              }}
            >
              Assign anyway
            </button>
            <button type="button" className="rounded border border-amber-600 px-2 py-1" onClick={() => setPendingUnsafe(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
