import { Link } from "react-router-dom";
import { useRoadServiceTickets } from "../../hooks/useRoadServiceTickets";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorBanner } from "../shared/ListErrorBanner";

type Props = {
  driverId: string;
  "data-testid"?: string;
};

export function DriverRoadServiceReverseSection({
  driverId,
  "data-testid": testId = "driver-road-service-reverse-section",
}: Props) {
  const { tickets, isLoading, isError } = useRoadServiceTickets({ driver_id: driverId });

  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Road Service</h2>
        <span className="text-xs text-gray-500">{isLoading ? "Loading…" : tickets.length}</span>
      </div>
      {isError ? <ListErrorBanner message="Couldn't load road-service tickets for this driver." /> : null}
      {!isLoading && !isError && tickets.length === 0 ? (
        <p className="text-xs text-gray-500">No road-service tickets linked to this driver.</p>
      ) : null}
      {tickets.map((ticket) => (
        <div key={ticket.id} className="flex items-center justify-between gap-3 rounded-sm border border-gray-100 px-2 py-1.5 text-xs">
          <Link className="font-medium text-slate-700 hover:underline" to={`/maintenance/road-service?ticket_id=${ticket.id}`}>
            {entityLabel(ticket.ticket_number, ticket.id, "Road-service ticket")}
          </Link>
          <span className="text-gray-500">{ticket.service_type} · {ticket.status}</span>
        </div>
      ))}
    </section>
  );
}
