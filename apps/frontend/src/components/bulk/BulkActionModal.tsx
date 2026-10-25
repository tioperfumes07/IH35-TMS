import { useEffect, useState } from "react";
import { Modal } from "../Modal";
import { VoidReasonModal } from "../accounting/VoidReasonModal";

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
  const [typedConfirm, setTypedConfirm] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  const [voidModalOpen, setVoidModalOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setTypedConfirm("");
      setTypedError(null);
    }
  }, [open]);

  const handleConfirmClick = () => {
    if (requiresTypedConfirm && typedConfirm.trim() !== requiresTypedConfirm) {
      setTypedError(`Type ${requiresTypedConfirm} to confirm.`);
      return;
    }
    if (needsReason) {
      setVoidModalOpen(true);
    } else {
      onConfirm({});
    }
  };

  const handleVoidSubmit = async (reasonCode: string) => {
    setVoidModalOpen(false);
    onConfirm({ reason: reasonCode });
  };

  return (
    <>
      <Modal open={open} onClose={onCancel} title={`Bulk ${actionLabel}`}>
        <div className="space-y-4 text-xs">
          <p>
            You are about to <strong>{actionLabel.toLowerCase()}</strong> on{" "}
            <strong>{affectedCount}</strong> {affectedCount === 1 ? "item" : "items"}.
          </p>
          {description ? <p className="text-gray-600">{description}</p> : null}
          {payloadFields}
          {requiresTypedConfirm ? (
            <label className="block space-y-1">
              <span className="font-medium text-gray-800">Type {requiresTypedConfirm} to confirm</span>
              <input
                type="text"
                className="w-full rounded-sm border border-gray-300 p-2 text-xs"
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
              className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs"
              onClick={onCancel}
              disabled={confirming}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-sm bg-[#1F2A44] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              onClick={handleConfirmClick}
              disabled={confirming}
            >
              {confirming ? "Applying…" : "Confirm"}
            </button>
          </div>
        </div>
      </Modal>
      {needsReason ? (
        <VoidReasonModal
          title={`Bulk ${actionLabel}`}
          open={voidModalOpen}
          onClose={() => setVoidModalOpen(false)}
          onSubmit={handleVoidSubmit}
        />
      ) : null}
    </>
  );
}
