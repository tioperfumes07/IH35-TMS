import { useState } from "react";
import { patchAssignTrailer } from "../../api/dispatch";
import { EntityPicker } from "../parity/EntityPicker";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
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
      <div className="flex min-w-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
        {trailerId ? (
          <EntityLinkOrTombstone
            kind="trailer"
            id={trailerId}
            name={displayLabel}
            noun="Trailer"
            className="code-cell min-w-0 flex-1 text-gray-800 hover:underline"
            data-testid={`inline-trailer-link-${loadId}`}
          />
        ) : (
          <span className="code-cell min-w-0 flex-1 text-slate-500">—</span>
        )}
        <button
          type="button"
          className="shrink-0 rounded-sm px-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          data-testid={`inline-trailer-picker-${loadId}`}
          onClick={() => {
            setOpen(true);
            setError(null);
          }}
        >
          {trailerId ? "Change" : "Assign"}
        </button>
        {error ? <span className="rounded-sm bg-red-100 px-1 text-[10px] text-red-700">{error}</span> : null}
      </div>
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
        onChange={async (next, option) => {
          if (!next) return;
          const label = option?.label ?? (trailerId === next ? displayLabel : "Trailer unavailable");
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
