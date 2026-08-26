import { useQuery } from "@tanstack/react-query";
import { getDetentionEventsForLoad } from "../../api/dispatch";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { StatusBadge } from "../layout/StatusBadge";
import { ListErrorState } from "../ListErrorState";

/**
 * DISP-F6470 — LINK-F5171 group (b): `dispatch.detention_events` has always had `load_id`, but
 * `LoadDetailDrawer` had no reverse section at all -- a load that accrued (or was billed for)
 * detention showed nothing about it, alongside 5 sibling reverse sections for work orders, safety
 * records, in-transit issues, driver reports, and insurance claims.
 *
 * Deliberately NOT a reuse of the Detention Board's own query: that board is the OPERATIONAL
 * queue, scoped to `status IN ('accruing', 'closed')` -- a load whose detention was successfully
 * bridged to billing (status='billed', the actual completed outcome an owner would most want to
 * see on that load's own history) would be invisible if this section just filtered the board's
 * list client-side. Same principle as LoadWorkOrdersReverseSection's own comment: a load-scoped
 * reverse read shows the full history, not just the open-queue subset. Uses a dedicated
 * load-scoped backend query (no status filter) instead.
 */

type Props = {
  operatingCompanyId: string;
  loadId: string;
  "data-testid"?: string;
};

const STATUS_LABEL: Record<string, string> = {
  accruing: "Accruing",
  closed: "Closed",
  billed: "Billed",
};

export function LoadDetentionReverseSection({
  operatingCompanyId,
  loadId,
  "data-testid": testId = "load-detail-detention",
}: Props) {
  const query = useQuery({
    queryKey: ["dispatch", "reverse", "detention", "load", operatingCompanyId, loadId],
    queryFn: () => getDetentionEventsForLoad(operatingCompanyId, loadId).then((res) => res.events),
    enabled: Boolean(operatingCompanyId) && Boolean(loadId),
  });
  const rows = query.isError ? [] : (query.data ?? []);

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="text-xs font-semibold text-gray-600">Detention on this load</div>

      <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="load-reverse-detention">
        <h3 className="text-sm font-semibold text-slate-900">
          Detention Events
          {rows.length > 0 ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
        </h3>
        {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
        {query.isError ? (
          <ListErrorState status={0} message="Could not load detention events for this load." onRetry={() => void query.refetch()} />
        ) : null}
        {!query.isLoading && !query.isError && rows.length === 0 ? (
          <p className="text-sm text-gray-500">No detention events recorded on this load.</p>
        ) : null}
        {!query.isError && rows.length > 0 ? (
          <ul className="space-y-2">
            {rows.map((event) => (
              <li key={event.id} className="text-sm text-slate-700" data-testid={`load-detention-event-${event.id}`}>
                <span className="rounded-sm bg-gray-100 px-2 py-0.5 text-[11px]">{formatDateUS(event.started_at)}</span>{" "}
                <StatusBadge variant={event.status === "billed" ? "positive" : event.status === "accruing" ? "warn" : "neutral"}>
                  {STATUS_LABEL[event.status] ?? event.status}
                </StatusBadge>{" "}
                {event.stop_city || event.stop_state ? (
                  <span className="text-xs text-gray-600">
                    {[event.stop_city, event.stop_state].filter(Boolean).join(", ")}
                  </span>
                ) : null}
                <div className="text-xs text-gray-600">
                  {event.billable_minutes} billable min · {formatUsdCents(event.accrued_amount_cents)}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
