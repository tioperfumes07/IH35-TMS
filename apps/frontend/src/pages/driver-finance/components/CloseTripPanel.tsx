import { useState } from "react";
import { closeSettlementTrip } from "../../../api/driverFinance";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";

const CLOSE_TRIP_ROLES = new Set(["Owner", "Administrator", "Manager", "Accountant", "Payroll"]);

type Props = {
  settlementId: string;
  companyId: string;
  userRole: string | null | undefined;
  settlementModel: string | null | undefined;
  tripClosedAt: string | null | undefined;
  onClosed?: () => void;
};

/**
 * Close trip — stamps trip_closed_at on load-bookended settlements stuck with NULL
 * (payrun-close gap / load past delivered_pending_docs). Unblocks load edit lock.
 *
 * ACCT-F10161-adjacent (live-caught 2026-08-31, CC-1, chasing L-20260831-0002/0004): this panel
 * used to `return null` outright once `tripClosedAt` was set, hiding the button entirely for any
 * already-closed settlement. That made #18859's server-side healing (stampTripClosedForBookended
 * Settlement now re-attempts appendSettlementLineFromDriverBillIfMissing even on an `already_closed`
 * hit, per its own comment) permanently UNREACHABLE from the UI for exactly the settlements that
 * need it — a settlement that closed $0.00/$0.00 next to a real, open, unattached driver bill stays
 * that way forever, because the one control that could re-run the heal never renders once closed.
 * Now renders a distinct, always-available "Re-check settlement" action once closed, so an
 * authorized user can always re-trigger the idempotent heal without any SQL/API workaround.
 */
export function CloseTripPanel({
  settlementId,
  companyId,
  userRole,
  settlementModel,
  tripClosedAt,
  onClosed,
}: Props) {
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!CLOSE_TRIP_ROLES.has(String(userRole ?? ""))) return null;
  if (settlementModel !== "load_bookended") return null;

  async function runCloseTrip() {
    if (!companyId) return;
    setBusy(true);
    try {
      const data = await closeSettlementTrip(settlementId, companyId);
      if (data.stamped) {
        pushToast(`Trip closed — load edit lock released`, "success");
      } else if (data.reason === "already_closed") {
        pushToast(`Settlement re-checked — any unattached driver bill has been re-applied`, "success");
      } else {
        pushToast(`Trip closed — load edit lock released`, "success");
      }
      onClosed?.();
    } catch (error) {
      pushToast(userFacingApiError(error, "Close trip failed"), "error");
    } finally {
      setBusy(false);
    }
  }

  if (tripClosedAt) {
    return (
      <div
        className="rounded-sm border border-slate-200 bg-slate-100 p-3 text-sm"
        data-testid="close-trip-panel-recheck"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Trip closed</p>
        <p className="mt-1 text-xs text-slate-600">
          Closed {new Date(tripClosedAt).toLocaleString()}. If a driver bill became payable after this
          settlement closed (a common gap this control exists to heal), re-check to re-apply it — safe to
          run any time, a no-op if there is nothing to attach.
        </p>
        <div className="mt-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !companyId}
            onClick={() => void runCloseTrip()}
            data-testid="close-trip-recheck-button"
          >
            {busy ? "Re-checking…" : "Re-check settlement"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-sm border border-slate-200 bg-slate-100 p-3 text-sm"
      data-testid="close-trip-panel"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Trip not closed</p>
      <p className="mt-1 text-xs text-slate-600">
        This load-bookended settlement has no trip close timestamp. Loads bookended by it stay locked for
        edit until the trip is closed. Use this when pay-run close succeeded but the load is already past
        delivered pending docs.
      </p>
      <div className="mt-2">
        <Button
          size="sm"
          disabled={busy || !companyId}
          onClick={() => void runCloseTrip()}
          data-testid="close-trip-button"
        >
          {busy ? "Closing trip…" : "Close trip"}
        </Button>
      </div>
    </div>
  );
}
