// @ModalNoX — inline repair-block panel, not a dismissible overlay dialog
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDriverLoadAvailability } from "../../api/dispatch";

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
  const submitBlocked = repairBlocked && !overrideRepairBlock;

  useEffect(() => {
    onSubmitBlockedChange?.(submitBlocked);
  }, [onSubmitBlockedChange, submitBlocked]);

  if (!selectedDriverId || !repairBlocked) return null;

  return (
    <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <div className="font-semibold">{availabilityQuery.data?.blocker ?? "Driver has active repair work order"}</div>
      <div className="mt-1">
        WO: {availabilityQuery.data?.work_order_id ?? "unknown"} · Asset: {availabilityQuery.data?.asset_id ?? "unknown"}
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
