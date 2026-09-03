import { useEffect, useState } from "react";
import { Modal } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import type { NetPayFloorBreachDetails } from "../../../api/driverFinance";

type Props = {
  open: boolean;
  details: NetPayFloorBreachDetails | null;
  onClose: () => void;
  /** Fires with the override to attach to a re-submitted close call. Never auto-submits — the panel owns the retry. */
  onDecide: (override: { pct: number | null; cents: number | null; reason: string }) => void;
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * 25-task #10 (00_LOCKED_DECISIONS 9.2, owner-locked 2026-07-04): "5% net-pay floor, default,
 * EDITABLE per settlement... on termination may override to the full final check." The backend
 * (settlement-payrun-close.service.ts SET-05) has carried the `overrideFloor{pct,cents,reason}`
 * gate and 409 NET_PAY_FLOOR_BREACH refusal since before this modal existed — #19819 wired the
 * SIBLING OUTSTANDING_LOAN_DECISION_REQUIRED popup but left this refusal dropping into the plain
 * error banner (its own PR body said so: "override_floor is wired in the API client but has no
 * modal UI yet"). This is that missing control: Override waives the floor to $0 (pct:0, cents:0)
 * so netCents (already asserted >= 0 by NET_PAY_NEGATIVE upstream) always clears it — the "full
 * final check" the task names, gated on a written reason so who decided and why is on the audit
 * trail (driver_finance.settlement.payrun_floor_override), never silent, never a default.
 */
export function FloorOverrideDecisionModal({ open, details, onClose, onDecide }: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open && details) setReason("");
  }, [open, details]);

  if (!details) return null;

  const canConfirm = reason.trim().length >= 10;

  function confirmOverride() {
    if (!canConfirm) return;
    onDecide({ pct: 0, cents: 0, reason: reason.trim() });
  }

  return (
    <Modal open={open} onClose={onClose} title="Net pay below the settlement floor">
      <div className="space-y-3 text-xs" data-testid="floor-override-decision-modal">
        <p className="text-gray-700">
          Net pay <span className="font-semibold">{formatCents(details.net_cents)}</span> is below
          the {details.floor_pct}% / {formatCents(details.floor_min_cents)} net-pay floor (
          {formatCents(details.floor_cents)}) after escrow/advance/chargeback withholding. Closing
          below the floor requires a written reason — e.g. driver termination, paying the full
          final check.
        </p>

        <label className="block">
          <span className="mb-1 block font-medium text-gray-600">Reason (min 10 chars)</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
            placeholder="e.g. Driver terminated — full final check, no floor withheld"
            data-testid="floor-override-reason"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={confirmOverride} disabled={!canConfirm} data-testid="floor-override-confirm">
            Override — pay full net {formatCents(details.net_cents)}
          </Button>
          <Button size="sm" variant="secondary" onClick={onClose} data-testid="floor-override-cancel">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
