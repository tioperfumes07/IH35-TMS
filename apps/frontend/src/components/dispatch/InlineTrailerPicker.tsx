import { useState } from "react";
import { entityLabel } from "../../lib/entity-label";
import { patchAssignTrailer } from "../../api/dispatch";
import { EntityPicker } from "../parity/EntityPicker";
import { optimisticPatch } from "../../lib/optimisticPatch";

type Props = {
  loadId: string;
  operatingCompanyId: string;
  trailerId: string | null;
  displayLabel: string;
  onAssigned: (next: { trailerId: string; label: string }) => void;
  onRollback: () => void;
};

export function InlineTrailerPicker({ loadId, operatingCompanyId, trailerId, displayLabel, onAssigned, onRollback }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className="code-cell w-full text-left text-gray-800 hover:text-slate-700"
        data-testid={`inline-trailer-picker-${loadId}`}
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
        kind="trailer"
        operatingCompanyId={operatingCompanyId}
        value={trailerId}
        enabled={open}
        placeholder="Type trailer…"
        allowClear={false}
        className="h-8 w-full text-xs"
        onChange={async (next) => {
          if (!next) return;
          const label = entityLabel(null, next, "Trailer");
          const prior = { trailerId, label: displayLabel };
          const result = await optimisticPatch({
            applyOptimistic: () => onAssigned({ trailerId: next, label }),
            rollback: () => {
              onRollback();
              onAssigned({ trailerId: prior.trailerId ?? "", label: prior.label });
            },
            request: () =>
              patchAssignTrailer(loadId, {
                operating_company_id: operatingCompanyId,
                trailer_uuid: next,
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
