import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../api/client";

export function LoadsPage() {
  const q = useQuery({
    queryKey: ["portal", "loads", "list"],
    queryFn: () =>
      apiRequest<{
        loads: Array<{
          id: string;
          load_number: string | null;
          status: string;
          pickup_pod_photo_r2_key: string | null;
          delivery_pod_photo_r2_key: string | null;
        }>;
      }>("/api/v1/portal/loads?limit=50"),
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Loads</h1>
      <p className="mt-1 text-sm text-slate-600">Completed loads with proof-of-delivery references.</p>
      <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {(q.data?.loads ?? []).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
            <div>
              <Link className="font-medium text-sky-800 hover:underline" to={`/loads/${r.id}`}>
                {r.load_number ?? r.id.slice(0, 8)}
              </Link>
              <span className="ml-2 text-slate-500">{r.status}</span>
            </div>
            <div className="text-xs text-slate-500">
              {r.pickup_pod_photo_r2_key || r.delivery_pod_photo_r2_key ? "POD on file" : "—"}
            </div>
          </li>
        ))}
        {(q.data?.loads ?? []).length === 0 && !q.isLoading ? (
          <li className="px-3 py-6 text-slate-500">No loads.</li>
        ) : null}
      </ul>
    </div>
  );
}
