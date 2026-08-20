import { useQuery } from "@tanstack/react-query";
import { getFactoringRecoursePipeline, getFactoringChargebacksFees } from "../../api/factoring";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

// LINK-F5171/LINK-F5180 — factoring:home.recourse_pipeline + factoring:home.chargebacks_fees
// reverse gaps. Both endpoints now accept an optional customer_id filter (LINK-F5180), resolved
// server-side via the same accounting.invoices.factoring_advance_id join both views share.
// NOTE: advance_amount/chargeback_amount are already DOLLAR values (not cents) -- same convention
// FactoringHome.tsx's own fmtCurrency uses (currency.format(Number(value)), no /100).
const currencyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtDollars = (value: unknown) => currencyFmt.format(Number(value ?? 0));
export function CustomerFactoringRecourseReverseSection({ operatingCompanyId, customerId }: { operatingCompanyId: string; customerId: string }) {
  const recourseQuery = useQuery({
    queryKey: ["customer-factoring-recourse-reverse", operatingCompanyId, customerId],
    queryFn: () => getFactoringRecoursePipeline(operatingCompanyId, 200, { customer_id: customerId }),
    enabled: Boolean(operatingCompanyId && customerId),
  });
  const feesQuery = useQuery({
    queryKey: ["customer-factoring-chargebacks-reverse", operatingCompanyId, customerId],
    queryFn: () => getFactoringChargebacksFees(operatingCompanyId, customerId),
    enabled: Boolean(operatingCompanyId && customerId),
  });

  const recourseInvoices = recourseQuery.data?.invoices ?? [];
  const chargebacks = feesQuery.data?.history ?? [];
  const isLoading = recourseQuery.isLoading || feesQuery.isLoading;
  const isError = recourseQuery.isError || feesQuery.isError;

  if (isLoading || isError || (recourseInvoices.length === 0 && chargebacks.length === 0)) {
    return (
      <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="customer-factoring-recourse-reverse">
        <h2 className="text-sm font-semibold text-slate-900">Recourse & chargebacks</h2>
        {isError ? <p className="mt-2 text-xs text-red-700">Recourse/chargebacks data unavailable.</p> : null}
        {isLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
        {!isLoading && !isError ? <p className="mt-2 text-xs text-gray-500">No recourse-at-risk invoices or chargebacks for this customer.</p> : null}
      </section>
    );
  }

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="customer-factoring-recourse-reverse">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Recourse & chargebacks</h2>
        <EntityLink
          kind="factoring_recourse_customer"
          id={customerId}
          label="Open Recourse"
          className="text-xs font-semibold text-slate-700 underline"
        />
      </div>
      {recourseInvoices.length > 0 ? (
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Recourse at risk</p>
          <ul className="mt-1 space-y-1">
            {recourseInvoices.slice(0, 5).map((row) => (
              <li key={row.factoring_advance_id}>
                <span className="text-xs font-semibold text-slate-700">
                  <EntityLinkOrTombstone
                    kind="invoice"
                    id={row.invoice_id}
                    name={row.invoice_reference}
                    noun="Invoice"
                    className="hover:underline"
                  />
                  {` · ${fmtDollars(row.advance_amount)} · ${row.days_until_recourse_expiry}d to expiry`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {chargebacks.length > 0 ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Chargebacks</p>
            <EntityLink
              kind="factoring_chargebacks_customer"
              id={customerId}
              label="Open Chargebacks"
              className="text-xs font-semibold text-slate-700 underline"
            />
          </div>
          <ul className="mt-1 space-y-1">
            {chargebacks.slice(0, 5).map((row) => (
              <li key={`${row.factoring_advance_id}-${row.created_at}`}>
                <EntityLink
                  kind="factoring_chargebacks_customer"
                  id={customerId}
                  label={`${row.statement_month ?? "—"} · ${fmtDollars(row.chargeback_amount)}`}
                  className="text-xs font-semibold text-slate-700 hover:underline"
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
