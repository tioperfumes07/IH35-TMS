import { useEffect, useState } from "react";
import { Modal } from "../Modal";
import { Button } from "../Button";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
};

export function DeactivateFactorConfirmModal({ open, onClose, onConfirm, loading }: Props) {
  const [typed, setTyped] = useState("");
  const [holdProgress, setHoldProgress] = useState(0);
  const [holding, setHolding] = useState(false);

  useEffect(() => {
    if (!open) {
      setTyped("");
      setHoldProgress(0);
      setHolding(false);
    }
  }, [open]);

  useEffect(() => {
    if (!holding) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - started;
      setHoldProgress(Math.min(100, (elapsed / 5000) * 100));
      if (elapsed >= 5000) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [holding]);

  const typedOk = typed.trim().toUpperCase() === "DEACTIVATE";
  const holdOk = holdProgress >= 100;

  return (
    <Modal open={open} onClose={onClose} title="Deactivate active factor">
      <div className="space-y-3 text-sm" data-deactivate-factor-confirm-modal="true">
        <p className="text-gray-700">This disables the active factor for this operating company. Use only during controlled migration windows.</p>
        <ul className="list-disc pl-5 text-xs text-gray-600">
          <li>Customer factor assignments may stop advancing new invoices.</li>
          <li>Existing reserve balances remain until reconciled.</li>
        </ul>
        <label className="block text-xs font-semibold text-gray-700">
          Type DEACTIVATE to confirm
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={typed} onChange={(event) => setTyped(event.target.value)} />
        </label>
        <div>
          <Button
            variant="danger"
            disabled={!typedOk || loading}
            onMouseDown={() => setHolding(true)}
            onMouseUp={() => setHolding(false)}
            onMouseLeave={() => setHolding(false)}
          >
            Hold 5 seconds to confirm ({Math.round(holdProgress)}%)
          </Button>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!typedOk || !holdOk || loading} onClick={onConfirm}>
            {loading ? "Deactivating..." : "Deactivate active factor"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
