import { Modal } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { OverrideButton } from "../../../components/override/OverrideButton";
import type { NetPayFloorBreachDetails } from "../../../api/driverFinance";
import { formatUsdCents } from "../../../lib/money";

type Props = {
  open: boolean;
  details: NetPayFloorBreachDetails | null;
  onClose: () => void;
  /** Fires with the override to attach to a re-submitted close call. Never auto-submits — the panel owns the retry. */
  onDecide: (override: { pct: number | null; cents: number | null; reason_code: string | null }) => void;
};

function formatCents(cents: number): string {
  return formatUsdCents(cents);
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
 * final check" the task names, gated on a reason so who decided and why is on the audit
 * trail (driver_finance.settlement.payrun_floor_override), never silent, never a default.
 * Row 28 (443.294): the reason is the ONE OverrideButton (context "settlement") — Owner / Accountant
 * confirm; everyone else picks a catalog reason. Nothing is typed.
 */
export function FloorOverrideDecisionModal({ open, details, onClose, onDecide }: Props) {
  if (!details) return null;

  function confirmOverride(reasonCode: string | null) {
    // Row 28: the catalog reason_code (null = an Owner / Accountant plain confirm) — the server validates it through
    // recordOverride in the close transaction. A typed sentence never travels.
    onDecide({ pct: 0, cents: 0, reason_code: reasonCode });
  }

  return (
    <Modal open={open} onClose={onClose} title="Net pay below the settlement floor">
      <div className="space-y-3 text-xs" data-testid="floor-override-decision-modal">
        <p className="text-gray-700">
          Net pay <span className="font-semibold">{formatCents(details.net_cents)}</span> is below
          the {details.floor_pct}% / {formatCents(details.floor_min_cents)} net-pay floor (
          {formatCents(details.floor_cents)}) after escrow/advance/chargeback withholding. Closing
          below the floor requires an override — e.g. driver termination, paying the full final check.
        </p>

        <div className="flex flex-wrap gap-2">
          <OverrideButton
            context="settlement"
            size="sm"
            label={`Override — pay full net ${formatCents(details.net_cents)}`}
            testId="floor-override-confirm"
            onConfirm={(code) => confirmOverride(code)}
          />
          <Button size="sm" variant="secondary" onClick={onClose} data-testid="floor-override-cancel">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
