import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listUnits, setDriverDefaultTruck } from "../../api/mdata";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { SelectCombobox } from "../shared/SelectCombobox";

function truckLabel(row: Record<string, unknown>): string {
  const number = [row.unit_number, row.equipment_number].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  const make = typeof row.make === "string" ? row.make : "";
  const model = typeof row.model === "string" ? row.model : "";
  return [number, [make, model].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || String(row.id ?? "");
}

type Props = {
  open: boolean;
  driverId: string;
  companyId: string;
  driverName: string;
  onClose: () => void;
  onAssigned?: () => void;
};

export function AssignTruckModal({ open, driverId, companyId, driverName, onClose, onAssigned }: Props) {
  const [unitId, setUnitId] = useState("");
  const [loading, setLoading] = useState(false);

  const unitsQuery = useQuery({
    queryKey: ["assign-truck-units", companyId],
    queryFn: () => listUnits({ operating_company_id: companyId, status: "Active", limit: 500 }),
    enabled: open && Boolean(companyId),
  });

  const truckOptions = useMemo(
    () =>
      ((unitsQuery.data?.units ?? []) as Array<Record<string, unknown>>)
        .filter((row) => row.kind !== "trailer")
        .map((row) => ({ value: String(row.id ?? ""), label: truckLabel(row) })),
    [unitsQuery.data?.units]
  );

  return (
    <Modal open={open} onClose={onClose} title={`Assign default truck · ${driverName}`}>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!unitId) return;
          setLoading(true);
          try {
            await setDriverDefaultTruck(driverId, companyId, unitId);
            setUnitId("");
            onAssigned?.();
            onClose();
          } finally {
            setLoading(false);
          }
        }}
      >
        <p className="text-xs text-gray-600">Select the default truck for this driver.</p>
        <SelectCombobox
          value={unitId}
          onChange={(event) => setUnitId(event.target.value)}
          className="h-9 w-full text-sm"
          required
          data-testid="assign-truck-unit"
        >
          <option value="">{unitsQuery.isLoading ? "Loading trucks…" : "Select truck…"}</option>
          {truckOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </SelectCombobox>
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={loading} disabled={!unitId} data-testid="assign-truck-confirm">
            Confirm assign
          </Button>
        </div>
      </form>
    </Modal>
  );
}
