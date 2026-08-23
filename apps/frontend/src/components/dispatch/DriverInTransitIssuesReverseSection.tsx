import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../ListErrorState";
import { listDispatchIntransitIssues } from "../../api/dispatch";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

export function DriverInTransitIssuesReverseSection({ operatingCompanyId, driverId }: { operatingCompanyId: string; driverId: string }) {
  const query = useQuery({
    queryKey: ["dispatch", "reverse", "intransit-issues", "driver", operatingCompanyId, driverId],
    queryFn: () => listDispatchIntransitIssues(operatingCompanyId, { driver_id: driverId }),
    enabled: Boolean(operatingCompanyId && driverId),
  });
  const rows = query.data?.issues ?? [];

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="driver-intransit-issues-reverse">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">In-Transit Issues{rows.length ? ` (${rows.length})` : ""}</h3>
        <EntityLink kind="intransit_issues_driver" id={driverId} label="Open issue queue" className="text-xs font-semibold text-slate-700 underline" />
      </div>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading in-transit issues…</p> : null}
      {query.isError ? <ListErrorState status={0} message="Could not load in-transit issues for this driver." onRetry={() => void query.refetch()} /> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No in-transit issues linked to this driver.</p> : null}
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="text-sm text-slate-700">
              <EntityLinkOrTombstone kind="load" id={row.load_id ?? undefined} name={row.load_number} noun="Load" />
              <span className="text-gray-500"> · {row.issue_category} · {row.severity} · {row.status} · {formatDateTimeUS(row.reported_at)}</span>
              <div className="text-xs text-gray-600">{row.issue_description}</div>
              <EntityLinkOrTombstone kind="unit" id={row.unit_id ?? undefined} name={row.unit_number} noun="Unit" />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
