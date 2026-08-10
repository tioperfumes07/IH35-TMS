import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getPodDocuments, reviewPodDocument, type PodDocumentSummary } from "../../api/dispatch";
import { LoadBolPanel } from "../../components/dispatch/LoadBolPanel";
import { PageHeader } from "../../components/layout/PageHeader";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters } from "../../components/table";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";

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

export function PodReviewPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [loadId, setLoadId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"pending_review" | "approved" | "rejected" | "">("pending_review");

  const podsQuery = useQuery({
    queryKey: ["pod-documents", companyId, statusFilter, loadId],
    queryFn: () =>
      getPodDocuments(companyId, {
        status: statusFilter || undefined,
        load_id: loadId || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const documents = podsQuery.data?.documents ?? [];

  // Migrated to the shared QBO-parity grid — every column + the Approve/Reject row action preserved
  // verbatim (§7 additive-only).
  const columns = useMemo<ParityColumn<PodDocumentSummary>[]>(
    () => [
      {
        key: "load_number",
        label: "Load",
        sortable: true,
        render: (doc) => <EntityLink kind="load" id={doc.load_id} label={entityLabel(doc.load_number, doc.load_id, "Load")} />,
      },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (doc) => (
          <EntityLink kind="driver" id={doc.driver_id} label={entityLabel(doc.driver_name, doc.driver_id, "Driver")} />
        ),
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
          <div className="mt-1" data-testid="pod-load-filter">
            <EntityPicker
              kind="load"
              operatingCompanyId={companyId}
              value={loadId || null}
              onChange={(v) => setLoadId(v ?? "")}
              enabled={Boolean(companyId)}
              allowCreate={false}
              allowClear
              placeholder="All loads"
            />
          </div>
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
        {podsQuery.isError ? (
          <ListErrorState
            title="Couldn't load POD documents"
            {...formatQueryErrorDetail(podsQuery.error)}
            onRetry={() => void podsQuery.refetch()}
          />
        ) : (
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
        )}
      </div>
    </div>
  );
}
