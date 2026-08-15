import { useState } from "react";
import { patchAssignUnit } from "../../api/dispatch";
import { userFacingApiError } from "../../lib/api-error-message";
import { EntityPicker } from "../parity/EntityPicker";
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
      <button
        type="button"
        className="code-cell w-full text-left font-medium text-gray-800 hover:text-slate-700"
        data-testid={`inline-unit-picker-${loadId}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
          setError(null);
        }}
      >
        {displayLabel || "—"}
        {error ? <span className="ml-1 rounded-sm bg-red-100 px-1 text-[10px] text-red-700">{error}</span> : null}
      </button>
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
