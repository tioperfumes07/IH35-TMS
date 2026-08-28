import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  const pageSize = 25;
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [operatingCompanyId, related, entityId]);
  const query = useQuery({
    queryKey: ["dispatcher-safety-events", "reverse", related, operatingCompanyId, entityId, page],
    queryFn: () =>
      listDispatcherSafetyEventsByRelatedEntity(operatingCompanyId, {
        [`related_${related}_id`]: entityId,
      } as { related_load_id: string } | { related_customer_id: string } | { related_driver_id: string }, {
        limit: pageSize,
        offset: page * pageSize,
      }),
    enabled: Boolean(operatingCompanyId && entityId),
  });
  const events = query.isError ? [] : query.data?.events ?? [];
  const totalCount = query.isError ? 0 : query.data?.total_count ?? 0;
  const rangeStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize + events.length, totalCount);
  useEffect(() => {
    if (!query.isFetching && page > 0 && events.length === 0 && totalCount <= page * pageSize) setPage((current) => Math.max(0, current - 1));
  }, [events.length, page, query.isFetching, totalCount]);

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <h3 className="text-sm font-semibold text-slate-900">
        Dispatcher safety events
        {totalCount ? <span className="ml-2 text-xs font-normal text-gray-600">({totalCount})</span> : null}
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
      {!query.isLoading && !query.isError && totalCount > pageSize ? (
        <div className="flex items-center justify-between border-t border-gray-200 pt-2 text-xs text-gray-600" data-testid={`${testId}-range`}>
          <span>{rangeStart}–{rangeEnd} of {totalCount}</span>
          <div className="flex gap-2">
            <button type="button" className="rounded-sm border px-2 py-1 disabled:opacity-50" disabled={page === 0 || query.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
            <button type="button" className="rounded-sm border px-2 py-1 disabled:opacity-50" disabled={rangeEnd >= totalCount || query.isFetching} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
