import { useCallback, useEffect, useRef, useState } from "react";
import { suspendDriver } from "../../api/mdata";
import { Button } from "../Button";
import { Modal } from "../Modal";

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
  const [attemptClose, setAttemptClose] = useState<() => void>(() => () => {});
  const requestGenerationRef = useRef(0);

  const resetDraft = useCallback(() => {
    setReason("");
    setError("");
  }, []);

  useEffect(() => {
    requestGenerationRef.current += 1;
    setPending(false);
    if (open) resetDraft();
  }, [open, driverId, resetDraft]);

  const handleClose = useCallback(() => {
    if (pending) return;
    requestGenerationRef.current += 1;
    resetDraft();
    onClose();
  }, [onClose, pending, resetDraft]);

  const submit = async () => {
    setError("");
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    const input = { driverId, reason: reason.trim(), generation: requestGenerationRef.current };
    setPending(true);
    try {
      await suspendDriver(input.driverId, input.reason);
      if (input.generation !== requestGenerationRef.current) return;
      onSuspended?.();
      requestGenerationRef.current += 1;
      resetDraft();
      onClose();
    } catch {
      if (input.generation !== requestGenerationRef.current) return;
      setError("Failed to suspend driver.");
    } finally {
      if (input.generation === requestGenerationRef.current) setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={`Suspend — ${driverName}`} confirmDiscardOnClose isDirty={Boolean(reason)} onRegisterAttemptClose={(next) => setAttemptClose(() => next)}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Sets driver status to Inactive and records a safety incident for audit.
        </p>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Reason</label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
            rows={3}
            data-testid="suspend-reason"
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={attemptClose} disabled={pending}>
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
