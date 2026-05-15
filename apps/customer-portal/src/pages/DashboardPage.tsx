import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../api/client";

export function DashboardPage() {
  const inv = useQuery({
    queryKey: ["portal", "invoices", "dash"],
    queryFn: () =>
      apiRequest<{
        invoices: Array<{ id: string; invoice_date?: string; total_cents: unknown; amount_open_cents: unknown; status: string }>;
      }>("/api/v1/portal/invoices?limit=8"),
  });
  const loads = useQuery({
    queryKey: ["portal", "loads", "dash"],
    queryFn: () =>
      apiRequest<{ loads: Array<{ id: string; load_number: string | null; status: string }> }>("/api/v1/portal/loads?limit=8"),
  });

  const arCents = (inv.data?.invoices ?? []).reduce((s, r) => s + Number(r.amount_open_cents ?? 0), 0);

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Open A/R</h2>
        <p className="mt-1 text-3xl font-bold text-slate-900">
          {(arCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}
        </p>
        <p className="mt-1 text-xs text-slate-500">Sum of open balances on recent invoices (sample below).</p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Recent invoices</h2>
          <Link to="/invoices" className="text-sm font-medium text-sky-700 hover:underline">
            View all
          </Link>
        </div>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {(inv.data?.invoices ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <Link to={`/invoices/${r.id}`} className="font-medium text-sky-800 hover:underline">
                {String(r.invoice_date ?? r.id).slice(0, 10)}
              </Link>
              <span className="text-slate-700">
                {(Number(r.amount_open_cents ?? 0) / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })} open
              </span>
            </li>
          ))}
          {(inv.data?.invoices ?? []).length === 0 && !inv.isLoading ? (
            <li className="px-3 py-4 text-sm text-slate-500">No invoices yet.</li>
          ) : null}
        </ul>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Completed loads</h2>
          <Link to="/loads" className="text-sm font-medium text-sky-700 hover:underline">
            View all
          </Link>
        </div>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {(loads.data?.loads ?? []).map((r) => (
            <li key={r.id} className="px-3 py-2 text-sm">
              <Link to={`/loads/${r.id}`} className="font-medium text-sky-800 hover:underline">
                {r.load_number ?? r.id.slice(0, 8)}
              </Link>
              <span className="ml-2 text-slate-500">{r.status}</span>
            </li>
          ))}
          {(loads.data?.loads ?? []).length === 0 && !loads.isLoading ? (
            <li className="px-3 py-4 text-slate-500">No completed loads.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
