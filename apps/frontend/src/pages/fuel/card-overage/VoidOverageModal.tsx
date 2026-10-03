import { useEffect, useState } from "react";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { closeUnlessPending } from "../../../components/shared/ConfirmModal";

type Props = {
  open: boolean;
  /** e.g. "$450.00 for Juan Perez" — what is being voided. */
  summary: string;
  /** True when the receivable has posted: the void also posts a linked reversing entry. */
  posted: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

/** ROUND 352 point 7 — void an overage event; a posted receivable is reversed, never deleted. */
export function VoidOverageModal({ open, summary, posted, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);
  const close = () => closeUnlessPending(busy, onClose);
  const missing = reason.trim().length < 3 ? "Add a reason (at least 3 characters)." : null;
  return (
    <Modal open={open} onClose={close} title="Void overage">
      <div className="space-y-3" data-testid="fuel-card-overage-void-modal">
        <p className="text-xs text-gray-700">
          Void the recovery of {summary}.{" "}
          {posted
            ? "The driver receivable is reversed with a linked reversing entry; the original entry stays on the books."
            : "Nothing has posted yet; the event is kept as voided."}
        </p>
        <label className="block text-xs text-slate-600">
          Reason
          <textarea
            className="mt-1 min-h-16 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            data-testid="fuel-card-overage-void-reason"
          />
        </label>
        {error ? (
          <p className="text-xs text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={busy}
            disabled={Boolean(missing)}
            title={missing ?? undefined}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm(reason.trim());
                onClose();
              } catch (err) {
                setError((err as Error)?.message || "Void failed — please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Void
          </Button>
        </div>
      </div>
    </Modal>
  );
}
