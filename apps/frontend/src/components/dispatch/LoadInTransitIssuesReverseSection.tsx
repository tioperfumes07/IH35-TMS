import { useQuery } from "@tanstack/react-query";
import { listDispatchIntransitIssues } from "../../api/dispatch";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

type Props = { operatingCompanyId: string; loadId: string; "data-testid"?: string };

export function LoadInTransitIssuesReverseSection({ operatingCompanyId, loadId, "data-testid": testId }: Props) {
  const query = useQuery({
    queryKey: ["dispatch", "reverse", "intransit-issues", "load", operatingCompanyId, loadId],
    queryFn: () => listDispatchIntransitIssues(operatingCompanyId, { load_id: loadId }),
    enabled: Boolean(operatingCompanyId && loadId),
  });
  const rows = query.data?.issues ?? [];

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">In-Transit Issues{rows.length ? ` (${rows.length})` : ""}</h3>
        <EntityLink kind="intransit_issues_load" id={loadId} label="Open issue queue" className="text-xs font-semibold text-slate-700 underline" />
      </div>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading in-transit issues…</p> : null}
      {query.isError ? <p className="text-sm text-red-600">Could not load in-transit issues for this load.</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No in-transit issues linked to this load.</p> : null}
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="text-sm text-slate-700">
              <span className="font-semibold">{row.issue_category}</span>
              <span className="text-gray-500"> · {row.severity} · {row.status} · {formatDateTimeUS(row.reported_at)}</span>
              <div className="text-xs text-gray-600">{row.issue_description}</div>
              <div className="flex gap-3 text-xs">
                <EntityLink kind="driver" id={row.driver_id ?? undefined} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />
                <EntityLink kind="unit" id={row.unit_id ?? undefined} label={entityLabel(row.unit_number, row.unit_id, "Unit")} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
