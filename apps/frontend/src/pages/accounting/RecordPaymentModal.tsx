import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPayment, listInvoices, type Invoice, type PaymentMethod } from "../../api/accounting";
import { listCustomers } from "../../api/mdata";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { Modal } from "../../components/Modal";
import { UploadZone } from "../../components/UploadZone";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onRecorded: (paymentId: string) => void;
  prefillCustomerId?: string;
  prefillAmountCents?: number;
  prefillInvoiceId?: string;
};

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "ach", label: "ACH" },
  { value: "wire", label: "Wire" },
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "factoring_advance", label: "Factoring Advance" },
  { value: "factoring_reserve", label: "Factoring Reserve" },
  { value: "credit_card", label: "Credit Card" },
  { value: "other", label: "Other" },
];

function dollarsToCents(value: string) {
  const normalized = Number(value || "0");
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return Math.round(normalized * 100);
}

function centsToDollarsInput(value: number) {
  return (Math.max(0, Number(value || 0)) / 100).toFixed(2);
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function RecordPaymentModal({
  open,
  operatingCompanyId,
  onClose,
  onRecorded,
  prefillCustomerId,
  prefillAmountCents,
  prefillInvoiceId,
}: Props) {
  const [customerId, setCustomerId] = useState<string | null>(prefillCustomerId ?? null);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("ach");
  const [reference, setReference] = useState("");
  const [amountDollars, setAmountDollars] = useState(centsToDollarsInput(prefillAmountCents ?? 0));
  const [depositedTo, setDepositedTo] = useState("ops_checking");
  const [notes, setNotes] = useState("");
  const [applyByInvoice, setApplyByInvoice] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draftAttachmentEntityId, setDraftAttachmentEntityId] = useState(() => crypto.randomUUID());

  const customersQuery = useQuery({
    queryKey: ["record-payment", "customers", operatingCompanyId],
    queryFn: () => listCustomers({ operating_company_id: operatingCompanyId }).then((res) => res.customers),
    enabled: open,
  });

  const openInvoicesQuery = useQuery({
    queryKey: ["record-payment", "open-invoices", operatingCompanyId, customerId],
    queryFn: async () => {
      if (!customerId) return [] as Invoice[];
      const [sent, partial] = await Promise.all([
        listInvoices(operatingCompanyId, { customer_id: customerId, status: "sent" }).then((res) => res.invoices ?? []),
        listInvoices(operatingCompanyId, { customer_id: customerId, status: "partial" }).then((res) => res.invoices ?? []),
      ]);
      const map = new Map<string, Invoice>();
      for (const row of [...sent, ...partial]) {
        if (Number(row.amount_open_cents ?? 0) <= 0) continue;
        map.set(row.id, row);
      }
      return Array.from(map.values());
    },
    enabled: open && Boolean(customerId),
  });

  const amountCents = dollarsToCents(amountDollars);
  const openInvoices = openInvoicesQuery.data ?? [];

  useEffect(() => {
    if (!open) return;
    setCustomerId(prefillCustomerId ?? null);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("ach");
    setReference("");
    setAmountDollars(centsToDollarsInput(prefillAmountCents ?? 0));
    setDepositedTo("ops_checking");
    setNotes("");
    setErrorMessage(null);
    setApplyByInvoice({});
    setDraftAttachmentEntityId(crypto.randomUUID());
  }, [open, prefillAmountCents, prefillCustomerId]);

  useEffect(() => {
    if (!open || !prefillInvoiceId || !prefillAmountCents) return;
    setApplyByInvoice((current) => ({
      ...current,
      [prefillInvoiceId]: prefillAmountCents,
    }));
  }, [open, prefillInvoiceId, prefillAmountCents]);

  useEffect(() => {
    if (!open || !customerId || openInvoices.length === 0) return;
    if (Object.keys(applyByInvoice).length > 0) return;

    let remaining = amountCents;
    const next: Record<string, number> = {};
    for (const invoice of openInvoices) {
      if (remaining <= 0) break;
      const openAmount = Number(invoice.amount_open_cents ?? 0);
      const apply = Math.min(openAmount, remaining);
      if (apply > 0) {
        next[invoice.id] = apply;
        remaining -= apply;
      }
    }
    if (Object.keys(next).length > 0) setApplyByInvoice(next);
  }, [open, customerId, openInvoices, amountCents, applyByInvoice]);

  const totalApplied = useMemo(() => Object.values(applyByInvoice).reduce((sum, value) => sum + Number(value || 0), 0), [applyByInvoice]);
  const remaining = Math.max(0, amountCents - totalApplied);

  const customerOptions = (customersQuery.data ?? []).map((row) => ({
    value: row.id,
    label: row.name,
    sublabel: row.customer_code ?? undefined,
  }));

  return (
    <Modal open={open} onClose={onClose} title="Record Payment">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setErrorMessage(null);
          if (!customerId) {
            setErrorMessage("Customer is required.");
            return;
          }
          if (amountCents <= 0) {
            setErrorMessage("Amount must be greater than zero.");
            return;
          }
          if (totalApplied > amountCents) {
            setErrorMessage("Sum of apply amounts cannot exceed payment amount.");
            return;
          }

          const apply_to = Object.entries(applyByInvoice)
            .map(([invoice_id, cents]) => ({ invoice_id, amount_cents: Number(cents) }))
            .filter((row) => row.amount_cents > 0);

          try {
            const result = await createPayment(operatingCompanyId, {
              customer_id: customerId,
              payment_method: paymentMethod,
              payment_date: paymentDate,
              reference: reference || undefined,
              amount_cents: amountCents,
              deposited_to_account_id: depositedTo || "ops_checking",
              notes: notes || undefined,
              apply_to,
            });
            onRecorded(result.id);
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to record payment.");
          }
        }}
      >
        {errorMessage ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div> : null}

        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Customer</label>
            <Combobox
              options={customerOptions}
              value={customerId}
              onChange={setCustomerId}
              placeholder="Select customer"
              loading={customersQuery.isLoading}
            />
          </div>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Payment date
            <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Payment method
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="h-9 rounded border border-gray-300 px-2 text-[13px]">
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Reference
            <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Check # / ACH ref" className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Amount (USD)
            <input value={amountDollars} onChange={(event) => setAmountDollars(event.target.value)} inputMode="decimal" className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Deposited to
            <input value={depositedTo} onChange={(event) => setDepositedTo(event.target.value)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-2">
            Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="rounded border border-gray-300 px-2 py-1.5 text-[13px]" />
          </label>
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Apply to invoices</h3>
            <span className="text-xs text-gray-600">
              Applied {money(totalApplied)} / Remaining {money(remaining)}
            </span>
          </div>

          {!customerId ? <div className="text-xs text-gray-600">Select a customer to view open invoices.</div> : null}
          {customerId && openInvoicesQuery.isLoading ? <div className="text-xs text-gray-600">Loading open invoices...</div> : null}
          {customerId && !openInvoicesQuery.isLoading && openInvoices.length === 0 ? (
            <div className="text-xs text-gray-600">No open invoices for this customer.</div>
          ) : null}

          <div className="space-y-2">
            {openInvoices.map((invoice) => {
              const checked = applyByInvoice[invoice.id] !== undefined;
              const invoiceOpen = Number(invoice.amount_open_cents ?? 0);
              return (
                <div key={invoice.id} className="rounded border border-gray-200 bg-white p-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm text-gray-800">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (!event.target.checked) {
                            setApplyByInvoice((current) => {
                              const copy = { ...current };
                              delete copy[invoice.id];
                              return copy;
                            });
                            return;
                          }
                          const defaultApply = Math.min(invoiceOpen, Math.max(0, amountCents - totalApplied));
                          setApplyByInvoice((current) => ({ ...current, [invoice.id]: Math.max(0, defaultApply) }));
                        }}
                      />
                      {invoice.display_id} · Open {money(invoiceOpen)}
                    </label>
                    {checked ? (
                      <input
                        value={centsToDollarsInput(applyByInvoice[invoice.id] ?? 0)}
                        onChange={(event) => {
                          const cents = dollarsToCents(event.target.value);
                          setApplyByInvoice((current) => ({ ...current, [invoice.id]: Math.min(invoiceOpen, cents) }));
                        }}
                        inputMode="decimal"
                        className="h-8 w-36 rounded border border-gray-300 px-2 text-right text-[13px]"
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <UploadZone
          operatingCompanyId={operatingCompanyId}
          entityType="payment"
          entityId={draftAttachmentEntityId}
          defaultCategory={paymentMethod === "check" ? "check_image" : paymentMethod === "wire" ? "wire_confirmation" : "ach_confirmation"}
          title="Payment Proof / Backup"
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Record Payment</Button>
        </div>
      </form>
    </Modal>
  );
}
