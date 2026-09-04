// @ModalNoX — inline repair-block panel, not a dismissible overlay dialog
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDriverLoadAvailability } from "../../api/dispatch";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";

// WIZ-47 — the unit-repair / availability gate. This is a first-class blocker ROW (rule code,
// subject = the unit, what is missing = the open work order, and the override control), NOT a
// hidden slate box. The override is reason-carrying: a dispatcher must type a >=10-char reason,
// exactly like a per-row pre-dispatch blocker override, and that reason is recorded and audited.
export const REPAIR_OVERRIDE_MIN_REASON = 10;

type Props = {
  operatingCompanyId: string;
  selectedDriverId: string;
  /** Reason-carrying override (>=10 chars enables the override), owned by BookLoadModalV4 so it
   *  travels into the booking's audited override payload. */
  overrideReason: string;
  onOverrideReasonChange: (nextValue: string) => void;
  onSubmitBlockedChange?: (isBlocked: boolean) => void;
};

export function LoadCreateModal({
  operatingCompanyId,
  selectedDriverId,
  overrideReason,
  onOverrideReasonChange,
  onSubmitBlockedChange,
}: Props) {
  const availabilityQuery = useQuery({
    queryKey: ["dispatch", "driver-load-availability", operatingCompanyId, selectedDriverId],
    enabled: Boolean(operatingCompanyId && selectedDriverId),
    queryFn: () => getDriverLoadAvailability(selectedDriverId, operatingCompanyId),
  });

  const notFound = availabilityQuery.data?.code === "E_DRIVER_NOT_FOUND";
  const repairBlocked = availabilityQuery.data?.ok === false && !notFound;
  const overrideApplied = overrideReason.trim().length >= REPAIR_OVERRIDE_MIN_REASON;
  // A read failure or a merged driver is NOT an overridable policy block — it is retry / reselect.
  // Only the repair-WO block clears with a recorded reason.
  const submitBlocked = availabilityQuery.isError || notFound || (repairBlocked && !overrideApplied);

  useEffect(() => {
    onSubmitBlockedChange?.(submitBlocked);
  }, [onSubmitBlockedChange, submitBlocked]);

  if (!selectedDriverId || (!repairBlocked && !notFound && !availabilityQuery.isError)) return null;

  if (notFound) {
    return (
      <div
        className="rounded-sm border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-800"
        data-testid="book-load-driver-merged"
        role="status"
      >
        This driver record was merged — reselect.
      </div>
    );
  }

  if (availabilityQuery.isError) {
    return (
      <ListErrorBanner
        message={userFacingApiError(availabilityQuery.error, "Could not verify driver repair availability")}
        onRetry={() => void availabilityQuery.refetch()}
      />
    );
  }

  // Blocker ROW — same visual language as a pre-dispatch blocker row: red, rule code, subject,
  // what is missing, and the override control right there. No hidden gate.
  const reasonLength = overrideReason.trim().length;
  return (
    <div
      className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
      data-testid="book-load-repair-blocker-row"
      role="group"
      aria-label="Unit repair work order blocker"
    >
      <div className="flex items-center gap-2">
        <span className="rounded-sm border border-red-300 bg-white px-1.5 py-0.5 font-mono text-xs text-red-700">
          UNIT-REPAIR-WO
        </span>
        <span className="font-semibold">{availabilityQuery.data?.blocker ?? "Unit has an active repair work order"}</span>
      </div>
      <div className="mt-1">
        {/* FAIL-U1: show the WO display_id and unit number. A dispatcher cannot act on a uuid. */}
        Missing — clear this open work order:{" "}
        <EntityLinkOrTombstone
          kind="work_order"
          id={availabilityQuery.data?.work_order_id}
          name={availabilityQuery.data?.work_order_display_id}
          noun="Work order"
        />{" "}
        {/* LINK reverse_link: asset_id is always a unit here — backend's own dispatcher-facing string
            confirms it (load-assign.routes.ts: `Unit ${availability.asset_label}`), so kind="unit"
            is not a guess. */}
        · Asset:{" "}
        <EntityLinkOrTombstone
          kind="unit"
          id={availabilityQuery.data?.asset_id}
          name={availabilityQuery.data?.asset_label}
          noun="Unit"
        />
      </div>
      <label className="mt-2 block font-semibold" htmlFor="repair-block-override-reason">
        Override this blocker — reason required (min {REPAIR_OVERRIDE_MIN_REASON} characters)
      </label>
      <textarea
        id="repair-block-override-reason"
        data-testid="repair-block-override-reason"
        value={overrideReason}
        onChange={(event) => onOverrideReasonChange(event.target.value)}
        className="mt-1 w-full rounded-sm border border-red-300 px-2 py-1 text-red-900"
        rows={2}
        placeholder="Why is it safe to dispatch this unit with an open repair work order?"
      />
      {overrideApplied ? (
        <div className="mt-1 font-semibold text-slate-700" data-testid="repair-block-override-recorded">
          Override recorded — this reason is saved with the booking.
        </div>
      ) : (
        <div className="mt-1 font-semibold" data-testid="repair-block-submit-blocked">
          Submit blocked — enter an override reason of at least {REPAIR_OVERRIDE_MIN_REASON} characters
          {reasonLength > 0 ? ` (${reasonLength}/${REPAIR_OVERRIDE_MIN_REASON})` : ""}.
        </div>
      )}
    </div>
  );
}
