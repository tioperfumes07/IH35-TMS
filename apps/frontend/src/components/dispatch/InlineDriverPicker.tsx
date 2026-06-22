import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDrivers } from "../../api/mdata";
import { patchAssignDriver } from "../../api/dispatch";
import { Combobox } from "../shared/Combobox";
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

  const driversQuery = useQuery({
    queryKey: ["dispatch", "inline-drivers", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, status: "Active" }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const options = useMemo(() => {
    const rows = driversQuery.data?.drivers ?? [];
    return rows.map((row) => ({
      value: row.id,
      label: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || row.id.slice(0, 8),
    }));
  }, [driversQuery.data?.drivers]);

  if (!open) {
    return (
      <button
        type="button"
        className="single-line-name w-full text-left hover:text-slate-700"
        data-testid={`inline-driver-picker-${loadId}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
          setError(null);
        }}
      >
        <span title={displayLabel || undefined}>{displayLabel || "Unassigned"}</span>
        {error ? <span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-700">{error}</span> : null}
      </button>
    );
  }

  return (
    <div className="relative z-20 min-w-[200px]" onClick={(event) => event.stopPropagation()}>
      <Combobox
        options={options}
        value={driverId}
        placeholder="Type driver…"
        onChange={async (next) => {
          if (!next) return;
          const label = options.find((opt) => opt.value === next)?.label ?? next.slice(0, 8);
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
