import { useQuery } from "@tanstack/react-query";
import { listSubmissionQueue } from "../../api/factoring";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

// LINK-F5171/LINK-F5181 — factoring:submit.queue reverse gap. listSubmissionQueue already selects
// real customer_id/load_id FKs off accounting.invoices; LINK-F5181 added a customer_id filter,
// applied server-side (not a client-side slice of the LIMIT 500 company-wide queue).
export function CustomerFactoringSubmitQueueReverseSection({ operatingCompanyId, customerId }: { operatingCompanyId: string; customerId: string }) {
  const query = useQuery({
    queryKey: ["customer-factoring-submit-queue-reverse", operatingCompanyId, customerId],
    queryFn: () => listSubmissionQueue(operatingCompanyId, { customer_id: customerId }).then((r) => r.items),
    enabled: Boolean(operatingCompanyId && customerId),
  });
  const items = query.data ?? [];

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="customer-factoring-submit-queue-reverse">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Factoring submission queue</h2>
        <EntityLink
          kind="factoring_submit_queue_customer"
          id={customerId}
          label="Open Submit Queue"
          className="text-xs font-semibold text-slate-700 underline"
        />
      </div>
      {query.isError ? <p className="mt-2 text-xs text-red-700">Submission queue unavailable.</p> : null}
      {query.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && items.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No invoices eligible for factoring submission for this customer.</p>
      ) : null}
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {items.slice(0, 5).map((item) => (
            <li key={item.invoice_id}>
              <span className="text-xs font-semibold text-slate-700">
                <EntityLinkOrTombstone
                  kind="invoice"
                  id={item.invoice_id}
                  name={item.display_id}
                  noun="Invoice"
                  className="hover:underline"
                />
                {` · ${formatUsdCents(item.total_cents)} · ${item.is_submittable ? "Docs OK" : "Missing docs"}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
