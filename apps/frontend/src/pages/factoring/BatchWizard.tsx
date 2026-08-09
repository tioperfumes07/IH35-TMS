import { useMemo, useState } from "react";
import { userFacingApiError } from "../../lib/api-error-message";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createFactoringBatchDraft,
  listFactoringBatchCandidateInvoices,
  submitFactoringBatch,
  type FactoringBatch,
  type FactoringBatchInvoice,
} from "../../api/factoring";
import { ApiError } from "../../api/client";
import { BatchDetail } from "./BatchDetail";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLink } from "../../components/shared/EntityLink";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function asMoney(cents: number) {
  return money.format((Number(cents) || 0) / 100);
}

type WizardStep = 1 | 2 | 3 | 4;

export function BatchWizard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [draftBatch, setDraftBatch] = useState<FactoringBatch | null>(null);
  const [submittedBatchId, setSubmittedBatchId] = useState<string | null>(null);

  const candidatesQuery = useQuery({
    queryKey: ["factoring", "batch-wizard", "candidates", companyId],
    queryFn: () => listFactoringBatchCandidateInvoices(companyId).then((res) => res.invoices),
    enabled: Boolean(companyId),
  });

  const draftMutation = useMutation({
    mutationFn: (invoiceIds: string[]) => createFactoringBatchDraft(companyId, invoiceIds),
    onError: (error) => pushToast(userFacingApiError(error, "Failed to create draft batch"), "error"),
  });

  const submitMutation = useMutation({
    mutationFn: (batchId: string) => submitFactoringBatch(batchId, companyId),
    onError: (error) => pushToast(userFacingApiError(error, "Failed to submit batch"), "error"),
  });

  const selectedCount = selectedInvoiceIds.length;
  const selectedTotalCents = useMemo(() => {
    const set = new Set(selectedInvoiceIds);
    return (candidatesQuery.data ?? [])
      .filter((invoice) => set.has(invoice.id))
      .reduce((sum, invoice) => sum + Number(invoice.total_cents ?? 0), 0);
  }, [candidatesQuery.data, selectedInvoiceIds]);

  const toggleInvoice = (invoiceId: string) => {
    setSelectedInvoiceIds((current) =>
      current.includes(invoiceId) ? current.filter((id) => id !== invoiceId) : [...current, invoiceId]
    );
  };

  // Display-only ParityTable columns — the Pick checkbox keeps the exact toggleInvoice handler and
  // checked state from the former hand-rolled table; amount formatting/sign/order preserved 1:1.
  const candidateColumns = useMemo<Array<ParityColumn<FactoringBatchInvoice>>>(
    () => [
      {
        key: "pick",
        label: "Pick",
        alwaysVisible: true,
        render: (invoice) => (
          <input
            type="checkbox"
            aria-label="Pick invoice"
            checked={selectedInvoiceIds.includes(invoice.id)}
            onChange={() => toggleInvoice(invoice.id)}
          />
        ),
      },
      {
        key: "display_id",
        label: "Invoice",
        cellClass: "font-medium text-gray-900",
        render: (invoice) => <EntityLink kind="invoice" id={invoice.id} label={invoice.display_id ?? invoice.id} />,
      },
      {
        key: "customer_name",
        label: "Customer",
        render: (invoice) => invoice.customer_name ?? "—",
      },
      {
        key: "issue_date",
        label: "Issue Date",
        render: (invoice) => formatDateUS(invoice.issue_date) || "—",
      },
      {
        key: "due_date",
        label: "Due Date",
        render: (invoice) => formatDateUS(invoice.due_date) || "—",
      },
      {
        key: "total_cents",
        label: "Face Amount",
        className: "text-right",
        render: (invoice) => asMoney(invoice.total_cents),
      },
    ],
    [selectedInvoiceIds]
  );

  const createDraftAndProceed = async () => {
    if (!companyId) return;
    if (selectedInvoiceIds.length === 0) {
      pushToast("Select at least one invoice", "error");
      return;
    }
    const draft = await draftMutation.mutateAsync(selectedInvoiceIds);
    setDraftBatch(draft);
    setStep(2);
  };

  const submitBatchAndProceed = async () => {
    if (!draftBatch) return;
    const submitted = await submitMutation.mutateAsync(draftBatch.id);
    setSubmittedBatchId(submitted.id);
    setStep(4);
  };

  return (
    <div className="space-y-3">
      <PageHeader
        backHref="/factoring"
        breadcrumb={["Factoring", "Batch Wizard"]}
        title="Factoring Batch Wizard"
        subtitle="Assemble paid-ready invoices into a factoring batch"
      />
      <div className="space-y-3 rounded-sm border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {[
          { id: 1, label: "Select invoices" },
          { id: 2, label: "Review draft" },
          { id: 3, label: "Confirm submit" },
          { id: 4, label: "Submitted" },
        ].map((item) => (
          <span
            key={item.id}
            className={`rounded-sm px-2 py-1 ${step === item.id ? "bg-slate-100 text-slate-700" : "bg-gray-100 text-gray-600"}`}
          >
            {item.id}. {item.label}
          </span>
        ))}
      </div>

      {step === 1 ? (
        <div className="space-y-3">
          <div className="text-sm text-gray-700">Step 1: select paid + ready invoices that are not already in a factoring batch.</div>
          <div className="rounded-sm border border-gray-200 p-3 text-xs text-gray-700">
            Selected: <strong>{selectedCount}</strong> invoices · Face total: <strong>{asMoney(selectedTotalCents)}</strong>
          </div>
          {candidatesQuery.isError ? (
            <ListErrorState
              title="Couldn't load candidate invoices"
              status={candidatesQuery.error instanceof ApiError ? candidatesQuery.error.status : 0}
              message={(candidatesQuery.error as Error)?.message}
              onRetry={() => void candidatesQuery.refetch()}
            />
          ) : (
            <ParityTable<FactoringBatchInvoice>
              columns={candidateColumns}
              rows={candidatesQuery.data ?? []}
              rowKey={(invoice) => invoice.id}
              loading={candidatesQuery.isLoading}
              emptyText="No paid-ready invoices available for a new batch."
              storageKey="factoring-batch-wizard-candidates"
              tableTestId="factoring-batch-wizard-candidates-parity"
            />
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={() => void createDraftAndProceed()} loading={draftMutation.isPending} disabled={!companyId}>
              Continue to Review
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 && draftBatch ? (
        <div className="space-y-3">
          <div className="text-sm text-gray-700">Step 2: review computed totals and generated batch number.</div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-sm border border-gray-200 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">Batch Number</div>
              <div className="font-semibold text-gray-900">{draftBatch.batch_number}</div>
            </div>
            <div className="rounded-sm border border-gray-200 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">Invoices</div>
              <div className="font-semibold text-gray-900">{draftBatch.invoice_ids.length}</div>
            </div>
            <div className="rounded-sm border border-gray-200 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">Total Face</div>
              <div className="font-semibold text-gray-900">{asMoney(draftBatch.total_face_cents)}</div>
            </div>
            <div className="rounded-sm border border-gray-200 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">Expected Advance</div>
              <div className="font-semibold text-gray-900">{asMoney(draftBatch.expected_advance_cents)}</div>
            </div>
            <div className="rounded-sm border border-gray-200 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">Expected Fee</div>
              <div className="font-semibold text-gray-900">{asMoney(draftBatch.expected_fee_cents)}</div>
            </div>
            <div className="rounded-sm border border-gray-200 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">Rates</div>
              <div className="font-semibold text-gray-900">
                Advance {(draftBatch.advance_rate * 100).toFixed(2)}% · Fee {(draftBatch.fee_rate * 100).toFixed(2)}%
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setStep(3)}>
              Continue to Confirm
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 && draftBatch ? (
        <div className="space-y-3">
          <div className="text-sm text-gray-700">Step 3: confirm and submit the factoring batch.</div>
          <div className="rounded-sm border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700">
            Submitting this batch moves status from <code>draft</code> to <code>submitted</code>.
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button size="sm" onClick={() => void submitBatchAndProceed()} loading={submitMutation.isPending}>
              Confirm + Submit
            </Button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-3">
          <div className="rounded-sm border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700">
            Step 4 complete. Batch submitted successfully.
          </div>
          {submittedBatchId && companyId ? <BatchDetail batchId={submittedBatchId} companyId={companyId} /> : null}
        </div>
      ) : null}
      </div>
    </div>
  );
}

