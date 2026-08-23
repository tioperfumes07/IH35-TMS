import { useQuery } from "@tanstack/react-query";
import { listSevereRepairEstimates } from "../../api/maintenance";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";

export function UnitSevereRepairsReverseSection({ operatingCompanyId, unitId }: { operatingCompanyId: string; unitId: string }) {
  const query = useQuery({
    queryKey: ["maintenance", "reverse", "severe-repairs", operatingCompanyId, unitId],
    queryFn: () => listSevereRepairEstimates(operatingCompanyId, { unit_id: unitId }),
    enabled: Boolean(operatingCompanyId && unitId),
  });
  const rows = query.data?.data ?? [];
  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="unit-severe-repairs-reverse">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Open Severe Repairs{rows.length ? ` (${rows.length})` : ""}</h3>
        <EntityLink kind="severe_repairs_unit" id={unitId} label="Open Severe Repairs" className="text-xs font-semibold text-slate-700 underline" />
      </div>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading severe repairs…</p> : null}
      {query.isError ? <ListErrorState status={0} message="Could not load severe repairs for this unit." onRetry={() => void query.refetch()} /> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No open severe repairs are linked to this unit.</p> : null}
      {rows.length ? <ul className="space-y-2">{rows.map((row) => (
        <li key={row.id} className="rounded-sm border border-gray-200 p-2 text-xs text-slate-700">
          {row.trigger_wo_id ? (
            <EntityLink
              kind="work_order"
              id={row.trigger_wo_id}
              label={row.description || "Severe repair estimate"}
              className="font-semibold underline"
            />
          ) : (
            <EntityLink
              kind="severe_repairs_unit"
              id={unitId}
              label={row.description || "Severe repair estimate"}
              className="font-semibold underline"
            />
          )}
          <div className="text-gray-500">{row.damage_severity} · ${(row.estimated_total_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </li>
      ))}</ul> : null}
    </section>
  );
}
