import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../ListErrorState";
import { listHosViolations } from "../../api/safetyV64";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { useEffect, useState } from "react";
import { Button } from "../Button";

export function DriverHosViolationsReverseSection({ operatingCompanyId, driverId }: { operatingCompanyId: string; driverId: string }) {
  const pageSize = 25;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [operatingCompanyId, driverId]);
  const query = useQuery({
    queryKey: ["hos-violations", operatingCompanyId, "driver", driverId, page],
    enabled: Boolean(operatingCompanyId && driverId),
    queryFn: () => listHosViolations(operatingCompanyId, { driver_id: driverId, limit: pageSize, offset: (page - 1) * pageSize }),
  });
  const violations = query.isError ? [] : (query.data?.hos_violations ?? []);
  const total = query.isError ? 0 : query.data?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-gray-800">HOS violations{total ? ` (${total})` : ""}</h3>
      {query.isError ? <ListErrorState status={0} message="HOS violations could not be loaded." onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <p className="mt-2 text-sm text-gray-500">Loading HOS violations…</p> : null}
      {!query.isLoading && !query.isError && violations.length === 0 ? <p className="mt-2 text-sm text-gray-500">No HOS violations are linked to this driver.</p> : null}
      <div className="mt-2 space-y-2">
        {violations.map((row) => <div key={String(row.id)} className="text-sm"><span className="font-medium">{String(row.violation_type)}</span> · {new Date(String(row.occurred_at)).toLocaleString()}{row.related_load_id ? <> · <EntityLink kind="load" id={String(row.related_load_id)} label={entityLabel(row.related_load_number, row.related_load_id, "Load")} /></> : null}</div>)}
      </div>
      {!query.isError && total > pageSize ? <div className="mt-2 flex items-center justify-end gap-2 text-xs" data-testid="driver-hos-violations-reverse-pager">
        <Button size="sm" variant="secondary" disabled={page <= 1 || query.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous violations</Button>
        <span className="text-slate-600">Page {page} of {pageCount} · {total} violations</span>
        <Button size="sm" variant="secondary" disabled={page >= pageCount || query.isFetching} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next violations</Button>
      </div> : null}
    </section>
  );
}
