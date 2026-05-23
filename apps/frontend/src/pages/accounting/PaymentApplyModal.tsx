import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import type { Invoice } from "../../api/accounting";

type Props = {
  open: boolean;
  loading?: boolean;
  unappliedCents: number;
  invoices: Invoice[];
  onClose: () => void;
  onSubmit: (payload: { invoice_id: string; amount_cents: number }) => void;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function PaymentApplyModal({ open, loading = false, unappliedCents, invoices, onClose, onSubmit }: Props) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [applyAmountDollars, setApplyAmountDollars] = useState("");
  const [search, setSearch] = useState("");

  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return invoices;
    const q = search.toLowerCase();
    return invoices.filter((row) => row.display_id.toLowerCase().includes(q) || (row.customer_name ?? "").toLowerCase().includes(q));
  }, [invoices, search]);

  const selectedInvoice = filteredInvoices.find((row) => row.id === selectedInvoiceId) ?? null;

  return (
    <Modal open={open} onClose={onClose} title="Apply Payment">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const cents = Math.round(Number(applyAmountDollars || "0") * 100);
          if (!selectedInvoiceId || !Number.isFinite(cents) || cents <= 0) return;
          onSubmit({ invoice_id: selectedInvoiceId, amount_cents: cents });
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Search
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice #" className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Invoice
          <SelectCombobox
            value={selectedInvoiceId}
            onChange={(event) => {
              const nextId = event.target.value;
              setSelectedInvoiceId(nextId);
              const invoice = filteredInvoices.find((row) => row.id === nextId);
              if (!invoice) return;
              const defaultApply = Math.min(Number(unappliedCents ?? 0), Number(invoice.amount_open_cents ?? 0));
              setApplyAmountDollars((defaultApply / 100).toFixed(2));
            }}
            className="h-9 rounded border border-gray-300 px-2 text-[13px]"
          >
            <option value="">Select invoice</option>
            {filteredInvoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.display_id} · Open {money(invoice.amount_open_cents)}
              </option>
            ))}
          </SelectCombobox>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Apply amount (USD)
          <input value={applyAmountDollars} onChange={(event) => setApplyAmountDollars(event.target.value)} inputMode="decimal" className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
        </label>

        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Unapplied available: {money(unappliedCents)}
          {selectedInvoice ? ` · Invoice open: ${money(selectedInvoice.amount_open_cents)}` : ""}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Apply
          </Button>
        </div>
      </form>
    </Modal>
  );
}
