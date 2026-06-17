import { useState } from "react";
import { createSafetyEvent, updateDriver } from "../../api/mdata";
import { Button } from "../Button";
import { Modal } from "../Modal";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  driverId: string;
  driverName: string;
  onClose: () => void;
  onSuspended?: () => void;
};

export function SuspendConfirmModal({ open, driverId, driverName, onClose, onSuspended }: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setError("");
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setPending(true);
    try {
      await updateDriver(driverId, { status: "Inactive" });
      await createSafetyEvent(driverId, {
        event_type: "incident",
        event_date: todayIso(),
        severity: "warning",
        summary: `Driver suspended: ${reason.trim()}`,
        details: reason.trim(),
      });
      setReason("");
      onSuspended?.();
      onClose();
    } catch {
      setError("Failed to suspend driver.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Suspend — ${driverName}`}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Sets driver status to Inactive and records a safety incident for audit.
        </p>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Reason</label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-[13px]"
            rows={3}
            data-testid="suspend-reason"
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} loading={pending} data-testid="suspend-confirm">
            Suspend
          </Button>
        </div>
      </div>
    </Modal>
  );
}
