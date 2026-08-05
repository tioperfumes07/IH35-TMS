import { useState } from "react";
import { patchAssignUnit } from "../../api/dispatch";
import { ApiError } from "../../api/client";
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
      {/*
        SAF-B29 / picker law: EntityPicker kind=unit (serverSearch) — never Combobox+listUnits(limit).
        OOS / is_dispatch_blocked: backend assign-unit throws E_UNIT_OOS / hard_block (verify-dispatch-oos-unit-block).
      */}
      <EntityPicker
        kind="unit"
        operatingCompanyId={operatingCompanyId}
        value={unitId}
        enabled={open}
        placeholder="Type unit…"
        allowClear={false}
        className="h-8 w-full text-xs"
        onChange={async (next) => {
          if (!next) return;
          const label = displayLabel && unitId === next ? displayLabel : next.slice(0, 8);
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
  if (error instanceof ApiError) {
    const data = (error.data as { error?: string; message?: string } | undefined) ?? {};
    return String(data.message ?? data.error ?? `Assign failed (${error.status})`);
  }
  return error instanceof Error ? error.message : "Update failed";
}
