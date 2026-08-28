import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "../shared/EntityLink";
import { apiRequest } from "../../api/client";
import type { FactoringQueueRow } from "../../pages/dispatch/FactoringQueuePage";
import { formatUsdCents } from "../../lib/money";
import { ListErrorState } from "../ListErrorState";

// LINK-F5171/LINK-F5179 — factoring:dispatch.queue reverse gap. GET /api/v1/dispatch/factoring-queue
// already selects a real customer_id off mdata.customers (c.id) per row; this component queries it
// scoped server-side to this customer (LINK-F5179 added the customer_id filter param) and links back
// to the queue itself, pre-scoped the same way.
export function CustomerFactoringQueueReverseSection({ operatingCompanyId, customerId }: { operatingCompanyId: string; customerId: string }) {
  const query = useQuery({
    queryKey: ["customer-factoring-queue-reverse", operatingCompanyId, customerId],
    queryFn: () =>
      apiRequest<{ rows: FactoringQueueRow[]; total: number }>(
        `/api/v1/dispatch/factoring-queue?operating_company_id=${encodeURIComponent(operatingCompanyId)}&customer_id=${encodeURIComponent(customerId)}`
      ),
    enabled: Boolean(operatingCompanyId && customerId),
  });
  const rows = query.data?.rows ?? [];

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="customer-factoring-queue-reverse">
      <h2 className="text-sm font-semibold text-slate-900">Dispatch factoring queue</h2>
      {query.isError ? (
        <ListErrorState status={0} message="Factoring queue unavailable." onRetry={() => void query.refetch()} />
      ) : null}
      {query.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No delivered loads in the factoring queue for this customer.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {rows.slice(0, 5).map((row) => (
            <li key={row.load_id}>
              <EntityLink
                kind="factoring_queue_load"
                id={row.load_id}
                label={`${row.load_number} · ${row.packet_stage} · ${formatUsdCents(row.rate_total_cents)}`}
                className="text-xs font-semibold text-slate-700 hover:underline"
              />
            </li>
          ))}
        </ul>
      ) : null}
      {rows.length > 0 ? (
        <EntityLink
          kind="factoring_queue_customer"
          id={customerId}
          label="View full queue →"
          className="mt-2 inline-block text-xs font-medium text-slate-700 hover:underline"
        />
      ) : null}
    </section>
  );
}
