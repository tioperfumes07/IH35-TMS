import { useState } from "react";
import { patchAssignUnit } from "../../api/dispatch";
import { userFacingApiError } from "../../lib/api-error-message";
import { EntityPicker } from "../EntityPicker";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { optimisticPatch } from "../../lib/optimisticPatch";

type Props = {
  loadId: string;
  operatingCompanyId: string;
  unitId: string | null;
  displayLabel: string;
  onAssigned: (next: { unitId: string; label: string }) => void;
  onRollback: () => void;
};

export function InlineUnitPicker({ loadId, operatingCompanyId, unitId, displayLabel, onAssigned, onRollback }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setOpen(true);
    setError(null);
  };

  if (!open) {
    return (
      <div className="flex min-w-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
        {unitId ? (
          <EntityLinkOrTombstone
            kind="unit"
            id={unitId}
            name={displayLabel}
            noun="Unit"
            className="code-cell min-w-0 flex-1 cursor-pointer font-medium text-gray-800 hover:underline"
            data-testid={`inline-unit-picker-${loadId}`}
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
            aria-label={`Assign unit for load ${loadId}`}
            className="code-cell min-w-0 flex-1 cursor-pointer text-slate-500 hover:underline"
            data-testid={`inline-unit-picker-${loadId}`}
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
    <div className="relative z-20 min-w-[180px]" onClick={(event: { stopPropagation(): void }) => event.stopPropagation()}>
      {/* DISPATCH-F-QUICKSAVE-ASSIGN-500 (2026-08-21): `error` was only ever rendered in the !open
          branch above, but a failed onChange leaves `open` true (no setOpen(false) on failure) so
          the picker stays open for retry — meaning any assignment failure was completely silent to
          the operator. Surfacing it here too so a rejected pick (OOS, dispatch-blocked, or any other
          server error) is actually visible while the picker is still open. */}
      {error ? <p className="mb-1 rounded-sm bg-red-100 px-1 py-0.5 text-xs text-red-700">{error}</p> : null}
      <EntityPicker
        kind="unit"
        operatingCompanyId={operatingCompanyId}
        value={unitId}
        enabled={open && Boolean(operatingCompanyId)}
        placeholder="Type unit…"
        allowClear={false}
        dataTestId={`inline-unit-picker-${loadId}`}
        onChange={async (next, option) => {
          if (!next) return;
          const label = option?.label ?? (unitId === next ? displayLabel : "Unit unavailable");
          const prior = { unitId, label: displayLabel };
          const result = await optimisticPatch({
            applyOptimistic: () => onAssigned({ unitId: next, label }),
            rollback: () => {
              onRollback();
              onAssigned({ unitId: prior.unitId ?? "", label: prior.label });
            },
            request: async () => {
              try {
                return await patchAssignUnit(loadId, {
                  operating_company_id: operatingCompanyId,
                  unit_uuid: next,
                });
              } catch (err) {
                throw new Error(assignUnitErrorMessage(err), { cause: err });
              }
            },
            onError: (message) => setError(message.slice(0, 80)),
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

function assignUnitErrorMessage(error: unknown): string {
  return userFacingApiError(error, "Assign failed");
}
