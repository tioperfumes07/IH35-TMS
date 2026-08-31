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
  if (tripClosedAt) return null;

  async function runCloseTrip() {
    if (!companyId) return;
    setBusy(true);
    try {
      const data = await closeSettlementTrip(settlementId, companyId);
      pushToast(`Trip closed — load edit lock released`, "success");
      if (data.stamped) onClosed?.();
    } catch (error) {
      pushToast(userFacingApiError(error, "Close trip failed"), "error");
    } finally {
      setBusy(false);
    }
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
