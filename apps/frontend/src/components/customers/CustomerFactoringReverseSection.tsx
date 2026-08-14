import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getCustomerFactor } from "../../api/factoring";
import { formatUsdCents } from "../../lib/money";

// LINK-F5171/LINK-F5178 — factoring:factors.admin + factoring:batches.detail (customer side) reverse
// gaps. getCustomerFactor(customerId, companyId) already returns { factor, assignments, batches }
// scoped to this customer (real customer_id-filtered backend, live behind
// GET /api/v1/customers/:customerId/factor since PR #... FactorAdmin.tsx) — it was only ever
// consumed by the forward page (FactorAdmin.tsx), never from the customer's own profile. This
// section reuses that exact call and links into FactorAdmin.tsx pre-scoped via ?customer_id=,
// which FactorAdmin now (LINK-F5178) honors on load.
export function CustomerFactoringReverseSection({ operatingCompanyId, customerId }: { operatingCompanyId: string; customerId: string }) {
  const query = useQuery({
    queryKey: ["customer-factoring-reverse", operatingCompanyId, customerId],
    queryFn: () => getCustomerFactor(customerId, operatingCompanyId),
    enabled: Boolean(operatingCompanyId && customerId),
  });
  const factor = query.data?.factor ?? null;
  const batches = query.data?.batches ?? [];
  const target = `/factoring/factors?customer_id=${encodeURIComponent(customerId)}`;

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="customer-factoring-reverse">
      <h2 className="text-sm font-semibold text-slate-900">Factoring</h2>
      {query.isError ? <p className="mt-2 text-xs text-red-700">Factoring assignment unavailable.</p> : null}
      {query.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && !factor && batches.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No factoring assignment or batch history for this customer.</p>
      ) : null}
      {factor ? (
        <p className="mt-2 text-xs text-gray-700">
          Factor: <span className="font-semibold">{factor.name}</span> · advance {(factor.advance_rate * 100).toFixed(1)}% · fee{" "}
          {(factor.fee_rate * 100).toFixed(1)}%
        </p>
      ) : null}
      {batches.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {batches.slice(0, 5).map((batch) => (
            <li key={batch.id}>
              <Link className="text-xs font-semibold text-slate-700 hover:underline" to={target}>
                {batch.batch_number} · {batch.status} · {formatUsdCents(batch.total_face_cents)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {factor || batches.length > 0 ? (
        <Link className="mt-2 inline-block text-xs font-medium text-slate-700 hover:underline" to={target}>
          View full factoring detail →
        </Link>
      ) : null}
    </section>
  );
}
