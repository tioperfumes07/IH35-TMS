import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../ListErrorState";
import { listHosViolations } from "../../api/safetyV64";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

export function DriverHosViolationsReverseSection({ operatingCompanyId, driverId }: { operatingCompanyId: string; driverId: string }) {
  const query = useQuery({
    queryKey: ["hos-violations", operatingCompanyId, "driver", driverId],
    enabled: Boolean(operatingCompanyId && driverId),
    queryFn: () => listHosViolations(operatingCompanyId, { driver_id: driverId }),
  });
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-gray-800">HOS violations</h3>
      {query.isError ? <ListErrorState status={0} message="HOS violations could not be loaded." onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <p className="mt-2 text-sm text-gray-500">Loading HOS violations…</p> : null}
      {!query.isLoading && !query.isError && (query.data?.hos_violations ?? []).length === 0 ? <p className="mt-2 text-sm text-gray-500">No HOS violations are linked to this driver.</p> : null}
      <div className="mt-2 space-y-2">
        {(query.data?.hos_violations ?? []).map((row) => <div key={String(row.id)} className="text-sm"><span className="font-medium">{String(row.violation_type)}</span> · {new Date(String(row.occurred_at)).toLocaleString()}{row.related_load_id ? <> · <EntityLink kind="load" id={String(row.related_load_id)} label={entityLabel(row.related_load_number, row.related_load_id, "Load")} /></> : null}</div>)}
      </div>
    </section>
  );
}
