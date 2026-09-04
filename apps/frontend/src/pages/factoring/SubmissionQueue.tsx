import { entityLabel } from "../../lib/entity-label";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSubmissionQueue, submitFactoringQueueBatch, type SubmissionQueueItem } from "../../api/factoring";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityPicker } from "../../components/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useStagedListFilters } from "../../components/table";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
function asMoney(cents: number) {
  return money.format((Number(cents) || 0) / 100);
}

const EMPTY_FILTERS = {
  customerId: "",
  loadId: "",
};

function DocGateBadge({ item }: { item: SubmissionQueueItem }) {
  if (item.is_submittable) {
    return <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">Docs OK</span>;
  }
  return (
    <span className="rounded-sm bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700" title={item.missing_docs.join(", ")}>
      Missing: {item.missing_docs.join(", ")}
    </span>
  );
}

export function SubmissionQueue() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // LINK-F5171/LINK-F5181 — reverse_link: CustomerDetail/FactoringTab link here as
  // ?customer_id=/?load_id=; LST-F5163N adds visible EntityPicker filters (URL-only is not reverse chrome).
  // LST-F5196 + LV-FACTORING-SUBMISSION-QUEUE-FILTER-SILENT-APPLY — stage until Apply; URL on Apply/Reset.
  const [searchParams, setSearchParams] = useSearchParams();
  const customerIdFromUrl = searchParams.get("customer_id")?.trim() ?? "";
  const loadIdFromUrl = searchParams.get("load_id")?.trim() ?? "";

  function patchListSearchParam(next: { customerId: string; loadId: string }) {
    const p = new URLSearchParams(searchParams);
    if (next.customerId) p.set("customer_id", next.customerId);
    else p.delete("customer_id");
    if (next.loadId) p.set("load_id", next.loadId);
    else p.delete("load_id");
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    customerId: customerIdFromUrl,
    loadId: loadIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchListSearchParam(next);
    },
  });
  const filterDraft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({
      ...prev,
      customerId: customerIdFromUrl,
      loadId: loadIdFromUrl,
    }));
  }, [customerIdFromUrl, loadIdFromUrl]);

  function setCustomerFilter(next: string) {
    staged.setDraft((d) => ({ ...d, customerId: next }));
  }
  function setLoadFilter(next: string) {
    staged.setDraft((d) => ({ ...d, loadId: next }));
  }

  const effectiveCustomerId = applied.customerId.trim() || undefined;
  const effectiveLoadId = applied.loadId.trim() || undefined;

  const queueQuery = useQuery({
    queryKey: ["factoring", "submission-queue", companyId, effectiveCustomerId, effectiveLoadId],
    queryFn: () =>
      listSubmissionQueue(companyId, {
        customer_id: effectiveCustomerId,
        load_id: effectiveLoadId,
      }).then((r) => r.items),
    enabled: Boolean(companyId),
  });

  const items = queueQuery.data ?? [];
  const submittable = items.filter((item) => item.is_submittable);
  const selected = selectedIds.filter((id) => submittable.some((item) => item.invoice_id === id));

  const submitMutation = useMutation({
    mutationFn: () => submitFactoringQueueBatch(companyId, selected),
    onSuccess: (batch) => {
      pushToast(`Batch ${batch.batch_number} submitted`, "success");
      setSelectedIds([]);
      void qc.invalidateQueries({ queryKey: ["factoring", "submission-queue", companyId] });
      void qc.invalidateQueries({ queryKey: ["factoring", "workqueue", companyId] });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Submission failed";
      pushToast(msg, "error");
    },
  });

  const toggleAll = () => {
    const ids = submittable.map((item) => item.invoice_id);
    setSelectedIds((prev) => (prev.length === ids.length ? [] : ids));
  };

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedTotal = items
    .filter((item) => selected.includes(item.invoice_id))
    .reduce((sum, item) => sum + Number(item.total_cents ?? 0), 0);
  // WAVE-C-liability-submit-queue: preview of the reserve/liability the selected invoices
  // would create — sums the per-invoice expected_reserve_cents the backend already resolved
  // from the customer's live factoring.factor.reserve_rate (same lookup batch creation uses).
  const selectedExpectedReserve = items
    .filter((item) => selected.includes(item.invoice_id))
    .reduce((sum, item) => sum + Number(item.expected_reserve_cents ?? 0), 0);

  const columns = useMemo<ParityColumn<SubmissionQueueItem>[]>(
    () => [
      {
        key: "select",
        label: "Select",
        render: (item) => (
          <input
            type="checkbox"
            disabled={!item.is_submittable}
            checked={selected.includes(item.invoice_id)}
            onChange={() => toggle(item.invoice_id)}
            aria-label={`Select invoice ${item.display_id ?? item.invoice_id}`}
          />
        ),
      },
      {
        key: "invoice_id",
        label: "Invoice",
        render: (item) => (
          <EntityLink
            kind="invoice"
            id={item.invoice_id}
            label={entityLabel(item.display_id, item.invoice_id, "Invoice")}
          />
        ),
      },
      {
        key: "customer_id",
        label: "Customer",
        render: (item) => (
          <EntityLink
            kind="customer"
            id={item.customer_id}
            label={entityLabel(item.customer_name, item.customer_id, "Customer")}
          />
        ),
      },
      {
        key: "issue_date",
        label: "Issue Date",
        sortable: true,
        render: (item) => (item.issue_date ? formatDateUS(item.issue_date) : "—"),
      },
      {
        key: "total_cents",
        label: "Amount",
        sortable: true,
        render: (item) => <span className="tabular-nums">{asMoney(item.total_cents)}</span>,
      },
      {
        key: "expected_reserve_cents",
        label: "Expected Reserve",
        render: (item) => (
          <span className="tabular-nums text-slate-600">
            {item.expected_reserve_cents != null ? asMoney(item.expected_reserve_cents) : "—"}
          </span>
        ),
      },
      {
        key: "factor_name",
        label: "Factor",
        render: (item) => <span className="text-slate-500">{item.factor_name ?? "—"}</span>,
      },
      {
        key: "docs",
        label: "Docs",
        render: (item) => <DocGateBadge item={item} />,
      },
    ],
    [selected, submittable.length],
  );

  if (!companyId) {
    return (
      <div className="space-y-3 p-4">
        <PageHeader title="Submit to Factor" subtitle="Eligible invoices ready for factor submission" />
        <div
          className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-700"
          data-testid="factoring-submit-need-company"
        >
          Select an operating company to view the submission queue.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <PageHeader title="Submit to Factor" subtitle="Eligible invoices ready for factor submission" />

      <div className="relative flex flex-wrap items-end gap-3" data-testid="factoring-submit-filters">
        <label className="text-[11px] text-slate-600">
          Customer
          <EntityPicker
            kind="customer"
            operatingCompanyId={companyId}
            value={filterDraft.customerId || null}
            onChange={(next) => setCustomerFilter(next ?? "")}
            allowCreate={false}
            placeholder="All customers"
            className="mt-1"
            dataTestId="factoring-submit-filter-customer"
          />
        </label>
        <label className="text-[11px] text-slate-600">
          Load
          <EntityPicker
            kind="load"
            operatingCompanyId={companyId}
            value={filterDraft.loadId || null}
            onChange={(next) => setLoadFilter(next ?? "")}
            allowCreate={false}
            placeholder="All loads"
            className="mt-1"
            dataTestId="factoring-submit-filter-load"
          />
        </label>
        <Button type="button" size="sm" data-testid="factoring-submit-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="factoring-submit-filter-cancel"
          onClick={staged.cancel}
          disabled={!staged.dirty}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="factoring-submit-filter-reset"
          onClick={() => {
            staged.cancel();
            setApplied(EMPTY_FILTERS);
            patchListSearchParam(EMPTY_FILTERS);
          }}
        >
          Reset
        </Button>
      </div>

      {queueQuery.isError ? (
        <ListErrorBanner onRetry={() => void queueQuery.refetch()} />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                {submittable.length} of {items.length} invoice{items.length !== 1 ? "s" : ""} ready to submit
              </span>
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={selected.length === submittable.length && submittable.length > 0}
                  onChange={toggleAll}
                  disabled={submittable.length === 0 || queueQuery.isLoading}
                />
                Select all submittable
              </label>
            </div>
            {selected.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500" data-testid="factoring-submit-expected-reserve">
                  Expected reserve: {asMoney(selectedExpectedReserve)}
                </span>
                <Button type="button" disabled={submitMutation.isPending} onClick={() => submitMutation.mutate()}>
                  Submit {selected.length} invoice{selected.length !== 1 ? "s" : ""} — {asMoney(selectedTotal)}
                </Button>
              </div>
            )}
          </div>

          {/* FAC-F3540: always mount ParityTable (Search+Range+gear); raw HTML table had no surface bar. */}
          <div data-testid="factoring-submit-honest-empty">
            <ParityTable<SubmissionQueueItem>
              columns={columns}
              rows={items}
              rowKey={(item) => item.invoice_id}
              loading={queueQuery.isLoading}
              emptyText="No invoices in submission queue. Invoices appear here when status is sent, customer is factor-assigned, and no active batch exists."
              storageKey="factoring-submission-queue"
              exportFilename="factoring-submission-queue"
              rowClassName={(item) => (item.is_submittable ? "" : "opacity-60")}
              tableTestId="factoring-submission-queue-table"
            />
          </div>

          {submitMutation.isError && (
            <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {submitMutation.error instanceof Error
                ? submitMutation.error.message
                : "Submission failed — check docs and try again."}
            </div>
          )}
        </>
      )}
    </div>
  );
}
