import { useState } from "react";
import { patchAssignUnit } from "../../api/dispatch";
import { userFacingApiError } from "../../lib/api-error-message";
import { EntityPicker } from "../parity/EntityPicker";
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

  if (!open) {
    return (
      <div className="flex min-w-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
        {unitId ? (
          <EntityLinkOrTombstone
            kind="unit"
            id={unitId}
            name={displayLabel}
            noun="Unit"
            className="code-cell min-w-0 flex-1 font-medium text-gray-800 hover:underline"
            data-testid={`inline-unit-link-${loadId}`}
          />
        ) : (
          <span className="code-cell min-w-0 flex-1 text-slate-500">—</span>
        )}
        <button
          type="button"
          className="shrink-0 rounded-sm px-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          data-testid={`inline-unit-picker-${loadId}`}
          onClick={() => {
            setOpen(true);
            setError(null);
          }}
        >
          {unitId ? "Change" : "Assign"}
        </button>
        {error ? <span className="rounded-sm bg-red-100 px-1 text-[10px] text-red-700">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="relative z-20 min-w-[180px]" onClick={(event: { stopPropagation(): void }) => event.stopPropagation()}>
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
                throw new Error(assignUnitErrorMessage(err));
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
