import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  downloadBolDocument,
  generateLoadBol,
  getLoadPodBolSummary,
  getPodDocuments,
  listDispatchLoads,
  reviewPodDocument,
  type BolDocumentSummary,
  type PodDocumentSummary,
} from "../../api/dispatch";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

function PodRow({
  doc,
  companyId,
  onReviewed,
}: {
  doc: PodDocumentSummary;
  companyId: string;
  onReviewed: () => void;
}) {
  const reviewMutation = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      reviewPodDocument(doc.id, { operating_company_id: companyId, status }),
    onSuccess: onReviewed,
  });

  return (
    <tr className="border-t" data-testid={`pod-row-${doc.id}`}>
      <td className="px-3 py-2">{doc.load_number ?? doc.load_id}</td>
      <td className="px-3 py-2">{doc.driver_name ?? "—"}</td>
      <td className="px-3 py-2">{doc.recipient_name ?? "—"}</td>
      <td className="px-3 py-2 capitalize">{doc.status.replace(/_/g, " ")}</td>
      <td className="px-3 py-2">{new Date(doc.created_at).toLocaleString()}</td>
      <td className="px-3 py-2">
        {doc.status === "pending_review" ? (
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              data-testid={`pod-approve-${doc.id}`}
              disabled={reviewMutation.isPending}
              onClick={() => reviewMutation.mutate("approved")}
            >
              Approve
            </button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              data-testid={`pod-reject-${doc.id}`}
              disabled={reviewMutation.isPending}
              onClick={() => reviewMutation.mutate("rejected")}
            >
              Reject
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-500">{doc.review_notes ?? "Reviewed"}</span>
        )}
      </td>
    </tr>
  );
}

function LoadBolPanel({ loadId, companyId }: { loadId: string; companyId: string }) {
  const queryClient = useQueryClient();
  const summaryQuery = useQuery({
    queryKey: ["pod-bol-summary", companyId, loadId],
    queryFn: () => getLoadPodBolSummary(loadId, companyId),
    enabled: Boolean(companyId && loadId),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateLoadBol(loadId, companyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pod-bol-summary", companyId, loadId] });
    },
  });

  const bols = summaryQuery.data?.bols ?? [];
  const pods = summaryQuery.data?.pods ?? [];

  return (
    <div className="rounded border p-4" data-testid="load-pod-bol-panel">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Load POD + BOL</h3>
        <div className="flex gap-2">
          <a
            className="rounded border px-3 py-1 text-sm"
            href={`/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/bol.pdf?operating_company_id=${encodeURIComponent(companyId)}`}
            data-testid="bol-download-link"
          >
            Download BOL PDF
          </a>
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-1 text-sm text-white"
            data-testid="bol-generate-button"
            disabled={generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending ? "Generating…" : "Generate BOL"}
          </button>
        </div>
      </div>
      <p className="mb-2 text-xs text-slate-600">
        {pods.length} POD(s) · {bols.length} generated BOL(s)
      </p>
      {bols.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {bols.map((bol: BolDocumentSummary) => (
            <li key={bol.id} className="flex items-center justify-between gap-2">
              <span>{new Date(bol.generated_at).toLocaleString()} · {bol.template_version}</span>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => void downloadBolDocument(bol.id, companyId).then((res) => window.open(res.download_url, "_blank"))}
              >
                Download stored copy
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">No stored BOL yet — generate from load data.</p>
      )}
    </div>
  );
}

export function PodReviewPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [loadId, setLoadId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"pending_review" | "approved" | "rejected" | "">("pending_review");

  const loadsQuery = useQuery({
    queryKey: ["loads-pod-review", companyId],
    queryFn: () =>
      listDispatchLoads({
        operating_company_id: companyId,
        view: "loads",
        limit: 50,
        offset: 0,
        status: [],
      }),
    enabled: Boolean(companyId),
  });

  const podsQuery = useQuery({
    queryKey: ["pod-documents", companyId, statusFilter, loadId],
    queryFn: () =>
      getPodDocuments(companyId, {
        status: statusFilter || undefined,
        load_id: loadId || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const loadOptions = useMemo(() => loadsQuery.data?.loads ?? [], [loadsQuery.data]);

  return (
    <div className="p-4" data-testid="dispatch-pod-review-page">
      <PageHeader title="POD review + BOL" subtitle="Review driver proof-of-delivery captures and generate bills of lading." />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          Filter by load
          <select
            value={loadId}
            onChange={(event) => setLoadId(event.target.value)}
            className="mt-1 h-10 w-full rounded border px-2"
            data-testid="pod-load-filter"
          >
            <option value="">All loads</option>
            {loadOptions.map((load) => (
              <option key={load.id} value={load.id}>
                {load.load_number ?? load.id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          POD status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="mt-1 h-10 w-full rounded border px-2"
            data-testid="pod-status-filter"
          >
            <option value="pending_review">Pending review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
        </label>
      </div>

      {loadId ? <LoadBolPanel loadId={loadId} companyId={companyId} /> : null}

      <div className="mt-4 overflow-x-auto rounded border" data-testid="pod-review-panel">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Load</th>
              <th className="px-3 py-2">Driver</th>
              <th className="px-3 py-2">Recipient</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Captured</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(podsQuery.data?.documents ?? []).map((doc) => (
              <PodRow
                key={doc.id}
                doc={doc}
                companyId={companyId}
                onReviewed={() => void queryClient.invalidateQueries({ queryKey: ["pod-documents"] })}
              />
            ))}
          </tbody>
        </table>
        {(podsQuery.data?.documents ?? []).length === 0 ? (
          <p className="p-4 text-sm text-slate-600">No POD documents match the current filters.</p>
        ) : null}
      </div>
    </div>
  );
}
