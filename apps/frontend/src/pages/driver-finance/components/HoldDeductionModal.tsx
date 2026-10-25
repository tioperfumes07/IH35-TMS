import { useState } from "react";
import { holdSettlementDeduction } from "../../../api/driverFinance";
import { Button } from "../../../components/Button";
import { DatePicker } from "../../../components/forms/DatePicker";
import { Modal } from "../../../components/Modal";
import { EntityLink } from "../../../components/shared/EntityLink";
import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";
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
  const [holdUntil, setHoldUntil] = useState("");
  const [reasonModalOpen, setReasonModalOpen] = useState(false);

  return (
    <>
      <Modal open={open && !reasonModalOpen} onClose={onClose} title="Hold Deduction">
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
              <label className="mb-1 block font-semibold">Hold until period</label>
              <DatePicker
                value={holdUntil}
                onChange={setHoldUntil}
                className="h-8 w-full"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={() => setReasonModalOpen(true)}>Continue</Button>
            </div>
          </div>
        )}
      </Modal>
      <VoidReasonModal
        open={reasonModalOpen}
        title="Hold Deduction — Reason"
        onClose={() => setReasonModalOpen(false)}
        onSubmit={async (reason) => {
          if (!deduction?.source_deduction_id) {
            pushToast("This deduction has no linked record to hold", "error");
            return;
          }
          await holdSettlementDeduction(deduction.source_deduction_id, operatingCompanyId, {
            hold_until_period: holdUntil || companyToday(),
            reason,
          });
          pushToast("Deduction held", "success");
          setReasonModalOpen(false);
          onHeld();
          onClose();
        }}
        submitLabel="Hold Deduction"
      />
    </>
  );
}
