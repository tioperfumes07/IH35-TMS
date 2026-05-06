import { useState } from "react";
import { holdDeduction } from "../../../api/driverFinance";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import type { DeductionRow } from "./DeductionsSection";

type Props = {
  open: boolean;
  deduction: DeductionRow | null;
  operatingCompanyId: string;
  onClose: () => void;
  onHeld: () => void;
};

export function HoldDeductionModal({ open, deduction, operatingCompanyId, onClose, onHeld }: Props) {
  const { pushToast } = useToast();
  const [reason, setReason] = useState("");
  const [holdUntil, setHoldUntil] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!deduction) return;
    if (reason.trim().length < 10) {
      pushToast("Reason must be at least 10 characters", "error");
      return;
    }
    setLoading(true);
    try {
      await holdDeduction(deduction.id, operatingCompanyId, {
        hold_until_period: holdUntil || new Date().toISOString().slice(0, 10),
        reason: reason.trim(),
      });
      pushToast("Deduction held", "success");
      onHeld();
      onClose();
    } catch {
      pushToast("Failed to hold deduction", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Hold Deduction">
      {!deduction ? null : (
        <div className="space-y-2 text-xs">
          <div className="rounded border border-gray-200 bg-gray-50 p-2">
            <div className="font-semibold">{deduction.description}</div>
            <div>Balance left: ${deduction.balance_left.toFixed(2)}</div>
            <div>This period: ${deduction.this_period_amount.toFixed(2)}</div>
          </div>
          <div>
            <label className="mb-1 block font-semibold">Reason (min 10 chars)</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block font-semibold">Hold until period</label>
            <input
              type="date"
              value={holdUntil}
              onChange={(event) => setHoldUntil(event.target.value)}
              className="h-8 w-full rounded border border-gray-300 px-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => void submit()} loading={loading}>Hold Deduction</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
