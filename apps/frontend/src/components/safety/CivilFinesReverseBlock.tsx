import { useQuery } from "@tanstack/react-query";
import { getSafetyFines } from "../../api/safety";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";

export function CivilFinesReverseBlock({ companyId, related, entityId }: { companyId: string; related: "load" | "unit"; entityId: string }) {
  const query = useQuery({
    queryKey: ["safety-fines", "reverse", related, companyId, entityId],
    enabled: Boolean(companyId) && Boolean(entityId),
    queryFn: () => getSafetyFines(companyId, related === "load" ? { related_load_id: entityId } : { related_unit_id: entityId }),
  });
  const rows = query.data?.fines ?? [];
  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={`${related}-civil-fines-reverse`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Civil fines{rows.length ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
        </h3>
        <EntityLink
          kind={related === "load" ? "safety_fines_load" : "safety_fines_unit"}
          id={entityId}
          label="Open Fines"
          className="text-xs font-semibold text-slate-700 underline"
        />
      </div>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {query.isError ? (
        <ListErrorState
          status={0}
          message={userFacingApiError(query.error, `Could not load fines linked to this ${related}.`)}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No civil fines linked to this {related}.</p> : null}
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((row) => {
            const id = String(row.id ?? "");
            return (
              <li key={id} className="text-sm text-slate-700">
                <EntityLink kind="safety_fine" id={id} label={entityLabel(String(row.violation_description ?? ""), id, "Fine")} />
                <span className="ml-2 text-xs text-gray-500">
                  {row.issued_date ? formatDateUS(String(row.issued_date)) : "—"}
                  {row.subject_driver_name ? ` · ${String(row.subject_driver_name)}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
