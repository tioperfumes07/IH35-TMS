import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listLateArrivalDispatchLoads } from "../../api/dispatch";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";

function etaLabel(prediction: Record<string, unknown> | null | undefined): string {
  if (!prediction) return "No ETA";
  const cls = String(prediction.confidence_class ?? "");
  const at = prediction.predicted_arrival_at ? new Date(String(prediction.predicted_arrival_at)).toLocaleString() : "";
  const variance = prediction.variance_minutes != null ? `${prediction.variance_minutes}m variance` : "";
  return [cls, at, variance].filter(Boolean).join(" · ");
}

export function LateArrivalsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const lateQ = useQuery({
    queryKey: ["dispatch", "late-arrivals", companyId],
    queryFn: () => listLateArrivalDispatchLoads(companyId),
    enabled: Boolean(companyId),
  });

  if (!companyId) {
    return <div className="rounded border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  const loads = lateQ.data?.loads ?? [];
  const grace = lateQ.data?.grace_minutes ?? 30;

  return (
    <div data-testid="dispatch-late-arrivals-page" className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Late arrivals"
        subtitle={`Loads past schedule + ${grace}m grace or with late ETA prediction`}
        actions={
          <Link to="/dispatch/alerts" className="rounded border px-3 py-1.5 text-sm">
            Dispatch alerts
          </Link>
        }
      />

      <section className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Load</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Driver</th>
              <th className="px-3 py-2">Next stop</th>
              <th className="px-3 py-2">Scheduled</th>
              <th className="px-3 py-2">ETA signal</th>
            </tr>
          </thead>
          <tbody>
            {lateQ.isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  Loading late arrivals…
                </td>
              </tr>
            ) : loads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No late arrivals right now.
                </td>
              </tr>
            ) : (
              loads.map((load) => (
                <tr key={load.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2 font-medium">
                    <Link to={`/dispatch?view=loads&load=${load.id}`} className="text-sky-700 hover:underline">
                      {load.load_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{load.customer_name ?? "—"}</td>
                  <td className="px-3 py-2">{load.driver_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {[load.next_stop_city, load.next_stop_state].filter(Boolean).join(", ") || "—"}
                    {load.next_stop_type ? (
                      <span className="ml-1 text-xs text-slate-500">({load.next_stop_type})</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {load.next_stop_scheduled_at
                      ? new Date(load.next_stop_scheduled_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={String(load.latest_eta_prediction?.confidence_class ?? "late")} />
                    <span className="ml-2 text-xs text-slate-600">{etaLabel(load.latest_eta_prediction)}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
