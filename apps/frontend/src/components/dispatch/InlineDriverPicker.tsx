import { useState } from "react";
import { entityLabel } from "../../lib/entity-label";
import { patchAssignDriver } from "../../api/dispatch";
import { EntityPicker } from "../parity/EntityPicker";
import { optimisticPatch } from "../../lib/optimisticPatch";

type Props = {
  loadId: string;
  operatingCompanyId: string;
  driverId: string | null;
  displayLabel: string;
  onAssigned: (next: { driverId: string; label: string }) => void;
  onRollback: () => void;
};

export function InlineDriverPicker({ loadId, operatingCompanyId, driverId, displayLabel, onAssigned, onRollback }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className="single-line-name w-full text-left hover:text-slate-700"
        data-testid={`inline-driver-picker-${loadId}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
          setError(null);
        }}
      >
        <span title={displayLabel || undefined}>{displayLabel || "Unassigned"}</span>
        {error ? <span className="ml-1 rounded-sm bg-red-100 px-1 text-[10px] text-red-700">{error}</span> : null}
      </button>
    );
  }

  return (
    <div className="relative z-20 min-w-[200px]" onClick={(event: { stopPropagation(): void }) => event.stopPropagation()}>
      <EntityPicker
        kind="driver"
        operatingCompanyId={operatingCompanyId}
        value={driverId}
        enabled={open}
        placeholder="Type driver…"
        allowClear={false}
        className="h-8 w-full text-xs"
        onChange={async (next) => {
          if (!next) return;
          const label = displayLabel && driverId === next ? displayLabel : entityLabel(null, next, "Driver");
          const prior = { driverId, label: displayLabel };
          const result = await optimisticPatch({
            applyOptimistic: () => onAssigned({ driverId: next, label }),
            rollback: () => {
              onRollback();
              onAssigned({ driverId: prior.driverId ?? "", label: prior.label });
            },
            request: () =>
              patchAssignDriver(loadId, {
                operating_company_id: operatingCompanyId,
                driver_uuid: next,
              }),
            onError: (message) => setError(message.slice(0, 40)),
          });
          if (result.ok) {
            setError(null);
            setOpen(false);
          }
        }}
      />
    </div>
  );
}
