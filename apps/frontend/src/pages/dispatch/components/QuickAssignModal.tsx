import { useState } from "react";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";

type Props = {
  open: boolean;
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

export function QuickAssignModal({ open, loadNumber, hardWarnings, onClose, onSubmit }: Props) {
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
          setLoading(true);
          try {
            await onSubmit({
              driver_id: driverId.trim(),
              unit_id: unitId.trim() || undefined,
              trailer_id: trailerId.trim() || undefined,
              acknowledged_warnings: ackAll ? hardWarnings : [],
            });
            onClose();
          } finally {
            setLoading(false);
          }
        }}
      >
        <input
          value={driverId}
          onChange={(event) => setDriverId(event.target.value)}
          className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
          placeholder="Driver ID (required)"
          required
        />
        <input
          value={unitId}
          onChange={(event) => setUnitId(event.target.value)}
          className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
          placeholder="Unit ID (optional)"
        />
        <input
          value={trailerId}
          onChange={(event) => setTrailerId(event.target.value)}
          className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
          placeholder="Trailer ID (optional)"
        />
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
          <Button type="submit" size="sm" loading={loading}>
            Quick Assign
          </Button>
        </div>
      </form>
    </Modal>
  );
}
