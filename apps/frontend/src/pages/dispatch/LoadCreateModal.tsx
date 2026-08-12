// @ModalNoX — inline repair-block panel, not a dismissible overlay dialog
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDriverLoadAvailability } from "../../api/dispatch";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";

type Props = {
  operatingCompanyId: string;
  selectedDriverId: string;
  overrideRepairBlock: boolean;
  onOverrideRepairBlockChange: (nextValue: boolean) => void;
  onSubmitBlockedChange?: (isBlocked: boolean) => void;
};

export function LoadCreateModal({
  operatingCompanyId,
  selectedDriverId,
  overrideRepairBlock,
  onOverrideRepairBlockChange,
  onSubmitBlockedChange,
}: Props) {
  const availabilityQuery = useQuery({
    queryKey: ["dispatch", "driver-load-availability", operatingCompanyId, selectedDriverId],
    enabled: Boolean(operatingCompanyId && selectedDriverId),
    queryFn: () => getDriverLoadAvailability(selectedDriverId, operatingCompanyId),
  });

  const repairBlocked = availabilityQuery.data?.ok === false;
  const submitBlocked = availabilityQuery.isError || (repairBlocked && !overrideRepairBlock);

  useEffect(() => {
    onSubmitBlockedChange?.(submitBlocked);
  }, [onSubmitBlockedChange, submitBlocked]);

  if (!selectedDriverId || (!repairBlocked && !availabilityQuery.isError)) return null;

  if (availabilityQuery.isError) {
    return (
      <ListErrorBanner
        message={userFacingApiError(availabilityQuery.error, "Could not verify driver repair availability")}
        onRetry={() => void availabilityQuery.refetch()}
      />
    );
  }

  return (
    <div className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700">
      <div className="font-semibold">{availabilityQuery.data?.blocker ?? "Driver has active repair work order"}</div>
      <div className="mt-1">
        {/* FAIL-U1: show the WO display_id and unit number. A dispatcher cannot act on a uuid. */}
        WO:{" "}
        <EntityLink
          kind="work_order"
          id={availabilityQuery.data?.work_order_id}
          label={entityLabel(availabilityQuery.data?.work_order_display_id, availabilityQuery.data?.work_order_id, "Work order")}
        />{" "}
        · Asset: {entityLabel(availabilityQuery.data?.asset_label, availabilityQuery.data?.asset_id, "Asset")}
      </div>
      <label className="mt-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={overrideRepairBlock}
          onChange={(event) => onOverrideRepairBlockChange(event.target.checked)}
        />
        Override repair block and continue assignment
      </label>
      {submitBlocked ? <div className="mt-1 font-semibold">Submit blocked until override is checked.</div> : null}
    </div>
  );
}
