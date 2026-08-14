import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "../shared/EntityLink";
import { listForecastEntries } from "../../api/forecast";

type Filter =
  | { party_ref_kind: "customer" | "driver" | "vendor"; party_ref_id: string }
  | { ref_kind: "unit"; ref_external_id: string };

export function CashForecastReverseSection({ operatingCompanyId, filter }: { operatingCompanyId: string; filter: Filter }) {
  const query = useQuery({
    queryKey: ["cash-forecast-reverse", operatingCompanyId, filter],
    queryFn: () => listForecastEntries(operatingCompanyId, undefined, undefined, filter),
    enabled: Boolean(operatingCompanyId),
  });
  const entries = query.data?.entries ?? [];
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="cash-forecast-reverse">
      <h2 className="text-sm font-semibold text-slate-900">Manual cash projections</h2>
      {query.isError ? <p className="mt-2 text-xs text-red-700">Cash projections unavailable.</p> : null}
      {query.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && entries.length === 0 ? <p className="mt-2 text-xs text-gray-500">No linked cash projections.</p> : null}
      <ul className="mt-2 space-y-1">
        {entries.slice(0, 5).map((entry) => (
          <li key={entry.id}>
            <EntityLink
              kind="cash_forecast_entry"
              id={entry.id}
              label={`${entry.entry_date} · ${(entry.amount_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} · ${entry.direction}`}
              className="text-xs font-semibold text-slate-700 hover:underline"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
