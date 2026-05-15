import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { get1099Summary, getSalesTaxSummary } from "../../api/accounting-wave2";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatCurrencyCents } from "../../lib/format";

function isoMonthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function isoMonthEnd(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export function AccountingSalesTaxPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const now = new Date();
  const [start, setStart] = useState(isoMonthStart(now));
  const [end, setEnd] = useState(isoMonthEnd(now));

  const q = useQuery({
    queryKey: ["accounting", "sales-tax", companyId, start, end],
    queryFn: () => getSalesTaxSummary(companyId, start, end),
    enabled: Boolean(companyId) && Boolean(start) && Boolean(end),
  });

  const s = q.data?.summary ?? {};

  return (
    <div className="space-y-4">
      <PageHeader title="Sales tax" subtitle="Aggregated invoice tax for the selected range (Wave 2 summary)." />
      {!companyId ? <p className="text-sm text-amber-800">Select an operating company.</p> : null}
      <div className="flex flex-wrap gap-2 text-sm">
        <label>
          Start
          <input type="date" className="ml-1 rounded border px-2 py-1" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          End
          <input type="date" className="ml-1 rounded border px-2 py-1" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {q.isError ? <ListErrorBanner onRetry={() => void q.refetch()} /> : null}
      <div className="rounded border border-gray-200 bg-white p-4 text-sm">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>Taxable subtotal: {formatCurrencyCents(Number((s as Record<string, unknown>).taxable_subtotal_cents ?? 0))}</div>
          <div>Tax collected: {formatCurrencyCents(Number((s as Record<string, unknown>).tax_collected_cents ?? 0))}</div>
          <div>Invoice count: {String((s as Record<string, unknown>).invoice_count ?? "—")}</div>
        </dl>
      </div>
    </div>
  );
}

export function Accounting1099Page() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const q = useQuery({
    queryKey: ["accounting", "1099", companyId, year],
    queryFn: () => get1099Summary(companyId, Number(year)),
    enabled: Boolean(companyId),
  });

  const vendors = q.data?.vendors ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="1099 dashboard" subtitle="Vendors with eligible 1099 payments ≥ $600 in the selected year." />
      {!companyId ? <p className="text-sm text-amber-800">Select an operating company.</p> : null}
      <label className="text-sm">
        Year{" "}
        <input className="ml-2 w-24 rounded border px-2 py-1" value={year} onChange={(e) => setYear(e.target.value)} />
      </label>
      {q.isError ? <ListErrorBanner onRetry={() => void q.refetch()} /> : null}
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Paid</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v: Record<string, unknown>, i: number) => (
              <tr key={String(v.vendor_id ?? i)} className="border-b border-gray-100">
                <td className="px-3 py-2">{String(v.vendor_name ?? v.vendor_id ?? "—")}</td>
                <td className="px-3 py-2">{formatCurrencyCents(Number(v.payments_cents ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.isLoading && vendors.length === 0 ? <p className="p-4 text-sm text-gray-600">No rows.</p> : null}
      </div>
    </div>
  );
}
