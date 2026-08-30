import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listVendors } from "../../api/mdata";
import { listFactoringCandidateInvoices, submitFactoringBatch } from "../../api/accounting";
import { getFactoringSummary, listFactors } from "../../api/factoring";
import { Button } from "../../components/Button";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { ParityTable } from "../../components/parity/ParityTable";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { vendorReferenceOption } from "../../components/parity/referenceOptionLabels";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function factorRateToPct(rate: number | null | undefined) {
  if (rate == null || Number.isNaN(Number(rate))) return "";
  return String(Number((Number(rate) * 100).toFixed(4)));
}

// CHROME-14: outer shell swapped from centered Modal to ParityDrawer size="wide" (QBO side-panel chrome),
// Cancel/Submit + selected-total moved into the drawer's sticky footer. Presentational only —
// submitFactoringBatch payload, validation, and the vendor/invoice pickers above are untouched.

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: (batchId: string) => void;
};

export function SubmitFactoringModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const [vendorId, setVendorId] = useState("");
  const [submissionRef, setSubmissionRef] = useState("");
  const [advanceRatePct, setAdvanceRatePct] = useState("");
  const [reservePct, setReservePct] = useState("");
  const [factorFeePct, setFactorFeePct] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vendorsQuery = useQuery({
    queryKey: ["factoring-vendors", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId, limit: 1000 }).then((res) => res.vendors),
    enabled: open && Boolean(operatingCompanyId),
  });

  const invoicesQuery = useQuery({
    queryKey: ["factoring-candidates", operatingCompanyId],
    queryFn: () => listFactoringCandidateInvoices(operatingCompanyId).then((res) => res.rows),
    enabled: open && Boolean(operatingCompanyId),
  });
  const factoringSummaryQuery = useQuery({
    queryKey: ["factoring", "summary", operatingCompanyId],
    queryFn: () => getFactoringSummary(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });
  const factorsQuery = useQuery({
    queryKey: ["factoring", "factors", operatingCompanyId, "active"],
    queryFn: () => listFactors(operatingCompanyId, { active_only: true }).then((res) => res.factors),
    enabled: open && Boolean(operatingCompanyId),
  });

  const activeFactor = useMemo(() => {
    const factors = factorsQuery.data ?? [];
    if (factors.length === 0) return null;
    const targetName = factoringSummaryQuery.data?.active_factor_name?.trim();
    if (targetName) {
      const byName = factors.find((factor) => factor.name === targetName);
      if (byName) return byName;
    }
    const activeFactors = factors.filter((factor) => factor.active);
    // FACT-RESERVE-02: never silent-price from activeFactors[0] while assignment is empty.
    if (activeFactors.length === 1) return activeFactors[0];
    return null;
  }, [factorsQuery.data, factoringSummaryQuery.data?.active_factor_name]);

  const selectedInvoices = useMemo(() => {
    const rows = invoicesQuery.data ?? [];
    const set = new Set(selectedInvoiceIds);
    return rows.filter((row) => set.has(row.id));
  }, [invoicesQuery.data, selectedInvoiceIds]);

  const selectedTotal = useMemo(
    () =>
      selectedInvoices.reduce(
        (sum, row) => sum + Number(row.pledge_cents ?? row.total_cents ?? 0),
        0
      ),
    [selectedInvoices]
  );

  // WAVE-C-liability-accounting-submit: reserve/liability this submission will create, from the
  // SAME reservePct field the submit payload already sends (reserve_pct) — preview only, no posting.
  const selectedExpectedReserve = useMemo(
    () => Math.round(selectedTotal * (Number(reservePct || 0) / 100)),
    [selectedTotal, reservePct]
  );

  useEffect(() => {
    if (!open) return;
    if (!vendorId && factoringSummaryQuery.data?.active_factor_id) {
      setVendorId(factoringSummaryQuery.data.active_factor_id);
    }
    if (!activeFactor) return;
    const advancePct = factorRateToPct(activeFactor.advance_rate);
    const reservePctValue = factorRateToPct(activeFactor.reserve_rate);
    const feePct = factorRateToPct(activeFactor.fee_rate);
    if (advancePct) setAdvanceRatePct(advancePct);
    if (reservePctValue) setReservePct(reservePctValue);
    if (feePct) setFactorFeePct(feePct);
  }, [activeFactor, factoringSummaryQuery.data?.active_factor_id, open, vendorId]);

  async function onSubmit() {
    setError(null);
    if (!vendorId) return setError("Pick a factoring company.");
    if (selectedInvoiceIds.length === 0) return setError("Select at least one invoice.");
    if (!activeFactor) {
      return setError("No factor resolved for this company. Assign Faro (or the active factor) before submitting — do not price at 92/8/0 defaults.");
    }
    const advance = Number(advanceRatePct);
    const reserve = Number(reservePct);
    const fee = Number(factorFeePct);
    if (![advance, reserve, fee].every((n) => Number.isFinite(n))) {
      return setError("Advance, reserve, and factor fee % must come from the resolved factor row.");
    }

    setIsSubmitting(true);
    try {
      const result = await submitFactoringBatch(operatingCompanyId, {
        factoring_company_vendor_id: vendorId,
        submission_batch_ref: submissionRef || undefined,
        invoice_ids: selectedInvoiceIds,
        advance_rate_pct: advance,
        reserve_pct: reserve,
        factor_fee_pct: fee,
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
    <ParityDrawer
      open={open}
      title="Submit Factoring Batch"
      size="wide"
      onClose={() => {
        if (isSubmitting) return;
        onClose();
      }}
      footer={
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-600" data-testid="submit-factoring-expected-reserve">
            Selected total: {money(selectedTotal)} · Expected reserve: {money(selectedExpectedReserve)}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void onSubmit()} loading={isSubmitting} disabled={!activeFactor}>
              Submit
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        {factoringSummaryQuery.isError ? (
          <ListErrorBanner
            message={`Failed to load factoring defaults: ${(factoringSummaryQuery.error as Error)?.message ?? "Request failed"}`}
            onRetry={() => void factoringSummaryQuery.refetch()}
          />
        ) : null}
        {factorsQuery.isError ? (
          <ListErrorBanner
            message={`Failed to load factor rates: ${(factorsQuery.error as Error)?.message ?? "Request failed"}`}
            onRetry={() => void factorsQuery.refetch()}
          />
        ) : null}
        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Factoring company</span>
            {vendorsQuery.isError ? (
              <ListErrorBanner
                message={`Failed to load factoring companies: ${(vendorsQuery.error as Error)?.message ?? "Request failed"}`}
                onRetry={() => void vendorsQuery.refetch()}
              />
            ) : null}
            {/* FIX-06: shared ReferenceSelect gives the factoring-company (vendor) picker the inline
                "+ Add new vendor" row (writes to canonical mdata.vendors — the same table this list
                reads, so a newly created factor is immediately selectable, QB-STD-5). */}
            <ReferenceSelect
              value={vendorId || null}
              onChange={(next) => setVendorId(next ?? "")}
              options={(vendorsQuery.data ?? []).map(vendorReferenceOption)}
              createKind="vendor"
              operatingCompanyId={operatingCompanyId}
              placeholder="Select vendor…"
              onOptionCreated={() => void vendorsQuery.refetch()}
              disabled={!operatingCompanyId}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Submission batch ref</span>
            <input className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" value={submissionRef} onChange={(event) => setSubmissionRef(event.target.value)} />
          </label>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Advance rate %</span>
            <input className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" type="number" min={0} max={100} step="0.01" value={advanceRatePct} onChange={(event) => setAdvanceRatePct(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Reserve %</span>
            <input className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" type="number" min={0} max={100} step="0.01" value={reservePct} onChange={(event) => setReservePct(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Factor fee %</span>
            <input className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" type="number" min={0} max={100} step="0.01" value={factorFeePct} onChange={(event) => setFactorFeePct(event.target.value)} />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-600">Notes</span>
          <textarea className="min-h-[70px] rounded-sm border border-gray-300 p-2 text-[13px]" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>

        <div>
          <div className="mb-1 text-xs font-semibold text-gray-600">Invoices to factor</div>
          {invoicesQuery.isError ? (
            <div className="mb-2">
              <ListErrorBanner
                message={`Failed to load eligible invoices: ${(invoicesQuery.error as Error)?.message ?? "Request failed"}`}
                onRetry={() => void invoicesQuery.refetch()}
              />
            </div>
          ) : null}
          {/* ACCT-F3592: embedded ParityTable owns Search+Range+gear + selectable invoice pick. */}
          <ParityTable
            embedded
            rows={invoicesQuery.data ?? []}
            rowKey={(row) => row.id}
            storageKey="submit-factoring-modal-candidates"
            exportFilename="factoring-candidate-invoices"
            tableTestId="submit-factoring-candidates-table"
            emptyText={
              invoicesQuery.isLoading
                ? "Loading eligible invoices…"
                : invoicesQuery.isError
                  ? "Could not load invoices."
                  : "No sent, eligible invoices available."
            }
            selectable
            selectedKeys={selectedInvoiceIds}
            onSelectionChange={setSelectedInvoiceIds}
            columns={[
              {
                key: "invoice",
                label: "Invoice",
                cellClass: "text-gray-900",
                render: (row) => (
                  <EntityLink kind="invoice" id={row.id} label={entityLabel(row.display_id, row.id, "Invoice")} />
                ),
              },
              {
                key: "customer",
                label: "Customer",
                cellClass: "text-gray-700",
                render: (row) => entityLabel(row.customer_name, row.customer_id, "Customer"),
              },
              {
                key: "total",
                label: "Invoice",
                cellClass: "text-gray-700",
                render: (row) => money(row.total_cents),
              },
              {
                key: "pledge",
                label: "Pledge (net)",
                cellClass: "text-gray-700",
                render: (row) => money(row.pledge_cents ?? row.total_cents),
              },
              {
                key: "recourse",
                label: "Recourse",
                cellClass: "text-gray-700",
                render: (row) => row.customer_recourse_type,
              },
            ]}
          />
        </div>

        {error ? <div className="rounded-sm border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div> : null}
      </div>
    </ParityDrawer>
  );
}
