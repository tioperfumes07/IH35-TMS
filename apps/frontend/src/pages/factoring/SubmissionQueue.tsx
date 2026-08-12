import { entityLabel } from "../../lib/entity-label";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSubmissionQueue, submitFactoringQueueBatch, type SubmissionQueueItem } from "../../api/factoring";
import { EntityLink } from "../../components/shared/EntityLink";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
function asMoney(cents: number) {
  return money.format((Number(cents) || 0) / 100);
}

function DocGateBadge({ item }: { item: SubmissionQueueItem }) {
  if (item.is_submittable) {
    return <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">Docs OK</span>;
  }
  return (
    <span className="rounded-sm bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700" title={item.missing_docs.join(", ")}>
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

  const queueQuery = useQuery({
    queryKey: ["factoring", "submission-queue", companyId],
    queryFn: () => listSubmissionQueue(companyId).then((r) => r.items),
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

  if (!companyId) {
    return (
      <div className="space-y-3 p-4">
        <PageHeader title="Submit to Factor" subtitle="Eligible invoices ready for factor submission" />
        <div
          className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700"
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

      {queueQuery.isError ? (
        <ListErrorBanner onRetry={() => void queueQuery.refetch()} />
      ) : queueQuery.isLoading ? (
        <div className="py-8 text-center text-xs text-slate-500">Loading eligible invoices…</div>
      ) : items.length === 0 ? (
        <div
          className="rounded-sm border border-slate-200 bg-white px-4 py-10 text-center text-xs text-slate-400"
          data-testid="factoring-submit-honest-empty"
        >
          No invoices in submission queue. Invoices appear here when status is <strong>sent</strong>, customer is factor-assigned, and no
          active batch exists.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {submittable.length} of {items.length} invoice{items.length !== 1 ? "s" : ""} ready to submit
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

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] font-semibold uppercase text-slate-400">
                  <th className="py-1.5 pr-2">
                    <input
                      type="checkbox"
                      checked={selected.length === submittable.length && submittable.length > 0}
                      onChange={toggleAll}
                      disabled={submittable.length === 0}
                    />
                  </th>
                  <th className="py-1.5 pr-3">Invoice</th>
                  <th className="py-1.5 pr-3">Customer</th>
                  <th className="py-1.5 pr-3">Issue Date</th>
                  <th className="py-1.5 pr-3 text-right">Amount</th>
                  <th className="py-1.5 pr-3 text-right">Expected Reserve</th>
                  <th className="py-1.5 pr-3">Factor</th>
                  <th className="py-1.5">Docs</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isChecked = selected.includes(item.invoice_id);
                  return (
                    <tr
                      key={item.invoice_id}
                      className={`border-b border-slate-100 ${item.is_submittable ? "hover:bg-slate-50" : "opacity-60"}`}
                    >
                      <td className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          disabled={!item.is_submittable}
                          checked={isChecked}
                          onChange={() => toggle(item.invoice_id)}
                        />
                      </td>
                      <td className="py-1.5 pr-3 font-mono">
                        <EntityLink
                          kind="invoice"
                          id={item.invoice_id}
                          label={entityLabel(item.display_id, item.invoice_id, "Invoice")}
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <EntityLink
                          kind="customer"
                          id={item.customer_id}
                          label={entityLabel(item.customer_name, item.customer_id, "Customer")}
                        />
                      </td>
                      <td className="py-1.5 pr-3">{item.issue_date ? formatDateUS(item.issue_date) : "—"}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{asMoney(item.total_cents)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">
                        {item.expected_reserve_cents != null ? asMoney(item.expected_reserve_cents) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-500">{item.factor_name ?? "—"}</td>
                      <td className="py-1.5">
                        <DocGateBadge item={item} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
