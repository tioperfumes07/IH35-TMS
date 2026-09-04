import { useState } from "react";
import { patchAssignDriver } from "../../api/dispatch";
import { EntityPicker } from "../EntityPicker";
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

  const startEdit = () => {
    setOpen(true);
    setError(null);
  };

  if (!open) {
    return (
      <div className="flex min-w-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
        {driverId ? (
          <EntityLinkOrTombstone
            kind="driver"
            id={driverId}
            name={displayLabel}
            noun="Driver"
            className="single-line-name min-w-0 flex-1 cursor-pointer text-slate-700 hover:underline"
            data-testid={`inline-driver-picker-${loadId}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              startEdit();
            }}
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Assign driver for load ${loadId}`}
            className="single-line-name min-w-0 flex-1 cursor-pointer text-slate-500 hover:underline"
            data-testid={`inline-driver-picker-${loadId}`}
            onClick={startEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                startEdit();
              }
            }}
          >
            —
          </span>
        )}
        {error ? <span className="rounded-sm bg-red-100 px-1 text-xs text-red-700">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="relative z-20 min-w-[200px]" onClick={(event: { stopPropagation(): void }) => event.stopPropagation()}>
      {/* DISPATCH-F-QUICKSAVE-ASSIGN-500 (2026-08-21): see InlineUnitPicker's twin comment — `error`
          was only ever rendered in the !open branch above, but a failed onChange leaves `open` true,
          so a rejected pick was completely silent. Surfacing it here too. */}
      {error ? <p className="mb-1 rounded-sm bg-red-100 px-1 py-0.5 text-xs text-red-700">{error}</p> : null}
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
