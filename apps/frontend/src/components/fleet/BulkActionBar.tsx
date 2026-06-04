import { useMemo, useState } from "react";

export const FLEET_BULK_STATUS_OPTIONS = ["Active", "Sold", "Transferred", "Damaged", "OOS"] as const;

export const TRAILER_EQUIPMENT_TYPE_OPTIONS = [
  "DryVan",
  "Reefer",
  "Flatbed",
  "Tanker",
  "Container",
  "Chassis",
  "StepDeck",
  "Lowboy",
  "Conestoga",
  "RGN",
  "Other",
] as const;

export type FleetBulkStatus = (typeof FLEET_BULK_STATUS_OPTIONS)[number];

export type BulkApplyPayload = {
  status?: FleetBulkStatus;
  vehicle_type?: string;
  equipment_type?: (typeof TRAILER_EQUIPMENT_TYPE_OPTIONS)[number];
};

type FleetBulkControlsProps = {
  vehicleTypes: string[];
  showTrailerTypeCatalog?: boolean;
  onApply: (payload: BulkApplyPayload) => void | Promise<void>;
  applying?: boolean;
};

/** Fleet-specific status/type dropdowns — rendered inside shared BulkActionBar children slot. */
export function FleetBulkControls({
  vehicleTypes,
  showTrailerTypeCatalog = false,
  onApply,
  applying = false,
}: FleetBulkControlsProps) {
  const [status, setStatus] = useState<FleetBulkStatus | "">("");
  const [vehicleType, setVehicleType] = useState("");
  const [trailerType, setTrailerType] = useState<(typeof TRAILER_EQUIPMENT_TYPE_OPTIONS)[number] | "">("");

  const typeOptions = useMemo(
    () => vehicleTypes.filter((value) => value.trim().length > 0).sort((a, b) => a.localeCompare(b)),
    [vehicleTypes]
  );

  return (
    <>
      <label className="flex items-center gap-1">
        <span className="text-blue-800">Change Status</span>
        <select
          className="h-7 rounded border border-gray-300 bg-white px-1 text-xs"
          aria-label="Change Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as FleetBulkStatus | "")}
        >
          <option value="">—</option>
          {FLEET_BULK_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <span className="text-blue-800">Change Type</span>
        <select
          className="h-7 rounded border border-gray-300 bg-white px-1 text-xs"
          aria-label="Change Type"
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value)}
        >
          <option value="">—</option>
          {typeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {showTrailerTypeCatalog ? (
        <label className="flex items-center gap-1">
          <span className="text-blue-800">Trailer TYPE</span>
          <select
            className="h-7 rounded border border-gray-300 bg-white px-1 text-xs"
            aria-label="Trailer TYPE"
            value={trailerType}
            onChange={(e) => setTrailerType(e.target.value as (typeof TRAILER_EQUIPMENT_TYPE_OPTIONS)[number] | "")}
          >
            <option value="">—</option>
            {TRAILER_EQUIPMENT_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button
        type="button"
        className="rounded border border-blue-300 bg-white px-2 py-1 text-xs font-semibold text-blue-800 disabled:opacity-50"
        disabled={applying || (!status && !vehicleType && !trailerType)}
        onClick={() => {
          const payload: BulkApplyPayload = {};
          if (status) payload.status = status;
          if (vehicleType) payload.vehicle_type = vehicleType;
          if (trailerType) payload.equipment_type = trailerType;
          void onApply(payload);
        }}
      >
        Apply
      </button>
    </>
  );
}

type LegacyProps = {
  selectedCount: number;
  vehicleTypes: string[];
  onApply: (payload: BulkApplyPayload) => void | Promise<void>;
  onClear: () => void;
  applying?: boolean;
};

/** @deprecated Use shared BulkActionBar + FleetBulkControls in FleetTable. Kept for existing tests. */
export function BulkActionBar({ selectedCount, vehicleTypes, onApply, onClear, applying = false }: LegacyProps) {
  if (selectedCount <= 0) {
    return null;
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs">
      <span className="font-semibold text-blue-900">Selected: {selectedCount} units</span>
      <FleetBulkControls vehicleTypes={vehicleTypes} onApply={onApply} applying={applying} />
      <button type="button" className="text-blue-700 underline" onClick={onClear}>
        Clear selection
      </button>
    </div>
  );
}
