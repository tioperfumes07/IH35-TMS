import { useCallback, useEffect, useState } from "react";
import { setDriverDefaultTruck } from "../../api/mdata";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { EntityPicker } from "../parity/EntityPicker";
import { userFacingApiError } from "../../lib/api-error-message";

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
  const [error, setError] = useState("");

  const resetDraft = useCallback(() => {
    setUnitId("");
    setError("");
  }, []);

  useEffect(() => {
    if (open) resetDraft();
  }, [open, companyId, driverId, resetDraft]);

  const handleClose = useCallback(() => {
    resetDraft();
    onClose();
  }, [onClose, resetDraft]);

  return (
    <Modal open={open} onClose={handleClose} title={`Assign default truck · ${driverName}`}>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!unitId) return;
          setError("");
          setLoading(true);
          try {
            await setDriverDefaultTruck(driverId, companyId, unitId);
            onAssigned?.();
            handleClose();
          } catch (err) {
            setError(userFacingApiError(err, "Could not assign default truck"));
          } finally {
            setLoading(false);
          }
        }}
      >
        <p className="text-xs text-gray-600">Select the default truck for this driver.</p>
        {/* SAF-B29 / picker law: EntityPicker server search — not a silent capped unit dropdown. */}
        <EntityPicker
          kind="unit"
          operatingCompanyId={companyId}
          value={unitId || null}
          onChange={(next) => setUnitId(next ?? "")}
          // CREATE chrome (Assign truck) — picker law: inline + Create unit FIRST ROW (not filter-mode).
          allowCreate
          enabled={open}
          placeholder="Search truck…"
          className="w-full"
          dataField="assign-truck-unit"
          dataTestId="assign-truck-unit"
        />
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={handleClose}>
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
