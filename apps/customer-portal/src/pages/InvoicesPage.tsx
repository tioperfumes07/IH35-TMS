import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest, buildApiUrl } from "../api/client";

export function InvoicesPage() {
  const q = useQuery({
    queryKey: ["portal", "invoices", "list"],
    queryFn: () =>
      apiRequest<{
        invoices: Array<{
          id: string;
          display_id?: string | null;
          invoice_date?: string;
          total_cents: unknown;
          amount_open_cents: unknown;
          status: string;
        }>;
      }>("/api/v1/portal/invoices?limit=50"),
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Open</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(q.data?.invoices ?? []).map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <Link className="text-sky-800 hover:underline" to={`/invoices/${r.id}`}>
                    {r.display_id ?? r.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-3 py-2">{String(r.invoice_date ?? "").slice(0, 10)}</td>
                <td className="px-3 py-2 text-right">
                  {(Number(r.total_cents ?? 0) / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                </td>
                <td className="px-3 py-2 text-right">
                  {(Number(r.amount_open_cents ?? 0) / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                </td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">
                  <a className="text-sky-700 hover:underline" href={pdfHref(r.id)} target="_blank" rel="noreferrer">
                    Download
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(q.data?.invoices ?? []).length === 0 && !q.isLoading ? (
          <p className="px-3 py-6 text-sm text-slate-500">No invoices found.</p>
        ) : null}
      </div>
    </div>
  );
}

function pdfHref(id: string) {
  return buildApiUrl(`/api/v1/portal/invoices/${encodeURIComponent(id)}/pdf`);
}
