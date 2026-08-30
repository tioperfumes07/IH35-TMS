import { useQuery } from "@tanstack/react-query";
import { listCustomerQualityEvents, type CustomerQualityEvent } from "../../api/mdata";
import { formatDateUS } from "../../lib/formatDate";
import { StatusBadge } from "../layout/StatusBadge";
import { ListErrorState } from "../ListErrorState";

/**
 * DISP-F6445 — LINK-F5171 group (b): `mdata.customers` quality events carry a real
 * `related_load_id` FK (rendered forward as an EntityLink from the Customer Detail → Quality &
 * History tab), but `LoadDetailDrawer` had no reverse section at all — a load involved in a
 * late-payment/damage-claim/rate-dispute quality event showed nothing about it. Same defect class
 * as LOAD-WO-REVERSE (LoadWorkOrdersReverseSection.tsx): the link existed in the database and
 * appeared on no screen. §10a: a link is done only when it drills BOTH ways.
 *
 * No new backend route: the load always carries its own `customer_id`, so this reuses the
 * EXISTING customer-scoped `GET /api/v1/mdata/customers/:id/quality-events` query (the same one
 * Customer Detail's Quality & History tab already calls) and filters client-side to this load's
 * id — a load has at most a handful of customer quality events, so client-side filtering of one
 * customer's event list is not a scale concern the way an unbounded cross-customer query would be.
 */

type Props = {
  operatingCompanyId: string;
  customerId: string;
  loadId: string;
  "data-testid"?: string;
};

export function LoadQualityEventsReverseSection({
  operatingCompanyId,
  customerId,
  loadId,
  "data-testid": testId = "load-detail-quality-events",
}: Props) {
  const query = useQuery({
    queryKey: ["mdata", "customer-quality-events", "reverse", "load", operatingCompanyId, customerId, loadId],
    queryFn: () => listCustomerQualityEvents(customerId, operatingCompanyId).then((res) => res.events),
    enabled: Boolean(operatingCompanyId) && Boolean(customerId) && Boolean(loadId),
  });

  const rows: CustomerQualityEvent[] = query.isError
    ? []
    : (query.data ?? []).filter((event) => event.related_load_id === loadId);

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="text-xs font-semibold text-gray-600">Customer quality events on this load</div>

      <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="load-reverse-quality-events">
        <h3 className="text-sm font-semibold text-slate-900">
          Quality Events
          {rows.length > 0 ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
        </h3>
        {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
        {query.isError ? (
          <ListErrorState status={0} message="Could not load quality events for this load." onRetry={() => void query.refetch()} />
        ) : null}
        {!query.isLoading && !query.isError && rows.length === 0 ? (
          <p className="text-sm text-gray-500">No customer quality events reference this load.</p>
        ) : null}
        {!query.isError && rows.length > 0 ? (
          <ul className="space-y-2">
            {rows.map((event) => (
              <li key={event.id} className="text-sm text-slate-700" data-testid={`load-quality-event-${event.id}`}>
                <span className="rounded-sm bg-gray-100 px-2 py-0.5 text-[11px]">{formatDateUS(event.event_date)}</span>{" "}
                <StatusBadge variant={event.severity === "severe" ? "crit" : event.severity === "warning" ? "warn" : "info"}>
                  {event.severity}
                </StatusBadge>{" "}
                <span className="text-xs uppercase tracking-wide text-gray-600">{event.event_type.replaceAll("_", " ")}</span>
                <div className={event.voided_at ? "text-gray-500 line-through" : ""}>{event.summary}</div>
                {event.dollar_impact_amount != null ? (
                  <span className="text-xs text-gray-600">${Number(event.dollar_impact_amount).toFixed(2)}</span>
                ) : null}
                {event.voided_at ? <span className="ml-2 text-xs text-gray-500">Voided</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
