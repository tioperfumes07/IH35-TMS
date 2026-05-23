import { useQuery } from "@tanstack/react-query";
import { listFactoringReserveBalances } from "../../api/accounting";
import { DataPanel } from "../../components/layout/DataPanel";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function FactorReserveCard({ operatingCompanyId }: { operatingCompanyId: string }) {
  const query = useQuery({
    queryKey: ["accounting", "factoring-reserve-balances", operatingCompanyId],
    queryFn: () => listFactoringReserveBalances(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = query.data?.rows ?? [];
  const events = query.data?.recent_events ?? [];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <DataPanel title="Reserve balances by customer">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="px-2 py-1.5 font-semibold">Customer</th>
                <th className="px-2 py-1.5 font-semibold">Current reserve</th>
                <th className="px-2 py-1.5 font-semibold">Accrued</th>
                <th className="px-2 py-1.5 font-semibold">Released</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <tr>
                  <td className="px-2 py-2 text-gray-500" colSpan={4}>
                    Loading reserve balances...
                  </td>
                </tr>
              ) : null}
              {!query.isLoading && rows.length === 0 ? (
                <tr>
                  <td className="px-2 py-2 text-gray-500" colSpan={4}>
                    No reserve balances yet.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.customer_id} className="border-b border-gray-100">
                  <td className="px-2 py-1.5 text-gray-900">{row.customer_name}</td>
                  <td className="px-2 py-1.5 text-gray-900">{money(row.reserve_balance_cents)}</td>
                  <td className="px-2 py-1.5 text-gray-700">{money(row.reserve_accrued_cents)}</td>
                  <td className="px-2 py-1.5 text-gray-700">{money(row.reserve_released_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataPanel>

      <DataPanel title="Latest reserve events">
        <div className="space-y-2">
          {events.length === 0 ? <div className="text-xs text-gray-500">No reserve events yet.</div> : null}
          {events.map((event) => (
            <div key={`${event.factoring_advance_id}-${event.occurred_at}`} className="rounded border border-gray-200 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900">
                  {event.display_id} - {event.customer_name}
                </span>
                <span className="text-gray-500">{new Date(event.occurred_at).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-gray-700">
                Status: {event.status} | Reserve: {money(event.reserve_amount_cents)} | Release: {money(event.release_amount_cents)} | Fee:{" "}
                {money(event.factor_fee_cents)}
              </div>
            </div>
          ))}
        </div>
      </DataPanel>
    </div>
  );
}
