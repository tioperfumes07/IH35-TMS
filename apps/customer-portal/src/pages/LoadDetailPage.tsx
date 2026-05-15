import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../api/client";

export function LoadDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: ["portal", "load", id],
    queryFn: () => apiRequest<Record<string, unknown>>(`/api/v1/portal/loads/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });

  if (!id) return <p className="text-sm text-red-600">Missing load.</p>;
  if (q.isLoading) return <p className="text-sm text-slate-600">Loading…</p>;
  if (q.isError || !q.data) return <p className="text-sm text-red-600">Load not found.</p>;

  const row = q.data;
  const pickup = row.pickup_pod_photo_r2_key ? String(row.pickup_pod_photo_r2_key) : null;
  const delivery = row.delivery_pod_photo_r2_key ? String(row.delivery_pod_photo_r2_key) : null;

  return (
    <div className="space-y-4">
      <Link to="/loads" className="text-sm text-sky-700 hover:underline">
        ← Loads
      </Link>
      <h1 className="text-xl font-semibold text-slate-900">Load {String(row.load_number ?? id)}</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800">
        <p>Status: {String(row.status ?? "")}</p>
        <p className="mt-2 font-medium text-slate-900">Proof of pickup</p>
        <p className="font-mono text-xs text-slate-600">{pickup ?? "—"}</p>
        <p className="mt-2 font-medium text-slate-900">Proof of delivery</p>
        <p className="font-mono text-xs text-slate-600">{delivery ?? "—"}</p>
      </div>
    </div>
  );
}
