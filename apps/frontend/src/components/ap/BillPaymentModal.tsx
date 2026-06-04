import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listVendorBills, type VendorBill } from "../../api/accounting";
import { recordApBillPayment } from "../../api/ap";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { SelectCombobox } from "../shared/SelectCombobox";
import { useToast } from "../Toast";

export type BillPaymentRow = {
  bill_id: string;
  bill_number: string;
  original_balance_cents: number;
  payment_amount_cents: number;
};

type Props = {
  open: boolean;
  operatingCompanyId: string;
  vendorId: string;
  vendorName: string;
  onClose: () => void;
  onSaved: () => void;
};

const METHOD_OPTIONS = [
  { value: "ach", label: "ACH" },
  { value: "check", label: "Check" },
  { value: "wire", label: "Wire" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit Card" },
] as const;

function billOpenBalanceCents(b: VendorBill) {
  if (b.balance_cents != null) return Math.max(0, Number(b.balance_cents));
  return Math.max(0, Number(b.amount_cents ?? 0) - Number(b.paid_cents ?? 0));
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function centsFromInput(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

export function BillPaymentModal({ open, operatingCompanyId, vendorId, vendorName, onClose, onSaved }: Props) {
  const { pushToast } = useToast();
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<(typeof METHOD_OPTIONS)[number]["value"]>("ach");
  const [totalAmount, setTotalAmount] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [memo, setMemo] = useState("");
  const [autoApply, setAutoApply] = useState(true);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const billsQuery = useQuery({
    queryKey: ["ap-bill-payment-modal", operatingCompanyId, vendorId],
    queryFn: () => listVendorBills(operatingCompanyId, { vendor_id: vendorId, has_balance: true, limit: 200 }).then((res) => res.rows ?? []),
    enabled: open && Boolean(operatingCompanyId && vendorId),
  });

  const openBills = useMemo(
    () =>
      (billsQuery.data ?? [])
        .filter((b) => b.status !== "voided" && b.status !== "paid" && billOpenBalanceCents(b) > 0)
        .sort((a, b) => a.bill_date.localeCompare(b.bill_date)),
    [billsQuery.data]
  );

  const totalCents = centsFromInput(totalAmount);

  const rows: BillPaymentRow[] = useMemo(() => {
    if (autoApply) {
      let remaining = totalCents;
      return openBills.flatMap((bill) => {
        if (remaining <= 0) return [];
        const open = billOpenBalanceCents(bill);
        const apply = Math.min(open, remaining);
        if (apply <= 0) return [];
        remaining -= apply;
        return [
          {
            bill_id: bill.id,
            bill_number: bill.bill_number ?? bill.id.slice(0, 8),
            original_balance_cents: open,
            payment_amount_cents: apply,
          },
        ];
      });
    }
    return openBills.flatMap((bill) => {
      if (!included[bill.id]) return [];
      const apply = centsFromInput(amounts[bill.id] ?? "0");
      if (apply <= 0) return [];
      return [
        {
          bill_id: bill.id,
          bill_number: bill.bill_number ?? bill.id.slice(0, 8),
          original_balance_cents: billOpenBalanceCents(bill),
          payment_amount_cents: apply,
        },
      ];
    });
  }, [autoApply, totalCents, openBills, included, amounts]);

  const appliedSum = rows.reduce((sum, row) => sum + row.payment_amount_cents, 0);
  const manualInvalid = !autoApply && appliedSum > totalCents;

  useEffect(() => {
    if (!open) return;
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("ach");
    setTotalAmount("");
    setCheckNumber("");
    setReferenceNumber("");
    setMemo("");
    setAutoApply(true);
    setIncluded({});
    setAmounts({});
    setError(null);
  }, [open, vendorId]);

  return (
    <Modal open={open} onClose={onClose} title="Bill payment — multiple bills">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          if (totalCents <= 0) {
            setError("Total payment amount must be greater than zero.");
            return;
          }
          if (rows.length === 0) {
            setError("Select at least one bill with a payment amount.");
            return;
          }
          if (manualInvalid || appliedSum > totalCents) {
            setError("Applied amounts cannot exceed the total payment.");
            return;
          }
          if (paymentMethod === "check" && !checkNumber.trim() && !referenceNumber.trim()) {
            setError("Check number is required for check payments.");
            return;
          }
          for (const row of rows) {
            if (row.payment_amount_cents > row.original_balance_cents) {
              setError(`Payment for ${row.bill_number} exceeds open balance.`);
              return;
            }
          }
          setSaving(true);
          try {
            await recordApBillPayment(operatingCompanyId, {
              vendor_id: vendorId,
              paid_at: paymentDate,
              amount_cents: totalCents,
              payment_method: paymentMethod,
              check_number: paymentMethod === "check" ? checkNumber.trim() || undefined : undefined,
              reference_number: referenceNumber.trim() || undefined,
              memo: memo.trim() || undefined,
              applications: rows.map((row) => ({ bill_id: row.bill_id, amount_cents: row.payment_amount_cents })),
            });
            pushToast(`Bill payment of ${money(totalCents)} recorded`, "success");
            onSaved();
            onClose();
          } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Failed to record payment.");
          } finally {
            setSaving(false);
          }
        }}
      >
        {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Vendor
            <input readOnly value={vendorName} className="h-9 rounded border border-gray-300 bg-gray-100 px-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Payment date
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Method
            <SelectCombobox value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className="h-9 rounded border border-gray-300 px-2 text-[13px]">
              {METHOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Total payment (USD)
            <input value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} inputMode="decimal" className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>
          {paymentMethod === "check" ? (
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Check #
              <input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-3">
            Reference
            <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} />
          Auto-apply oldest bills first (FIFO)
        </label>

        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                {!autoApply ? <th className="px-2 py-1.5 font-semibold">Pay</th> : null}
                <th className="px-2 py-1.5 font-semibold">Bill #</th>
                <th className="px-2 py-1.5 font-semibold">Open balance</th>
                <th className="px-2 py-1.5 font-semibold">Apply</th>
                <th className="px-2 py-1.5 font-semibold">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {openBills.length === 0 ? (
                <tr>
                  <td colSpan={autoApply ? 4 : 5} className="px-2 py-3 text-gray-500">
                    {billsQuery.isLoading ? "Loading open bills…" : "No open bills for this vendor."}
                  </td>
                </tr>
              ) : null}
              {openBills.map((bill) => {
                const open = billOpenBalanceCents(bill);
                const row = rows.find((r) => r.bill_id === bill.id);
                const applyCents = row?.payment_amount_cents ?? 0;
                const remaining = Math.max(0, open - applyCents);
                return (
                  <tr key={bill.id} className="border-t border-gray-100">
                    {!autoApply ? (
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={Boolean(included[bill.id])}
                          onChange={(e) => setIncluded((prev) => ({ ...prev, [bill.id]: e.target.checked }))}
                        />
                      </td>
                    ) : null}
                    <td className="px-2 py-1.5">{bill.bill_number ?? bill.id.slice(0, 8)}</td>
                    <td className="px-2 py-1.5">{money(open)}</td>
                    <td className="px-2 py-1.5">
                      {autoApply ? (
                        money(applyCents)
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          className="w-24 rounded border border-gray-300 px-1 py-0.5"
                          value={amounts[bill.id] ?? ""}
                          disabled={!included[bill.id]}
                          onChange={(e) => setAmounts((prev) => ({ ...prev, [bill.id]: e.target.value }))}
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5">{money(remaining)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-gray-600">
          Applied {money(appliedSum)} of {money(totalCents)}
          {totalCents > appliedSum ? ` · ${money(totalCents - appliedSum)} unapplied credit` : null}
        </div>

        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Memo
          <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-[13px]" />
        </label>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || manualInvalid}>
            {saving ? "Saving…" : "Record payment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
