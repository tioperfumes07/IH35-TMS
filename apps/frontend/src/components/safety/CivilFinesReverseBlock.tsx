import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSafetyFines } from "../../api/safety";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import { Button } from "../Button";

export function CivilFinesReverseBlock({ companyId, related, entityId }: { companyId: string; related: "load" | "unit"; entityId: string }) {
  const pageSize = 25;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [companyId, related, entityId]);
  const query = useQuery({
    queryKey: ["safety-fines", "reverse", related, companyId, entityId, page],
    enabled: Boolean(companyId) && Boolean(entityId),
    queryFn: () => getSafetyFines(companyId, {
      ...(related === "load" ? { related_load_id: entityId } : { related_unit_id: entityId }),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
  });
  const rows = query.data?.fines ?? [];
  const total = query.isError ? 0 : query.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={`${related}-civil-fines-reverse`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Civil fines{total ? <span className="ml-2 text-xs font-normal text-gray-600">({total})</span> : null}
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
      {!query.isError && total > pageSize ? (
        <div className="flex items-center justify-end gap-2 text-xs" data-testid={`${related}-civil-fines-server-pager`}>
          <Button size="sm" variant="secondary" disabled={page <= 1 || query.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous fines</Button>
          <span className="text-slate-600">Page {page} of {pageCount} · {total} fines</span>
          <Button size="sm" variant="secondary" disabled={page >= pageCount || query.isFetching} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next fines</Button>
        </div>
      ) : null}
    </div>
  );
}
