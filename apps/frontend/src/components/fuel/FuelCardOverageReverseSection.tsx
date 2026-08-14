import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="fuel-card-overage-reverse">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Fuel card overages</h2>
        <Link className="text-xs font-semibold text-slate-700 hover:underline" to={`/fuel/card-overage?${new URLSearchParams(filter).toString()}`}>
          Open queue
        </Link>
      </div>
      {query.isError ? <p className="mt-2 text-xs text-red-700">Fuel card overages unavailable.</p> : null}
      {query.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && events.length === 0 ? <p className="mt-2 text-xs text-gray-500">No fuel card overages.</p> : null}
      <ul className="mt-2 space-y-1">
        {events.slice(0, 5).map((event) => (
          <li key={event.id}>
            <Link className="text-xs font-semibold text-slate-700 hover:underline" to={`/fuel/card-overage?event_id=${encodeURIComponent(event.id)}`}>
              {new Date(event.created_at).toLocaleDateString()} · {(event.overage_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
