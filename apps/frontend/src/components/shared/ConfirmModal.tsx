import { useState } from "react";
import { Button } from "../Button";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

/** Shared dismiss gate: Cancel / Escape / backdrop must not abandon an in-flight confirmation write. */
export function closeUnlessPending(pending: boolean, onClose: () => void) {
  if (!pending) onClose();
}

/** In-app yes/no confirmation — replaces native window.confirm() on destructive/config actions. */
export function ConfirmModal({ open, title, message, confirmLabel = "Confirm", danger = false, onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);
  const closeUnlessBusy = () => closeUnlessPending(busy, onClose);
  return (
    <Modal open={open} onClose={closeUnlessBusy} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-gray-700">{message}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={closeUnlessBusy} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={danger ? "danger" : "primary"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
