import { useQuery } from "@tanstack/react-query";
import { listMaintenancePmSchedules } from "../../api/maintenance";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorBanner } from "../shared/ListErrorBanner";

export function UnitPmSchedulesReverseSection({
  operatingCompanyId,
  unitId,
}: {
  operatingCompanyId: string;
  unitId: string;
}) {
  const query = useQuery({
    queryKey: ["maintenance", "pm-schedule", "unit", operatingCompanyId, unitId],
    queryFn: () => listMaintenancePmSchedules(operatingCompanyId, { unit_id: unitId }),
    enabled: Boolean(operatingCompanyId && unitId),
  });
  const rows = query.isError ? [] : (query.data?.rows ?? []);
  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="vehicle-profile-pm-schedules">
      <h2 className="text-sm font-semibold text-slate-900">PM schedules{rows.length ? ` (${rows.length})` : ""}</h2>
      {query.isError ? <ListErrorBanner message="Couldn't load PM schedules for this unit." onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No PM schedules linked to this unit.</p> : null}
      {rows.map((row) => (
        <div key={row.id} className="px-2 py-1.5 text-sm">
          <EntityLink
            kind="pm_schedule"
            id={row.id}
            label={row.pm_type}
            className="font-semibold text-slate-700 underline"
          />
          <span className="ml-2 text-xs text-gray-600">
            {row.interval_value} {row.interval_kind} · {row.status}
          </span>
        </div>
      ))}
    </section>
  );
}
