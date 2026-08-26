import { useQuery } from "@tanstack/react-query";
import { listSafetyEventLog } from "../../api/safety";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";

export function SafetyEventsReverseBlock({ companyId, subject, entityId }: { companyId: string; subject: "driver" | "unit"; entityId: string }) {
  const query = useQuery({
    queryKey: ["safety", "events-log", "reverse", subject, companyId, entityId],
    enabled: Boolean(companyId) && Boolean(entityId),
    queryFn: () => listSafetyEventLog(companyId, subject === "driver" ? { subject_driver_id: entityId } : { subject_unit_id: entityId }),
  });
  const rows = query.isError ? [] : query.data?.events ?? [];
  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={`${subject}-safety-events-reverse`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Safety events{rows.length ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
        </h3>
        <EntityLink
          kind={subject === "driver" ? "safety_events_driver" : "safety_events_unit"}
          id={entityId}
          label="Open Safety Events"
          className="text-xs font-semibold text-slate-700 underline"
        />
      </div>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {query.isError ? (
        <ListErrorState
          status={0}
          message={userFacingApiError(query.error, `Could not load safety events for this ${subject}.`)}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No safety events linked to this {subject}.</p> : null}
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="text-sm text-slate-700">
              <EntityLink kind="safety_event" id={row.id} label={entityLabel(row.title, row.id, "Safety event")} />
              <span className="ml-2 text-xs text-gray-500">
                {formatDateUS(row.occurred_at)} · {row.severity} · {row.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
