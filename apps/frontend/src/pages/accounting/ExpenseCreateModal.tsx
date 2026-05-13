import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { createVendorBill } from "../../api/accounting";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { QboCombobox } from "../../components/forms/QboCombobox";
import { useToast } from "../../components/Toast";

function dollarsToCents(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export type ExpenseCreateFormProps = {
  operatingCompanyId: string;
  /** Called after a successful save (before any parent onClose). */
  onRecorded?: () => void;
  submitLabel?: string;
};

/** Shared vendor-bill expense form (used by full page and modal). */
export function ExpenseCreateForm({ operatingCompanyId, onRecorded, submitLabel = "Save expense" }: ExpenseCreateFormProps) {
  const { pushToast } = useToast();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorDisplay, setVendorDisplay] = useState("");
  const [accountHint, setAccountHint] = useState<{ qboId: string | null; name: string }>({ qboId: null, name: "" });
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const memo = useMemo(() => {
    const parts = ["Expense capture (Phase 1 placeholder until dedicated expense API ships)"];
    if (accountHint.qboId) parts.push(`QBO account ${accountHint.qboId}: ${accountHint.name}`);
    return parts.join(" · ");
  }, [accountHint]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!operatingCompanyId) return pushToast("Select operating company first", "error");
    const vendorKey = (vendorId ?? vendorDisplay).trim();
    if (!vendorKey) return pushToast("Vendor is required", "error");
    const cents = dollarsToCents(amount);
    if (cents <= 0) return pushToast("Amount must be greater than zero", "error");

    setSubmitting(true);
    try {
      await createVendorBill(operatingCompanyId, {
        vendor_id: vendorKey,
        bill_date: billDate,
        amount_cents: cents,
        memo,
      });
      pushToast("Expense recorded as vendor bill", "success");
      setAmount("");
      setVendorId(null);
      setVendorDisplay("");
      setAccountHint({ qboId: null, name: "" });
      onRecorded?.();
    } catch (error) {
      pushToast(String((error as Error).message || "Failed to record expense"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-3 text-sm" onSubmit={onSubmit}>
      <label className="block text-xs font-semibold text-gray-700">
        Vendor
        <div className="mt-1">
          <QboCombobox
            entityType="vendor"
            operatingCompanyId={operatingCompanyId}
            value={vendorId}
            displayValue={vendorDisplay}
            onChange={(qboId, displayName) => {
              setVendorId(qboId);
              setVendorDisplay(displayName);
            }}
          />
        </div>
      </label>

      <label className="block text-xs font-semibold text-gray-700">
        Account (reference → memo)
        <div className="mt-1">
          <QboCombobox
            entityType="account"
            operatingCompanyId={operatingCompanyId}
            value={accountHint.qboId}
            displayValue={accountHint.name}
            onChange={(qboId, displayName) => setAccountHint({ qboId, name: displayName })}
          />
        </div>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-gray-700">
          Expense date
          <input className="mt-1 h-9 w-full rounded border border-gray-300 px-2" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
        </label>
        <label className="block text-xs font-semibold text-gray-700">
          Amount (USD)
          <input
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={submitting || !operatingCompanyId}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

type ModalProps = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated?: () => void;
};

export function ExpenseCreateModal({ open, operatingCompanyId, onClose, onCreated }: ModalProps) {
  const [formEpoch, setFormEpoch] = useState(0);

  useEffect(() => {
    if (open) setFormEpoch((e) => e + 1);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Create expense">
      <p className="mb-3 text-xs text-gray-600">Quick capture as vendor bill (same flow as the accounting expenses page).</p>
      {operatingCompanyId ? (
        <ExpenseCreateForm
          key={formEpoch}
          operatingCompanyId={operatingCompanyId}
          onRecorded={() => {
            onCreated?.();
            onClose();
          }}
        />
      ) : null}
    </Modal>
  );
}
