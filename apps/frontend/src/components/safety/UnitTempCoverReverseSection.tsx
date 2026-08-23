import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "../shared/EntityLink";
import { driverSchedulerOfficeApi } from "../../api/driver-scheduler";
import { formatDateUS } from "../../lib/formatDate";
import { ListErrorState } from "../ListErrorState";

export function UnitTempCoverReverseSection({ operatingCompanyId, unitId }: { operatingCompanyId: string; unitId: string }) {
  const query = useQuery({
    queryKey: ["safety", "reverse", "temp-cover-unit", operatingCompanyId, unitId],
    queryFn: () => driverSchedulerOfficeApi.listTempAssignments(operatingCompanyId, { unit_id: unitId }),
    enabled: Boolean(operatingCompanyId && unitId),
  });
  const rows = query.data?.assignments ?? [];
  return <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="unit-temp-cover-reverse">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-900">Temporary Driver Coverage{rows.length ? ` (${rows.length})` : ""}</h3>
      <EntityLink kind="driver_scheduler_unit" id={unitId} label="Open Driver Scheduler" className="text-xs font-semibold text-slate-700 underline" />
    </div>
    {query.isLoading ? <p className="text-sm text-gray-500">Loading temporary coverage…</p> : null}
    {query.isError ? <ListErrorState status={0} message="Could not load temporary coverage for this unit." onRetry={() => void query.refetch()} /> : null}
    {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No active temporary driver coverage is linked to this unit.</p> : null}
    {rows.length ? <ul className="space-y-2">{rows.map((row) => <li key={row.id} className="rounded-sm border border-gray-200 p-2 text-xs text-slate-700">
      <span className="font-semibold">{row.primary_driver_name || "Primary driver"}</span>
      <span> → {row.cover_driver_name || "Cover driver"}</span>
      <div className="text-gray-500">{formatDateUS(row.start_date)} – {formatDateUS(row.end_date)}</div>
    </li>)}</ul> : null}
  </section>;
}
