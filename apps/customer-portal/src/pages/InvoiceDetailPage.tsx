import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { apiRequest, buildApiUrl } from "../api/client";

export function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: ["portal", "invoice", id],
    queryFn: () => apiRequest<Record<string, unknown>>(`/api/v1/portal/invoices/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });

  if (!id) return <p className="text-sm text-red-600">Missing invoice.</p>;
  if (q.isLoading) return <p className="text-sm text-slate-600">Loading…</p>;
  if (q.isError || !q.data) return <p className="text-sm text-red-600">Invoice not found.</p>;

  const row = q.data;
  const open = Number(row.amount_open_cents ?? 0);
  const pdfUrl = buildApiUrl(`/api/v1/portal/invoices/${encodeURIComponent(id)}/pdf`);

  return (
    <div className="space-y-4">
      <Link to="/invoices" className="text-sm text-sky-700 hover:underline">
        ← Invoices
      </Link>
      <h1 className="text-xl font-semibold text-slate-900">Invoice {String(row.display_id ?? id)}</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800">
        <p>Status: {String(row.status ?? "")}</p>
        <p>Issue date: {String(row.invoice_date ?? row.issue_date ?? "")}</p>
        <p>Due: {String(row.due_date ?? "")}</p>
        <p>Total: {(Number(row.total_cents ?? 0) / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}</p>
        <p>Open: {(open / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <a className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white" href={pdfUrl} target="_blank" rel="noreferrer">
          View PDF
        </a>
        {open > 0 ? (
          <span className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            Payment link: contact AR for pay portal (unpaid balance)
          </span>
        ) : null}
      </div>
    </div>
  );
}
