import { useState } from "react";
import { patchAssignDriver } from "../../api/dispatch";
import { EntityPicker } from "../parity/EntityPicker";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
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
      <div className="flex min-w-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
        {driverId ? (
          <EntityLinkOrTombstone
            kind="driver"
            id={driverId}
            name={displayLabel}
            noun="Driver"
            className="single-line-name min-w-0 flex-1 hover:underline"
            data-testid={`inline-driver-link-${loadId}`}
          />
        ) : (
          <span className="single-line-name min-w-0 flex-1 text-slate-500">Unassigned</span>
        )}
        <button
          type="button"
          className="shrink-0 rounded-sm px-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          data-testid={`inline-driver-picker-${loadId}`}
          onClick={() => {
            setOpen(true);
            setError(null);
          }}
        >
          {driverId ? "Change" : "Assign"}
        </button>
        {error ? <span className="rounded-sm bg-red-100 px-1 text-[10px] text-red-700">{error}</span> : null}
      </div>
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
        onChange={async (next, option) => {
          if (!next) return;
          const label = option?.label ?? (driverId === next ? displayLabel : "Driver unavailable");
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
