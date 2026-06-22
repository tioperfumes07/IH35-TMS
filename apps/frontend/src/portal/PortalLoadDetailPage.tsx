import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { apiRequest } from "../api/client";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/layout/StatusBadge";

type Milestone = {
  id: string;
  milestone_type: string;
  occurred_at: string;
  notes: string | null;
};

type Stop = {
  stop_type: string;
  city: string | null;
  state: string | null;
  address_line1: string | null;
  scheduled_arrival_at: string | null;
  actual_arrival_at: string | null;
  status: string;
};

type LoadDetail = {
  load: {
    id: string;
    load_number: string;
    status: string;
    progress_status: string | null;
    progress_eta_delta_minutes: number | null;
  };
  stops: Stop[];
  milestones: Milestone[];
  tracking: {
    location_text: string;
    last_update_text: string;
    lat: number;
    lng: number;
  } | null;
};

type DocumentRow = {
  id: string;
  category: string;
  filename: string;
};

function milestoneLabel(type: string) {
  return type.replace(/_/g, " ");
}

export function PortalLoadDetailPage() {
  const { id = "" } = useParams();

  const detailQuery = useQuery({
    queryKey: ["portal", "load", id],
    queryFn: () => apiRequest<LoadDetail>(`/api/v1/portal/loads/${id}`),
    enabled: Boolean(id),
    refetchInterval: 30_000,
  });

  const docsQuery = useQuery({
    queryKey: ["portal", "load", id, "documents"],
    queryFn: () => apiRequest<{ documents: DocumentRow[] }>(`/api/v1/portal/loads/${id}/documents`).then((r) => r.documents),
    enabled: Boolean(id),
  });

  async function downloadDoc(attachmentId: string) {
    const res = await apiRequest<{ download_url: string }>(`/api/v1/portal/loads/${id}/documents/${attachmentId}/download`);
    window.open(res.download_url, "_blank", "noopener,noreferrer");
  }

  const detail = detailQuery.data;
  const pickup = detail?.stops.find((s) => s.stop_type === "pickup");
  const delivery = detail?.stops.find((s) => s.stop_type === "delivery");

  return (
    <div className="space-y-6">
      {detailQuery.isLoading ? <p className="text-sm text-slate-600">Loading load…</p> : null}
      {detailQuery.error ? <p className="text-sm text-red-600">Load not found.</p> : null}

      {detail ? (
        <>
          <div className="rounded border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold">Load {detail.load.load_number}</h1>
              <StatusBadge variant="neutral">{detail.load.status.replace(/_/g, " ")}</StatusBadge>
              <StatusBadge variant="info">{detail.load.progress_status ?? "unknown"}</StatusBadge>
            </div>
            {detail.load.progress_eta_delta_minutes != null ? (
              <p className="mt-2 text-sm text-slate-600">ETA delta vs schedule: {detail.load.progress_eta_delta_minutes} min</p>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded border border-slate-200 bg-white p-4 text-sm">
              <h2 className="font-semibold text-slate-900">Pickup</h2>
              <p className="mt-2 text-slate-700">{pickup?.address_line1}</p>
              <p className="text-slate-700">{[pickup?.city, pickup?.state].filter(Boolean).join(", ")}</p>
            </div>
            <div className="rounded border border-slate-200 bg-white p-4 text-sm">
              <h2 className="font-semibold text-slate-900">Delivery</h2>
              <p className="mt-2 text-slate-700">{delivery?.address_line1}</p>
              <p className="text-slate-700">{[delivery?.city, delivery?.state].filter(Boolean).join(", ")}</p>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">Live location</h2>
            {detail.tracking ? (
              <p className="mt-2 text-sm text-slate-700">
                {detail.tracking.location_text} · {detail.tracking.last_update_text}
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Location unavailable — truck not assigned or GPS pending.</p>
            )}
          </div>

          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-4 font-semibold text-slate-900">Milestones</h2>
            <ol className="space-y-4 border-l-2 border-slate-200 pl-4">
              {detail.milestones.map((m) => (
                <li key={m.id} className="relative">
                  <span className="absolute -left-[1.35rem] top-1 h-3 w-3 rounded-full bg-[#1F2A44]" aria-hidden />
                  <p className="font-medium capitalize text-slate-900">{milestoneLabel(m.milestone_type)}</p>
                  <p className="text-xs text-slate-500">{new Date(m.occurred_at).toLocaleString()}</p>
                </li>
              ))}
              {detail.milestones.length === 0 ? <li className="text-sm text-slate-600">No milestones recorded yet.</li> : null}
            </ol>
          </div>

          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-semibold text-slate-900">Documents</h2>
            <ul className="space-y-2 text-sm">
              {(docsQuery.data ?? []).map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3">
                  <span className="uppercase text-slate-700">
                    {doc.category}: {doc.filename}
                  </span>
                  <Button variant="secondary" onClick={() => void downloadDoc(doc.id)}>
                    Download
                  </Button>
                </li>
              ))}
              {(docsQuery.data ?? []).length === 0 ? <li className="text-slate-600">No documents available yet.</li> : null}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
