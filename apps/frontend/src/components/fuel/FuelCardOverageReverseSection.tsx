import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "../shared/EntityLink";
import { listOverageEvents } from "../../pages/fuel/card-overage/CardOverageQueuePage";

type Props = {
  operatingCompanyId: string;
  filter: { driver_id: string } | { unit_id: string };
};

export function FuelCardOverageReverseSection({ operatingCompanyId, filter }: Props) {
  const query = useQuery({
    queryKey: ["fuel-card-overage-reverse", operatingCompanyId, filter],
    queryFn: () => listOverageEvents(operatingCompanyId, "all", filter),
    enabled: Boolean(operatingCompanyId),
  });
  const events = query.data?.events ?? [];
  const visibleEvents = events.slice(0, 5);
  const totalCount = query.data?.total_count ?? events.length;

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="fuel-card-overage-reverse">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Fuel card overages</h2>
        {"driver_id" in filter ? (
          <EntityLink kind="fuel_card_overage_driver" id={filter.driver_id} label="Open queue" className="text-xs font-semibold text-slate-700 hover:underline" />
        ) : (
          <EntityLink kind="fuel_card_overage_unit" id={filter.unit_id} label="Open queue" className="text-xs font-semibold text-slate-700 hover:underline" />
        )}
      </div>
      {query.isError ? <p className="mt-2 text-xs text-red-700">Fuel card overages unavailable.</p> : null}
      {query.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && events.length === 0 ? <p className="mt-2 text-xs text-gray-500">No fuel card overages.</p> : null}
      {totalCount > visibleEvents.length ? (
        <p className="mt-2 text-xs text-slate-500" data-testid="fuel-card-overage-reverse-range">
          Showing {visibleEvents.length} of {totalCount}. Open queue to view all.
        </p>
      ) : null}
      <ul className="mt-2 space-y-1">
        {visibleEvents.map((event) => (
          <li key={event.id}>
            <EntityLink
              kind="fuel_card_overage_event"
              id={event.id}
              label={`${new Date(event.created_at).toLocaleDateString()} · ${(event.overage_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}`}
              className="text-xs font-semibold text-slate-700 hover:underline"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
