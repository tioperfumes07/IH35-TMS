import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../api/client";
import { StatusBadge } from "../components/layout/StatusBadge";

type PortalLoadRow = {
  id: string;
  load_number: string;
  status: string;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  progress_status: string | null;
};

export function PortalDashboardPage() {
  const loadsQuery = useQuery({
    queryKey: ["portal", "loads"],
    queryFn: () => apiRequest<{ loads: PortalLoadRow[] }>("/api/v1/portal/loads").then((r) => r.loads),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Your loads</h1>
        <p className="text-sm text-slate-600">Active and recent shipments for your account.</p>
      </div>

      {loadsQuery.isLoading ? <p className="text-sm text-slate-600">Loading loads…</p> : null}
      {loadsQuery.error ? <p className="text-sm text-red-600">Could not load shipments.</p> : null}

      <div className="overflow-hidden rounded border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Load #</th>
              <th className="px-4 py-2 font-medium">Route</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Progress</th>
            </tr>
          </thead>
          <tbody>
            {(loadsQuery.data ?? []).map((load) => (
              <tr key={load.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <Link to={`/portal/loads/${load.id}`} className="font-medium text-blue-700 hover:underline">
                    {load.load_number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {[load.pickup_city, load.pickup_state].filter(Boolean).join(", ")} → {[load.delivery_city, load.delivery_state].filter(Boolean).join(", ")}
                </td>
                <td className="px-4 py-3 capitalize">{load.status.replace(/_/g, " ")}</td>
                <td className="px-4 py-3">
                  <StatusBadge variant="neutral">{load.progress_status ?? "unknown"}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(loadsQuery.data ?? []).length === 0 && !loadsQuery.isLoading ? (
          <p className="px-4 py-6 text-sm text-slate-600">No loads to display yet.</p>
        ) : null}
      </div>
    </div>
  );
}
