import { useState } from "react";
import { setDriverDefaultTruck } from "../../api/mdata";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { EntityPicker } from "../parity/EntityPicker";

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
        {/* SAF-B29 / picker law: never silent <SelectCombobox> over listUnits(limit:500). */}
        <EntityPicker
          kind="unit"
          operatingCompanyId={companyId}
          value={unitId || null}
          onChange={(next) => setUnitId(next ?? "")}
          allowCreate={false}
          enabled={open}
          placeholder="Search truck…"
          className="w-full"
          dataField="assign-truck-unit"
          dataTestId="assign-truck-unit"
        />
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
