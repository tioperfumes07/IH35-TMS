import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPodDocuments, reviewPodDocument, type PodDocumentSummary } from "../../api/dispatch";
import { LoadBolPanel } from "../../components/dispatch/LoadBolPanel";
import { PageHeader } from "../../components/layout/PageHeader";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";

function PodRowActions({
  doc,
  companyId,
  onReviewed,
}: {
  doc: PodDocumentSummary;
  companyId: string;
  onReviewed: (submittedCompanyId: string) => void;
}) {
  const { pushToast } = useToast();
  const generationRef = useRef(0);
  const scopeKey = `${companyId}:${doc.id}`;
  const scopeKeyRef = useRef(scopeKey);

  useEffect(() => {
    generationRef.current += 1;
    scopeKeyRef.current = scopeKey;
  }, [scopeKey]);

  // DISP-F6328: no toast import anywhere in the file, no isError check, fire-and-forget
  // .mutate(). A rejected Approve/Reject silently did nothing.
  const reviewMutation = useMutation({
    mutationFn: (input: {
      companyId: string;
      documentId: string;
      generation: number;
      scopeKey: string;
      status: "approved" | "rejected";
    }) => reviewPodDocument(input.documentId, { operating_company_id: input.companyId, status: input.status }),
    onSuccess: (_result, input) => {
      if (input.generation !== generationRef.current || input.scopeKey !== scopeKeyRef.current) return;
      onReviewed(input.companyId);
    },
    onError: (err, input) => {
      if (input.generation !== generationRef.current || input.scopeKey !== scopeKeyRef.current) return;
      pushToast(userFacingApiError(err, "Could not save the POD review"), "error");
    },
  });

  const submitReview = (status: "approved" | "rejected") => {
    if (reviewMutation.isPending) return;
    reviewMutation.mutate({
      companyId,
      documentId: doc.id,
      generation: generationRef.current,
      scopeKey: scopeKeyRef.current,
      status,
    });
  };

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
        onClick={() => submitReview("approved")}
      >
        Approve
      </button>
      <button
        type="button"
        className="rounded-sm border px-2 py-1 text-xs"
        data-testid={`pod-reject-${doc.id}`}
        disabled={reviewMutation.isPending}
        onClick={() => submitReview("rejected")}
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
  const staged = useStagedListFilters({
    applied: { loadId, statusFilter },
    empty: { loadId: "", statusFilter: "pending_review" as const },
    onApply: (next) => { setLoadId(next.loadId); setStatusFilter(next.statusFilter); },
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

  const documents = podsQuery.data?.documents ?? [];

  // Migrated to the shared QBO-parity grid — every column + the Approve/Reject row action preserved
  // verbatim (§7 additive-only).
  const columns = useMemo<ParityColumn<PodDocumentSummary>[]>(
    () => [
      {
        key: "load_number",
        label: "Load",
        sortable: true,
        render: (doc) => <EntityLinkOrTombstone kind="load" id={doc.load_id} name={doc.load_number} noun="Load" />,
      },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (doc) => (
          <EntityLinkOrTombstone kind="driver" id={doc.driver_id} name={doc.driver_name} noun="Driver" />
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
            onReviewed={(submittedCompanyId) =>
              void queryClient.invalidateQueries({ queryKey: ["pod-documents", submittedCompanyId] })
            }
          />
        ),
      },
    ],
    [companyId, queryClient],
  );

  const filterBar = (
    <CollapsedListFilters
      activeFilterCount={(loadId ? 1 : 0) + (statusFilter !== "pending_review" ? 1 : 0)}
      onApply={staged.apply}
      onReset={staged.reset}
      onCancel={staged.cancel}
      applyDisabled={!staged.dirty}
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
              value={staged.draft.loadId || null}
              onChange={(v) => staged.setDraft({ ...staged.draft, loadId: v ?? "" })}
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
            value={staged.draft.statusFilter}
            onChange={(event) => staged.setDraft({ ...staged.draft, statusFilter: event.target.value as typeof statusFilter })}
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
