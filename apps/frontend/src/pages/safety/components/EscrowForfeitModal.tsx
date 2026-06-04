import { useState } from "react";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import type { EscrowRecordRow } from "../../../api/driverFinance";

type Props = {
  open: boolean;
  row: EscrowRecordRow | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: { amount: number; reason: string; linked_liability_id?: string }) => void;
};

export function EscrowForfeitModal({ open, row, loading, onClose, onConfirm }: Props) {
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [linkedLiabilityId, setLinkedLiabilityId] = useState("");

  const reset = () => {
    setAmount(0);
    setReason("");
    setLinkedLiabilityId("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={row ? `Escrow Forfeit — ${row.driver_name}` : "Escrow Forfeit"}>
      <div className="space-y-3 text-sm text-gray-700" data-testid="escrow-forfeit-modal">
        <input
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value || 0))}
          placeholder="Amount"
          data-testid="escrow-forfeit-amount"
        />
        <input
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
          data-testid="escrow-forfeit-reason"
        />
        <input
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
          value={linkedLiabilityId}
          onChange={(e) => setLinkedLiabilityId(e.target.value)}
          placeholder="Linked liability_id (optional)"
          data-testid="escrow-forfeit-liability-id"
        />
        {row && !row.has_signed_clause ? (
          <p className="text-xs text-red-700" data-testid="escrow-forfeit-clause-block">
            Blocked: forfeiture requires a signed escrow clause (MUST 3.13.6.3.D).
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            data-testid="escrow-forfeit-submit"
            loading={loading}
            disabled={Boolean(row && !row.has_signed_clause)}
            onClick={() => {
              onConfirm({
                amount,
                reason,
                linked_liability_id: linkedLiabilityId || undefined,
              });
              reset();
            }}
          >
            Submit Forfeit
          </Button>
        </div>
      </div>
    </Modal>
  );
}
