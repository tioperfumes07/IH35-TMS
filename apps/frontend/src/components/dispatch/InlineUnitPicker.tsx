import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listUnits } from "../../api/mdata";
import { patchAssignUnit } from "../../api/dispatch";
import { ApiError } from "../../api/client";
import { Combobox } from "../shared/Combobox";
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
  // SAF-B29: never silent listUnits(limit:500) — type-ahead re-queries so units past page 1 stay assignable.
  const [unitSearch, setUnitSearch] = useState("");

  const unitsQuery = useQuery({
    queryKey: ["dispatch", "inline-units", operatingCompanyId, unitSearch],
    queryFn: () =>
      listUnits({
        operating_company_id: operatingCompanyId,
        limit: 200,
        search: unitSearch || undefined,
      }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const options = useMemo(() => {
    const rows = unitsQuery.data?.units ?? [];
    return rows
      .filter((row) => {
        const u = row as { is_dispatch_blocked?: boolean; is_oos?: boolean };
        return !u.is_dispatch_blocked && !u.is_oos;
      })
      .map((row) => {
        const unit = row as { id: string; unit_number?: string; display_id?: string };
        return {
          value: unit.id,
          label: unit.unit_number ?? unit.display_id ?? unit.id.slice(0, 8),
        };
      });
  }, [unitsQuery.data?.units]);

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
      <Combobox
        options={options}
        value={unitId}
        placeholder={unitsQuery.isLoading ? "Loading units…" : "Type unit…"}
        onSearch={setUnitSearch}
        onChange={async (next) => {
          if (!next) return;
          const label = options.find((opt) => opt.value === next)?.label ?? next.slice(0, 8);
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
