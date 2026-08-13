import { useState } from "react";
import { holdDeduction } from "../../../api/driverFinance";
import { Button } from "../../../components/Button";
import { DatePicker } from "../../../components/forms/DatePicker";
import { Modal } from "../../../components/Modal";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useToast } from "../../../components/Toast";
import { companyToday } from "../../../lib/businessDate";
import { entityLabel } from "../../../lib/entity-label";
import type { DeductionRow } from "./DeductionsSection";

type Props = {
  open: boolean;
  deduction: DeductionRow | null;
  operatingCompanyId: string;
  onClose: () => void;
  onHeld: () => void;
  /** Settlement this hold is opened from — Wave A settlement reverse hop. */
  settlementId?: string | null;
  settlementDisplayId?: string | null;
};

export function HoldDeductionModal({
  open,
  deduction,
  operatingCompanyId,
  onClose,
  onHeld,
  settlementId,
  settlementDisplayId,
}: Props) {
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
        hold_until_period: holdUntil || companyToday(),
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
          {settlementId ? (
            <p className="text-xs text-gray-700" data-testid="hold-deduction-settlement-link">
              Settlement:{" "}
              <EntityLink
                kind="settlement"
                id={settlementId}
                label={entityLabel(settlementDisplayId, settlementId, "Settlement")}
              />
            </p>
          ) : null}
          <div className="rounded-sm border border-gray-200 bg-gray-50 p-2">
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
              className="w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block font-semibold">Hold until period</label>
            <DatePicker
              value={holdUntil}
              onChange={setHoldUntil}
              className="h-8 w-full"
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
