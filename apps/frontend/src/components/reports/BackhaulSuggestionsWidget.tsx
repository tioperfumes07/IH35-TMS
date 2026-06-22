import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";

type BackhaulSuggestion = {
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  load_count: number;
  profit_per_mile_cents: number | null;
  margin_pct: number | null;
  gross_profit_cents: number;
  label: string;
};

type BackhaulResponse = {
  current_location: string | null;
  suggestions: BackhaulSuggestion[];
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function BackhaulSuggestionsWidget({
  unitId,
  companyId,
  unitNumber,
}: {
  unitId: string;
  companyId: string;
  unitNumber: string;
}) {
  const query = useQuery({
    queryKey: ["reports", "deadhead-suggestions", companyId, unitId],
    queryFn: () =>
      apiRequest<BackhaulResponse>(
        `/api/v1/reports/deadhead/suggestions/${encodeURIComponent(unitId)}?operating_company_id=${encodeURIComponent(companyId)}`
      ),
    enabled: Boolean(unitId && companyId),
    staleTime: 60_000,
    retry: false,
  });

  const location = query.data?.current_location ?? "current location";
  const suggestions = query.data?.suggestions ?? [];

  return (
    <section className="rounded border border-slate-300 bg-slate-100/40 p-4" data-testid="backhaul-suggestions-widget">
      <h3 className="text-sm font-semibold text-slate-700">Profitable backhauls</h3>
      <p className="mt-1 text-xs text-slate-700/80">
        Truck {unitNumber} is empty near {location}. Best lanes from lane-profitability cache:
      </p>
      {query.isLoading ? <p className="mt-2 text-xs text-gray-600">Loading suggestions…</p> : null}
      {query.isError ? <p className="mt-2 text-xs text-red-600">Unable to load backhaul suggestions.</p> : null}
      {!query.isLoading && suggestions.length === 0 ? (
        <p className="mt-2 text-xs text-gray-600">No profitable lanes found originating near this location.</p>
      ) : null}
      {suggestions.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm">
          {suggestions.map((lane) => (
            <li key={`${lane.origin_city}-${lane.destination_city}`} className="flex justify-between gap-2 rounded bg-white/80 px-2 py-1">
              <span>
                {lane.origin_city}→{lane.destination_city}
              </span>
              <span className="font-medium text-slate-700">
                {lane.profit_per_mile_cents != null ? `${money(lane.profit_per_mile_cents)}/mi` : money(lane.gross_profit_cents)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
