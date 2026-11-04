// @ModalNoX — inline repair-block panel, not a dismissible overlay dialog
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDriverLoadAvailability } from "../../api/dispatch";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { OverrideButton } from "../../components/override/OverrideButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";

// WIZ-47 — the unit-repair / availability gate. This is a first-class blocker ROW (rule code,
// subject = the unit, what is missing = the open work order, and the override control), NOT a
// hidden slate box. The override is reason-carrying — row 28 (443.294): the ONE OverrideButton
// (Owner / Accountant confirm; everyone else picks a catalog reason; nothing typed), exactly like a
// per-row pre-dispatch blocker override; the catalog line is recorded and audited with the booking.
export const REPAIR_OVERRIDE_MIN_REASON = 10;

type Props = {
  operatingCompanyId: string;
  selectedDriverId: string;
  /** The confirmed catalog override line (>=10 chars), owned by BookLoadModalV4 so it travels into
   *  the booking's audited override payload. Set only by the shared OverrideButton. */
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
        className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#0F1219]"
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
      {overrideApplied ? (
        <div className="mt-2 font-semibold text-[#1F2A44]" data-testid="repair-block-override-recorded">
          Override recorded — {overrideReason.trim()} — saved with the booking.
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <OverrideButton
            context="dispatch"
            size="sm"
            label="Override this blocker"
            testId="repair-block-override"
            onConfirm={(_code, choice) => onOverrideReasonChange(choice.text)}
          />
          <span className="font-semibold" data-testid="repair-block-submit-blocked">
            Submit blocked until this blocker is overridden.
          </span>
        </div>
      )}
    </div>
  );
}
