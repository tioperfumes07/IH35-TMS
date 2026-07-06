import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDrivers, listUnits } from "../../../api/mdata";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  loadNumber: string;
  hardWarnings: string[];
  onClose: () => void;
  onSubmit: (payload: {
    driver_id: string;
    unit_id?: string;
    trailer_id?: string;
    acknowledged_warnings: string[];
  }) => Promise<void>;
};

function fleetLabel(row: Record<string, unknown>): string {
  const number = [row.unit_number, row.equipment_number, row.trailer_number].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  const make = typeof row.make === "string" ? row.make : "";
  const model = typeof row.model === "string" ? row.model : "";
  return [number, [make, model].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || String(row.id ?? "");
}

export function QuickAssignModal({ open, operatingCompanyId, loadNumber, hardWarnings, onClose, onSubmit }: Props) {
  const [driverId, setDriverId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [trailerId, setTrailerId] = useState("");
  const [ackAll, setAckAll] = useState(false);
  const [loading, setLoading] = useState(false);

  // THE Quick Assign driver picker. status:Active + limit:200 = the COMPLETE active set (see
  // BookLoadEquipmentSection — endpoint default limit=50 silently truncates the roster).
  const driversQuery = useQuery({
    queryKey: ["quick-assign-drivers", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, status: "Active", limit: 200 }),
    enabled: open && Boolean(operatingCompanyId),
  });
  // Unified fleet: trucks (mdata.units) + trailers (mdata.equipment), kind-tagged + active-filtered.
  const unitsQuery = useQuery({
    queryKey: ["quick-assign-units", operatingCompanyId],
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId, include: "trailers", limit: 500 }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const driverOptions = useMemo(
    () =>
      (driversQuery.data?.drivers ?? []).map((d) => ({
        value: d.id,
        label: [d.first_name, d.last_name].filter(Boolean).join(" ").trim() || d.id.slice(0, 8),
      })),
    [driversQuery.data?.drivers]
  );
  const fleet = (unitsQuery.data?.units ?? []) as Array<Record<string, unknown>>;
  const truckOptions = useMemo(
    () =>
      fleet
        .filter((row) => row.kind !== "trailer")
        .map((row) => ({ value: String(row.id ?? ""), label: fleetLabel(row) })),
    [fleet]
  );
  const trailerOptions = useMemo(
    () =>
      fleet
        .filter((row) => row.kind === "trailer")
        .map((row) => ({ value: String(row.id ?? ""), label: fleetLabel(row) })),
    [fleet]
  );

  return (
    <Modal open={open} onClose={onClose} title={`Quick Assign · ${loadNumber}`}>
      <form
        className="space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!driverId) return;
          setLoading(true);
          try {
            await onSubmit({
              driver_id: driverId,
              unit_id: unitId || undefined,
              trailer_id: trailerId || undefined,
              acknowledged_warnings: ackAll ? hardWarnings : [],
            });
            onClose();
          } finally {
            setLoading(false);
          }
        }}
      >
        <label className="block text-xs font-semibold text-gray-600">
          Driver <span className="text-red-500">*</span>
          <SelectCombobox
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
            className="mt-0.5 h-9 w-full text-sm"
            required
          >
            <option value="">{driversQuery.isLoading ? "Loading drivers…" : "Select driver…"}</option>
            {driverOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="block text-xs font-semibold text-gray-600">
          Unit
          <SelectCombobox value={unitId} onChange={(event) => setUnitId(event.target.value)} className="mt-0.5 h-9 w-full text-sm">
            <option value="">{unitsQuery.isLoading ? "Loading units…" : "Select unit (optional)…"}</option>
            {truckOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="block text-xs font-semibold text-gray-600">
          Trailer
          <SelectCombobox value={trailerId} onChange={(event) => setTrailerId(event.target.value)} className="mt-0.5 h-9 w-full text-sm">
            <option value="">{unitsQuery.isLoading ? "Loading trailers…" : "Select trailer (optional)…"}</option>
            {trailerOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectCombobox>
        </label>
        {hardWarnings.length > 0 ? (
          <label className="flex items-center gap-2 text-xs text-red-700">
            <input type="checkbox" checked={ackAll} onChange={(event) => setAckAll(event.target.checked)} />
            Owner override: acknowledge hard-block warnings ({hardWarnings.join(", ")})
          </label>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" size="sm" loading={loading} disabled={!driverId}>
            Quick Assign
          </Button>
        </div>
      </form>
    </Modal>
  );
}
