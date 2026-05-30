import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createFactoringBatchDraft,
  listFactoringBatchCandidateInvoices,
  submitFactoringBatch,
  type FactoringBatch,
} from "../../api/factoring";
import { BatchDetail } from "./BatchDetail";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

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
    onError: (error) => pushToast(String((error as Error).message || "Failed to create draft batch"), "error"),
  });

  const submitMutation = useMutation({
    mutationFn: (batchId: string) => submitFactoringBatch(batchId, companyId),
    onError: (error) => pushToast(String((error as Error).message || "Failed to submit batch"), "error"),
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
    <div className="space-y-3 rounded border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {[
          { id: 1, label: "Select invoices" },
          { id: 2, label: "Review draft" },
          { id: 3, label: "Confirm submit" },
          { id: 4, label: "Submitted" },
        ].map((item) => (
          <span
            key={item.id}
            className={`rounded px-2 py-1 ${step === item.id ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"}`}
          >
            {item.id}. {item.label}
          </span>
        ))}
      </div>

      {step === 1 ? (
        <div className="space-y-3">
          <div className="text-sm text-gray-700">Step 1: select paid + ready invoices that are not already in a factoring batch.</div>
          <div className="rounded border border-gray-200 p-3 text-xs text-gray-700">
            Selected: <strong>{selectedCount}</strong> invoices · Face total: <strong>{asMoney(selectedTotalCents)}</strong>
          </div>
          <div className="max-h-72 overflow-auto rounded border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-2">Pick</th>
                  <th className="px-2 py-2">Invoice</th>
                  <th className="px-2 py-2">Customer</th>
                  <th className="px-2 py-2">Issue Date</th>
                  <th className="px-2 py-2">Due Date</th>
                  <th className="px-2 py-2 text-right">Face Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(candidatesQuery.data ?? []).map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.includes(invoice.id)}
                        onChange={() => toggleInvoice(invoice.id)}
                      />
                    </td>
                    <td className="px-2 py-2 font-medium text-gray-900">{invoice.display_id ?? invoice.id}</td>
                    <td className="px-2 py-2">{invoice.customer_name ?? "—"}</td>
                    <td className="px-2 py-2">{invoice.issue_date ?? "—"}</td>
                    <td className="px-2 py-2">{invoice.due_date ?? "—"}</td>
                    <td className="px-2 py-2 text-right">{asMoney(invoice.total_cents)}</td>
                  </tr>
                ))}
                {(candidatesQuery.data ?? []).length === 0 ? (
                  <tr>
                    <td className="px-2 py-4 text-gray-500" colSpan={6}>
                      {candidatesQuery.isLoading ? "Loading candidate invoices..." : "No paid-ready invoices available for a new batch."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
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
            <div className="rounded border border-gray-200 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">Batch Number</div>
              <div className="font-semibold text-gray-900">{draftBatch.batch_number}</div>
            </div>
            <div className="rounded border border-gray-200 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">Invoices</div>
              <div className="font-semibold text-gray-900">{draftBatch.invoice_ids.length}</div>
            </div>
            <div className="rounded border border-gray-200 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">Total Face</div>
              <div className="font-semibold text-gray-900">{asMoney(draftBatch.total_face_cents)}</div>
            </div>
            <div className="rounded border border-gray-200 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">Expected Advance</div>
              <div className="font-semibold text-gray-900">{asMoney(draftBatch.expected_advance_cents)}</div>
            </div>
            <div className="rounded border border-gray-200 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">Expected Fee</div>
              <div className="font-semibold text-gray-900">{asMoney(draftBatch.expected_fee_cents)}</div>
            </div>
            <div className="rounded border border-gray-200 p-3 text-sm">
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
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
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
          <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Step 4 complete. Batch submitted successfully.
          </div>
          {submittedBatchId && companyId ? <BatchDetail batchId={submittedBatchId} companyId={companyId} /> : null}
        </div>
      ) : null}
    </div>
  );
}

