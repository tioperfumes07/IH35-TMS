import { useQuery } from "@tanstack/react-query";
import { listMaintenanceInspections } from "../../api/maintenance";
import { formatDateUS } from "../../lib/formatDate";
import { humanizeEnumLabel } from "../../lib/humanizeEnumLabel";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorBanner } from "../shared/ListErrorBanner";

export function UnitMaintenanceInspectionsReverseSection({
  operatingCompanyId,
  unitId,
  "data-testid": testId = "unit-maintenance-inspections-reverse",
}: {
  operatingCompanyId: string;
  unitId: string;
  "data-testid"?: string;
}) {
  const query = useQuery({
    queryKey: ["maintenance", "inspections", "unit", operatingCompanyId, unitId],
    queryFn: () => listMaintenanceInspections(operatingCompanyId, { unit_id: unitId }),
    enabled: Boolean(operatingCompanyId && unitId),
  });
  const rows = query.isError ? [] : (query.data?.rows ?? []);
  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <h2 className="text-sm font-semibold text-slate-900">Maintenance inspections{rows.length ? ` (${rows.length})` : ""}</h2>
      {query.isError ? <ListErrorBanner message="Couldn't load maintenance inspections for this unit." onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No maintenance inspections linked to this unit.</p> : null}
      {rows.map((row) => (
        <div key={row.id} className="px-2 py-1.5 text-sm">
          <EntityLink kind="maintenance_inspection" id={row.id} label={humanizeEnumLabel(row.inspection_type_label ?? row.inspection_type)} />
          <span className="ml-2 text-xs text-gray-600">{formatDateUS(row.inspection_date ?? row.scheduled_date)} · {row.status}</span>
        </div>
      ))}
    </section>
  );
}
