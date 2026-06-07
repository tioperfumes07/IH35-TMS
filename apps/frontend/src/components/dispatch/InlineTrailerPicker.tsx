import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listUnits } from "../../api/mdata";
import { patchAssignTrailer } from "../../api/dispatch";
import { Combobox } from "../shared/Combobox";
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

  const trailersQuery = useQuery({
    queryKey: ["dispatch", "inline-trailers", operatingCompanyId],
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const options = useMemo(() => {
    const rows = trailersQuery.data?.units ?? [];
    return rows
      .filter((row) => (row as { equipment_kind?: string }).equipment_kind === "trailer")
      .map((row) => {
        const trailer = row as { id: string; unit_number?: string; display_id?: string };
        return {
          value: trailer.id,
          label: trailer.unit_number ?? trailer.display_id ?? trailer.id.slice(0, 8),
        };
      });
  }, [trailersQuery.data?.units]);

  if (!open) {
    return (
      <button
        type="button"
        className="code-cell w-full text-left text-gray-800 hover:text-blue-700"
        data-testid={`inline-trailer-picker-${loadId}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
          setError(null);
        }}
      >
        {displayLabel || "—"}
        {error ? <span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-700">{error}</span> : null}
      </button>
    );
  }

  return (
    <div className="relative z-20 min-w-[180px]" onClick={(event) => event.stopPropagation()}>
      <Combobox
        options={options}
        value={trailerId}
        placeholder="Type trailer…"
        onChange={async (next) => {
          if (!next) return;
          const label = options.find((opt) => opt.value === next)?.label ?? next.slice(0, 8);
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
