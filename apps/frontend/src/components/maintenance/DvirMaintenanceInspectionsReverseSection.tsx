import { useQuery } from "@tanstack/react-query";
import { listMaintenanceInspections } from "../../api/maintenance";
import { formatDateUS } from "../../lib/formatDate";
import { humanizeEnumLabel } from "../../lib/humanizeEnumLabel";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";

export function DvirMaintenanceInspectionsReverseSection({
  operatingCompanyId,
  dvirSubmissionId,
}: {
  operatingCompanyId: string;
  dvirSubmissionId: string;
}) {
  const query = useQuery({
    queryKey: ["maintenance", "inspections", "dvir", operatingCompanyId, dvirSubmissionId],
    queryFn: () => listMaintenanceInspections(operatingCompanyId, { dvir_submission_id: dvirSubmissionId }),
    enabled: Boolean(operatingCompanyId && dvirSubmissionId),
  });
  const rows = query.data?.rows ?? [];

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="dvir-maintenance-inspections-reverse">
      <h2 className="text-sm font-semibold text-slate-900">
        Maintenance inspections
        {rows.length ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
      </h2>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {query.isError ? (
        <ListErrorState
          status={0}
          message="Could not load linked maintenance inspections."
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No maintenance inspection links this DVIR.</p> : null}
      {rows.map((inspection) => (
        <div key={inspection.id} className="px-2 py-1.5 text-sm">
          <EntityLink
            kind="maintenance_inspection"
            id={inspection.id}
            label={humanizeEnumLabel(inspection.inspection_type_label ?? inspection.inspection_type)}
            className="font-medium text-slate-700"
          />
          <span className="ml-2 text-xs text-gray-600">
            {formatDateUS(inspection.inspection_date ?? inspection.scheduled_date)} · {inspection.status}
          </span>
        </div>
      ))}
    </section>
  );
}
