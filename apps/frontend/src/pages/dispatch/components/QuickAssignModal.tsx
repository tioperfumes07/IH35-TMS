import { useState } from "react";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { EntityPicker } from "../../../components/parity/EntityPicker";

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

export function QuickAssignModal({ open, operatingCompanyId, loadNumber, hardWarnings, onClose, onSubmit }: Props) {
  const [driverId, setDriverId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [trailerId, setTrailerId] = useState("");
  const [ackAll, setAckAll] = useState(false);
  const [loading, setLoading] = useState(false);

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
          <div className="mt-0.5">
            <DriverPickerWithCreate
              driverRoster="active_or_probation"
              operatingCompanyId={operatingCompanyId}
              value={driverId || null}
              onChange={(next) => setDriverId(next ?? "")}
              open={open}
              placeholder="Select driver…"
              className="h-9 w-full text-sm"
              allowClear={false}
              // Standalone Modal chrome → default shell="modal".
            />
          </div>
        </label>
        <label className="block text-xs font-semibold text-gray-600">
          Unit
          <div className="mt-0.5" data-testid="quick-assign-unit">
            <EntityPicker
              kind="unit"
              operatingCompanyId={operatingCompanyId}
              value={unitId || null}
              onChange={(next) => setUnitId(next ?? "")}
              enabled={open}
              placeholder="Select unit (optional)…"
              className="h-9 w-full text-sm"
            />
          </div>
        </label>
        <label className="block text-xs font-semibold text-gray-600">
          Trailer
          <div className="mt-0.5" data-testid="quick-assign-trailer">
            <EntityPicker
              kind="trailer"
              operatingCompanyId={operatingCompanyId}
              value={trailerId || null}
              onChange={(next) => setTrailerId(next ?? "")}
              enabled={open}
              placeholder="Select trailer (optional)…"
              className="h-9 w-full text-sm"
            />
          </div>
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
            Assign
          </Button>
        </div>
      </form>
    </Modal>
  );
}
