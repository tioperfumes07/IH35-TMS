import { useQuery } from "@tanstack/react-query";
import { getDeadheadNextLoadSuggestions, type DeadheadNextLoadSuggestion } from "../../api/dispatch";

export type DeadheadOptimizerPanelProps = {
  operatingCompanyId: string;
  unitUuid: string;
  afterDeliveryAt: string;
  dropCity?: string;
  dropState?: string;
  suggestionsOverride?: DeadheadNextLoadSuggestion[];
  disabled?: boolean;
};

function fmtMiles(n: number) {
  return Number.isFinite(n) ? n.toFixed(1) : "—";
}

function fmtMoneyCents(cents: number) {
  if (!Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

export function DeadheadOptimizerPanel({
  operatingCompanyId,
  unitUuid,
  afterDeliveryAt,
  dropCity,
  dropState,
  suggestionsOverride,
  disabled,
}: DeadheadOptimizerPanelProps) {
  const q = useQuery({
    queryKey: [
      "dispatch",
      "deadhead-next-load",
      operatingCompanyId,
      unitUuid,
      afterDeliveryAt,
      dropCity ?? "",
      dropState ?? "",
    ],
    queryFn: () =>
      getDeadheadNextLoadSuggestions({
        operating_company_id: operatingCompanyId,
        unit: unitUuid,
        after: afterDeliveryAt,
        drop_city: dropCity,
        drop_state: dropState,
      }),
    enabled: Boolean(operatingCompanyId && unitUuid && afterDeliveryAt && suggestionsOverride == null),
  });

  const suggestions = (suggestionsOverride ?? q.data?.suggestions ?? []).slice(0, 5);

  return (
    <div className="space-y-2 rounded border border-emerald-200 bg-emerald-50/60 p-3" data-testid="deadhead-optimizer-panel">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">Next-load deadhead suggestions</p>
        <p className="text-[11px] text-emerald-800/80">Top 5 pending loads ranked by (revenue − deadhead cost) / total miles</p>
      </div>

      {q.isLoading && !suggestionsOverride ? <p className="text-xs text-emerald-800/70">Loading suggestions…</p> : null}
      {q.isError && !suggestionsOverride ? <p className="text-xs text-red-700">Could not load deadhead suggestions.</p> : null}
      {!q.isLoading && suggestions.length === 0 ? (
        <p className="text-xs text-emerald-900/70">No nearby pending loads within the deadhead limit.</p>
      ) : null}

      <ul className="max-h-44 space-y-1 overflow-y-auto">
        {suggestions.map((row, index) => (
          <li
            key={row.load_uuid}
            className="rounded border border-emerald-100 bg-white px-2 py-1.5 text-xs text-slate-800"
            data-testid={`deadhead-suggestion-row-${index + 1}`}
          >
            <div className="flex items-center justify-between gap-2 font-semibold">
              <span>
                #{index + 1} · {row.load_number ?? row.load_uuid.slice(0, 8)} · {row.pickup_city}, {row.pickup_state}
              </span>
              <span className="font-mono text-[11px] text-emerald-800">{row.score.toFixed(2)} ¢/mi score</span>
            </div>
            <div className="text-[10px] text-slate-600">
              DH {fmtMiles(row.deadhead_miles)} mi · Loaded {fmtMiles(row.loaded_miles)} mi · Rev {fmtMoneyCents(row.est_revenue_cents)} ·
              Margin {fmtMoneyCents(row.est_margin_cents)}
            </div>
            <div className="text-[10px] text-slate-500">
              → {row.delivery_city}, {row.delivery_state}
            </div>
          </li>
        ))}
      </ul>

      {disabled ? <p className="text-[10px] text-slate-500">Suggestions are read-only while the form is disabled.</p> : null}
    </div>
  );
}
