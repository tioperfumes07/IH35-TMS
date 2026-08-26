import { useMemo, useState } from "react";
import { Combobox } from "../Combobox";

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
      <div className="flex items-center gap-1">
        <label htmlFor="fleet-bulk-status" className="text-slate-700">Change Status</label>
        <Combobox
          id="fleet-bulk-status"
          className="w-36"
          options={FLEET_BULK_STATUS_OPTIONS.map((option) => ({ value: option, label: option }))}
          value={status || null}
          onChange={(next) => setStatus((next ?? "") as FleetBulkStatus | "")}
          placeholder="Select status"
          allowClear
        />
      </div>
      <div className="flex items-center gap-1">
        <label htmlFor="fleet-bulk-vehicle-type" className="text-slate-700">Change Type</label>
        <Combobox
          id="fleet-bulk-vehicle-type"
          className="w-36"
          options={typeOptions.map((option) => ({ value: option, label: option }))}
          value={vehicleType || null}
          onChange={(next) => setVehicleType(next ?? "")}
          placeholder="Select type"
          allowClear
        />
      </div>
      {showTrailerTypeCatalog ? (
        <div className="flex items-center gap-1">
          <label htmlFor="fleet-bulk-trailer-type" className="text-slate-700">Trailer Type</label>
          <Combobox
            id="fleet-bulk-trailer-type"
            className="w-36"
            options={TRAILER_EQUIPMENT_TYPE_OPTIONS.map((option) => ({
              value: option,
              label: option === "DryVan" ? "Dry Van" : option === "StepDeck" ? "Step Deck" : option,
            }))}
            value={trailerType || null}
            onChange={(next) => setTrailerType((next ?? "") as (typeof TRAILER_EQUIPMENT_TYPE_OPTIONS)[number] | "")}
            placeholder="Select trailer type"
            allowClear
          />
        </div>
      ) : null}
      <button
        type="button"
        className="rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
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
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-sm border border-slate-300 bg-slate-100 p-2 text-xs">
      <span className="font-semibold text-slate-700">Selected: {selectedCount} units</span>
      <FleetBulkControls vehicleTypes={vehicleTypes} onApply={onApply} applying={applying} />
      <button type="button" className="text-slate-700 underline" onClick={onClear}>
        Clear selection
      </button>
    </div>
  );
}
