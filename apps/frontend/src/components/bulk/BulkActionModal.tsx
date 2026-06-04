import { useEffect, useState } from "react";
import { Modal } from "../Modal";

export const BULK_REASON_MIN_LENGTH = 10;

export type BulkActionModalProps = {
  open: boolean;
  actionLabel: string;
  affectedCount: number;
  requiresReason?: boolean;
  reasonRequired?: boolean;
  requiresTypedConfirm?: string;
  payloadFields?: React.ReactNode;
  description?: string;
  onConfirm: (input: { reason?: string; payload?: Record<string, unknown> }) => void;
  onCancel: () => void;
  confirming?: boolean;
};

export function BulkActionModal({
  open,
  actionLabel,
  affectedCount,
  requiresReason,
  reasonRequired,
  requiresTypedConfirm,
  payloadFields,
  description,
  onConfirm,
  onCancel,
  confirming = false,
}: BulkActionModalProps) {
  const needsReason = requiresReason ?? reasonRequired ?? false;
  const [reason, setReason] = useState("");
  const [typedConfirm, setTypedConfirm] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [typedError, setTypedError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReason("");
      setTypedConfirm("");
      setReasonError(null);
      setTypedError(null);
    }
  }, [open]);

  const validateAndConfirm = () => {
    if (needsReason && reason.trim().length < BULK_REASON_MIN_LENGTH) {
      setReasonError(`Reason must be at least ${BULK_REASON_MIN_LENGTH} characters.`);
      return;
    }
    if (requiresTypedConfirm && typedConfirm.trim() !== requiresTypedConfirm) {
      setTypedError(`Type ${requiresTypedConfirm} to confirm.`);
      return;
    }
    onConfirm({ reason: needsReason ? reason.trim() : undefined });
  };

  return (
    <Modal open={open} onClose={onCancel} title={`Bulk ${actionLabel}`}>
      <div className="space-y-4 text-sm">
        <p>
          You are about to <strong>{actionLabel.toLowerCase()}</strong> on{" "}
          <strong>{affectedCount}</strong> {affectedCount === 1 ? "item" : "items"}.
        </p>
        {description ? <p className="text-gray-600">{description}</p> : null}
        {payloadFields}
        {needsReason ? (
          <label className="block space-y-1">
            <span className="font-medium text-gray-800">Reason (required)</span>
            <textarea
              className="w-full rounded border border-gray-300 p-2 text-sm"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError) setReasonError(null);
              }}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={reasonError ? "bulk-reason-error" : undefined}
            />
            {reasonError ? (
              <span id="bulk-reason-error" className="text-xs text-red-600">
                {reasonError}
              </span>
            ) : (
              <span className="text-xs text-gray-500">Minimum {BULK_REASON_MIN_LENGTH} characters.</span>
            )}
          </label>
        ) : null}
        {requiresTypedConfirm ? (
          <label className="block space-y-1">
            <span className="font-medium text-gray-800">Type {requiresTypedConfirm} to confirm</span>
            <input
              type="text"
              className="w-full rounded border border-gray-300 p-2 text-sm"
              value={typedConfirm}
              onChange={(e) => {
                setTypedConfirm(e.target.value);
                if (typedError) setTypedError(null);
              }}
              aria-invalid={Boolean(typedError)}
            />
            {typedError ? <span className="text-xs text-red-600">{typedError}</span> : null}
          </label>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
            onClick={onCancel}
            disabled={confirming}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            onClick={validateAndConfirm}
            disabled={confirming}
          >
            {confirming ? "Applying…" : "Confirm"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
