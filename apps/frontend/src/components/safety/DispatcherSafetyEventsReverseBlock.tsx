import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../ListErrorState";
import { listDispatcherSafetyEventsByRelatedEntity } from "../../api/identity";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";
import { formatUsd } from "../../lib/money";
import { EntityLink } from "../shared/EntityLink";

type Props = {
  operatingCompanyId: string;
  related: "load" | "customer" | "driver";
  entityId: string;
  "data-testid"?: string;
};

export function DispatcherSafetyEventsReverseBlock({
  operatingCompanyId,
  related,
  entityId,
  "data-testid": testId = "dispatcher-safety-events-reverse",
}: Props) {
  const query = useQuery({
    queryKey: ["dispatcher-safety-events", "reverse", related, operatingCompanyId, entityId],
    queryFn: () =>
      listDispatcherSafetyEventsByRelatedEntity(operatingCompanyId, {
        [`related_${related}_id`]: entityId,
      } as { related_load_id: string } | { related_customer_id: string } | { related_driver_id: string }),
    enabled: Boolean(operatingCompanyId && entityId),
  });
  const events = query.data?.events ?? [];

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <h3 className="text-sm font-semibold text-slate-900">
        Dispatcher safety events
        {events.length ? <span className="ml-2 text-xs font-normal text-gray-600">({events.length})</span> : null}
      </h3>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {query.isError ? <ListErrorState status={0} message="Could not load dispatcher safety events." onRetry={() => void query.refetch()} /> : null}
      {!query.isLoading && !query.isError && events.length === 0 ? <p className="text-sm text-gray-500">None linked.</p> : null}
      {events.map((event) => (
        <article key={event.id} className="px-2 py-1.5 text-sm">
          <div className="font-medium text-slate-900">{event.summary}</div>
          <div className="text-xs text-gray-600">
            {formatDateUS(event.event_date)} · {event.severity} · Dispatcher{" "}
            <EntityLink
              kind="user"
              id={event.dispatcher_user_id}
              label={entityLabel(event.dispatcher_email, event.dispatcher_user_id, "User")}
            />
            {event.cost_amount !== null ? ` · Impact ${formatUsd(event.cost_amount)} · Recovery ${event.cost_recovery_status ?? "pending"}` : ""}
          </div>
        </article>
      ))}
    </section>
  );
}
