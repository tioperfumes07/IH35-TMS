import { useRoadServiceTickets } from "../../hooks/useRoadServiceTickets";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../shared/ListErrorBanner";

type Filter =
  | { driver_id: string; unit_id?: never; vendor_id?: never; wo_id?: never }
  | { unit_id: string; driver_id?: never; vendor_id?: never; wo_id?: never }
  | { vendor_id: string; driver_id?: never; unit_id?: never; wo_id?: never }
  | { wo_id: string; driver_id?: never; unit_id?: never; vendor_id?: never };

type Props = {
  filter: Filter;
  contextLabel: string;
  "data-testid"?: string;
};

export function RoadServiceReverseSection({
  filter,
  contextLabel,
  "data-testid": testId = "road-service-reverse-section",
}: Props) {
  const { tickets, isLoading, isError } = useRoadServiceTickets(filter);

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Road Service</h2>
        <span className="text-xs text-gray-500">{isLoading ? "Loading…" : tickets.length}</span>
      </div>
      {isError ? <ListErrorBanner message={`Couldn't load road-service tickets for ${contextLabel}.`} /> : null}
      {!isLoading && !isError && tickets.length === 0 ? (
        <p className="text-xs text-gray-500">No road-service tickets linked to {contextLabel}.</p>
      ) : null}
      {tickets.map((ticket) => (
        <div key={ticket.id} className="space-y-1 px-2 py-1.5 text-xs">
          <div className="flex items-center justify-between gap-3">
            <EntityLinkOrTombstone
              kind="road_service_ticket"
              id={ticket.id}
              name={ticket.ticket_number}
              noun="Road-service ticket"
              className="font-medium text-slate-700 hover:underline"
            />
            <span className="text-gray-500">
              {ticket.service_type} · {ticket.status}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-gray-600">
            <EntityLinkOrTombstone kind="unit" id={ticket.unit_id} name={ticket.unit_display_id} noun="Unit" />
            <EntityLinkOrTombstone kind="vendor" id={ticket.vendor_id} name={ticket.vendor_name} noun="Vendor" />
            {ticket.wo_id ? (
              <EntityLinkOrTombstone kind="work_order" id={ticket.wo_id} name={ticket.work_order_display_id} noun="Work order" />
            ) : null}
            {ticket.bill_id ? (
              <EntityLinkOrTombstone kind="bill" id={ticket.bill_id} name={ticket.bill_number} noun="Bill" />
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}
