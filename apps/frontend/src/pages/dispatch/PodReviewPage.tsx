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
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters } from "../../components/table";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink } from "../../components/shared/EntityLink";

function PodRowActions({
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

  if (doc.status !== "pending_review") {
    return <span className="text-xs text-slate-500">{doc.review_notes ?? "Reviewed"}</span>;
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="rounded-sm border px-2 py-1 text-xs"
        data-testid={`pod-approve-${doc.id}`}
        disabled={reviewMutation.isPending}
        onClick={() => reviewMutation.mutate("approved")}
      >
        Approve
      </button>
      <button
        type="button"
        className="rounded-sm border px-2 py-1 text-xs"
        data-testid={`pod-reject-${doc.id}`}
        disabled={reviewMutation.isPending}
        onClick={() => reviewMutation.mutate("rejected")}
      >
        Reject
      </button>
    </div>
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
    <div className="rounded-sm border p-4" data-testid="load-pod-bol-panel">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Load POD + BOL</h3>
        <div className="flex gap-2">
          <a
            className="rounded-sm border px-3 py-1 text-sm"
            href={`/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/bol.pdf?operating_company_id=${encodeURIComponent(companyId)}`}
            data-testid="bol-download-link"
          >
            Download BOL PDF
          </a>
          <button
            type="button"
            className="rounded-sm bg-slate-900 px-3 py-1 text-sm text-white"
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

  const documents = podsQuery.data?.documents ?? [];

  // Migrated to the shared QBO-parity grid — every column + the Approve/Reject row action preserved
  // verbatim (§7 additive-only).
  const columns = useMemo<ParityColumn<PodDocumentSummary>[]>(
    () => [
      {
        key: "load_number",
        label: "Load",
        sortable: true,
        render: (doc) => <EntityLink kind="load" id={doc.load_id} label={doc.load_number ?? doc.load_id} />,
      },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (doc) => <EntityLink kind="driver" id={doc.driver_id} label={doc.driver_name ?? "—"} />,
      },
      { key: "recipient_name", label: "Recipient", render: (doc) => doc.recipient_name ?? "—" },
      {
        key: "status",
        label: "Status",
        sortable: true,
        cellClass: "capitalize",
        render: (doc) => doc.status.replace(/_/g, " "),
      },
      {
        key: "created_at",
        label: "Captured",
        sortable: true,
        render: (doc) => new Date(doc.created_at).toLocaleString(),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (doc) => (
          <PodRowActions
            doc={doc}
            companyId={companyId}
            onReviewed={() => void queryClient.invalidateQueries({ queryKey: ["pod-documents"] })}
          />
        ),
      },
    ],
    [companyId, queryClient],
  );

  const filterBar = (
    <CollapsedListFilters
      activeFilterCount={(loadId ? 1 : 0) + (statusFilter !== "pending_review" ? 1 : 0)}
      testIdPrefix="pod"
      dataAttributes={{ "data-pod-filter-toolbar": "collapsed" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Filter by load
          <select
            value={loadId}
            onChange={(event) => setLoadId(event.target.value)}
            className="mt-1 h-10 w-full rounded-sm border px-2"
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
            className="mt-1 h-10 w-full rounded-sm border px-2"
            data-testid="pod-status-filter"
          >
            <option value="pending_review">Pending review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
        </label>
      </div>
    </CollapsedListFilters>
  );

  return (
    <div className="p-4" data-testid="dispatch-pod-review-page">
      <PageHeader title="POD review + BOL" subtitle="Review driver proof-of-delivery captures and generate bills of lading." />

      {loadId ? <LoadBolPanel loadId={loadId} companyId={companyId} /> : null}

      <div className="mt-4">
        <ParityTable<PodDocumentSummary>
          columns={columns}
          rows={documents}
          rowKey={(doc) => doc.id}
          loading={podsQuery.isLoading}
          emptyText="No POD documents match the current filters."
          storageKey="dispatch-pod-review"
          exportFilename="pod-review"
          filterBar={filterBar}
          tableTestId="pod-review-panel"
          rowTestId={(doc) => `pod-row-${doc.id}`}
        />
      </div>
    </div>
  );
}
