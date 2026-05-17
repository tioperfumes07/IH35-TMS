import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listVendors } from "../../api/mdata";
import { listFactoringCandidateInvoices, submitFactoringBatch } from "../../api/accounting";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: (batchId: string) => void;
};

export function SubmitFactoringModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const [vendorId, setVendorId] = useState("");
  const [submissionRef, setSubmissionRef] = useState("");
  const [advanceRatePct, setAdvanceRatePct] = useState("92");
  const [reservePct, setReservePct] = useState("8");
  const [factorFeePct, setFactorFeePct] = useState("0");
  const [notes, setNotes] = useState("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vendorsQuery = useQuery({
    queryKey: ["factoring-vendors", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId }).then((res) => res.vendors),
    enabled: open && Boolean(operatingCompanyId),
  });

  const invoicesQuery = useQuery({
    queryKey: ["factoring-candidates", operatingCompanyId],
    queryFn: () => listFactoringCandidateInvoices(operatingCompanyId).then((res) => res.rows),
    enabled: open && Boolean(operatingCompanyId),
  });

  const selectedInvoices = useMemo(() => {
    const rows = invoicesQuery.data ?? [];
    const set = new Set(selectedInvoiceIds);
    return rows.filter((row) => set.has(row.id));
  }, [invoicesQuery.data, selectedInvoiceIds]);

  const selectedTotal = useMemo(
    () => selectedInvoices.reduce((sum, row) => sum + Number(row.total_cents ?? 0), 0),
    [selectedInvoices]
  );

  function toggleInvoice(invoiceId: string) {
    setSelectedInvoiceIds((current) => (current.includes(invoiceId) ? current.filter((id) => id !== invoiceId) : [...current, invoiceId]));
  }

  async function onSubmit() {
    setError(null);
    if (!vendorId) return setError("Pick a factoring company.");
    if (selectedInvoiceIds.length === 0) return setError("Select at least one invoice.");

    setIsSubmitting(true);
    try {
      const result = await submitFactoringBatch(operatingCompanyId, {
        factoring_company_vendor_id: vendorId,
        submission_batch_ref: submissionRef || undefined,
        invoice_ids: selectedInvoiceIds,
        advance_rate_pct: Number(advanceRatePct || 0),
        reserve_pct: Number(reservePct || 0),
        factor_fee_pct: Number(factorFeePct || 0),
        notes: notes || undefined,
      });
      onCreated(result.id);
    } catch (e) {
      setError("Failed to submit batch. Verify fields and retry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Submit Factoring Batch"
      onClose={() => {
        if (isSubmitting) return;
        onClose();
      }}
    >
      <div className="space-y-3 text-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Factoring company</span>
            <SelectCombobox className="h-9 rounded border border-gray-300 px-2 text-[13px]" value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
              <option value="">Select vendor</option>
              {(vendorsQuery.data ?? []).map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Submission batch ref</span>
            <input className="h-9 rounded border border-gray-300 px-2 text-[13px]" value={submissionRef} onChange={(event) => setSubmissionRef(event.target.value)} />
          </label>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Advance rate %</span>
            <input className="h-9 rounded border border-gray-300 px-2 text-[13px]" type="number" min={0} max={100} step="0.01" value={advanceRatePct} onChange={(event) => setAdvanceRatePct(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Reserve %</span>
            <input className="h-9 rounded border border-gray-300 px-2 text-[13px]" type="number" min={0} max={100} step="0.01" value={reservePct} onChange={(event) => setReservePct(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Factor fee %</span>
            <input className="h-9 rounded border border-gray-300 px-2 text-[13px]" type="number" min={0} max={100} step="0.01" value={factorFeePct} onChange={(event) => setFactorFeePct(event.target.value)} />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-600">Notes</span>
          <textarea className="min-h-[70px] rounded border border-gray-300 p-2 text-[13px]" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>

        <div>
          <div className="mb-1 text-xs font-semibold text-gray-600">Invoices to factor</div>
          <div className="max-h-64 overflow-y-auto rounded border border-gray-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Pick</th>
                  <th className="px-2 py-1.5 font-semibold">Invoice</th>
                  <th className="px-2 py-1.5 font-semibold">Customer</th>
                  <th className="px-2 py-1.5 font-semibold">Total</th>
                  <th className="px-2 py-1.5 font-semibold">Recourse</th>
                </tr>
              </thead>
              <tbody>
                {(invoicesQuery.data ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-2 py-1.5">
                      <input type="checkbox" checked={selectedInvoiceIds.includes(row.id)} onChange={() => toggleInvoice(row.id)} />
                    </td>
                    <td className="px-2 py-1.5 text-gray-900">{row.display_id}</td>
                    <td className="px-2 py-1.5 text-gray-700">{row.customer_name}</td>
                    <td className="px-2 py-1.5 text-gray-700">{money(row.total_cents)}</td>
                    <td className="px-2 py-1.5 text-gray-700">{row.customer_recourse_type}</td>
                  </tr>
                ))}
                {!invoicesQuery.isLoading && (invoicesQuery.data ?? []).length === 0 ? (
                  <tr>
                    <td className="px-2 py-2 text-gray-500" colSpan={5}>
                      No sent, eligible invoices available.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {error ? <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div> : null}

        <div className="flex items-center justify-between border-t border-gray-200 pt-2">
          <div className="text-xs text-gray-600">Selected total: {money(selectedTotal)}</div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void onSubmit()} loading={isSubmitting}>
              Submit
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
