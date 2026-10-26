import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "../shared/EntityLink";
import { listOverageEvents } from "../../pages/fuel/card-overage/CardOverageQueuePage";
import { ListErrorState } from "../ListErrorState";
import { formatUsdCents } from "../../lib/money";
import { FuelBoardSection } from "../../pages/fuel/FuelBoardSection";

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
  // A failed refetch can retain the last successful React Query payload.
  // Suppress it while the exact failure/retry state is active so reverse
  // linkage never presents stale overage evidence as current.
  const events = query.isError ? [] : (query.data?.events ?? []);
  const visibleEvents = events.slice(0, 5);
  const totalCount = query.isError ? 0 : (query.data?.total_count ?? events.length);

  return (
    <FuelBoardSection
      title="Fuel card overages"
      testId="fuel-card-overage-reverse"
      headerRight={
        "driver_id" in filter ? (
          <EntityLink kind="fuel_card_overage_driver" id={filter.driver_id} label="Open queue" className="text-xs font-semibold text-[#1F2A44] hover:underline" />
        ) : (
          <EntityLink kind="fuel_card_overage_unit" id={filter.unit_id} label="Open queue" className="text-xs font-semibold text-[#1F2A44] hover:underline" />
        )
      }
    >
      <div className="space-y-2 px-3.5 py-2">
        {query.isError ? (
          <ListErrorState
            title="Couldn't load fuel card overages"
            status={0}
            message={(query.error as Error)?.message}
            onRetry={() => void query.refetch()}
          />
        ) : null}
        {query.isLoading ? <p className="text-xs text-gray-500">Loading…</p> : null}
        {!query.isLoading && !query.isError && events.length === 0 ? <p className="text-xs text-gray-500">No fuel card overages.</p> : null}
        {totalCount > visibleEvents.length ? (
          <p className="text-xs text-[#6B7280]" data-testid="fuel-card-overage-reverse-range">
            Showing {visibleEvents.length} of {totalCount}. Open queue to view all.
          </p>
        ) : null}
        <ul className="space-y-1">
          {visibleEvents.map((event) => (
            <li key={event.id}>
              <EntityLink
                kind="fuel_card_overage_event"
                id={event.id}
                label={`${new Date(event.created_at).toLocaleDateString()} · ${formatUsdCents(event.overage_cents)}`}
                className="text-xs font-semibold text-[#1F2A44] hover:underline"
              />
            </li>
          ))}
        </ul>
      </div>
    </FuelBoardSection>
  );
}
