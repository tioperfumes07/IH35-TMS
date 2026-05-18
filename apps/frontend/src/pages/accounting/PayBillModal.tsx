import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { payVendorBill, type BillPaymentMethod, type VendorBill } from "../../api/accounting";
import { getAllAccounts } from "../../api/banking";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  vendorName: string;
  bill: VendorBill | null;
  onClose: () => void;
  onSaved: () => void;
};

const METHOD_OPTIONS: Array<{ value: BillPaymentMethod; label: string }> = [
  { value: "check", label: "Check" },
  { value: "ach", label: "ACH" },
  { value: "wire", label: "Wire" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit Card" },
];

function toDollars(cents: number) {
  return (Math.max(0, Number(cents) || 0) / 100).toFixed(2);
}

function toCents(value: string) {
  const amount = Number(value || "0");
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function PayBillModal({ open, operatingCompanyId, vendorName, bill, onClose, onSaved }: Props) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<BillPaymentMethod>("check");
  const [amountDollars, setAmountDollars] = useState("0.00");
  const [fromBankAccountId, setFromBankAccountId] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["pay-bill", "accounts", operatingCompanyId],
    queryFn: () => getAllAccounts(operatingCompanyId),
    enabled: open,
  });

  const remainingCents = useMemo(() => {
    if (!bill) return 0;
    return Math.max(0, Number(bill.amount_cents ?? 0) - Number(bill.paid_cents ?? 0));
  }, [bill]);

  useEffect(() => {
    if (!open || !bill) return;
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("check");
    setAmountDollars(toDollars(remainingCents));
    setFromBankAccountId(String(accountsQuery.data?.accounts?.[0]?.id ?? ""));
    setCheckNumber("");
    setReferenceNumber("");
    setMemo("");
    setError(null);
  }, [open, bill, remainingCents, accountsQuery.data?.accounts]);

  const amountCents = toCents(amountDollars);
  const needsBankAccount = paymentMethod === "check" || paymentMethod === "ach" || paymentMethod === "wire" || paymentMethod === "credit_card";

  return (
    <Modal open={open} onClose={onClose} title="Pay Bill">
      {!bill ? (
        <div className="text-sm text-gray-600">No bill selected.</div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            if (amountCents <= 0) {
              setError("Payment amount must be greater than zero.");
              return;
            }
            if (amountCents > remainingCents) {
              setError("Payment amount cannot exceed remaining bill balance.");
              return;
            }
            if (paymentMethod === "check" && !checkNumber.trim()) {
              setError("Check number is required when payment method is check.");
              return;
            }
            if (needsBankAccount && !fromBankAccountId) {
              setError("From bank account is required for this payment method.");
              return;
            }
            setSaving(true);
            try {
              await payVendorBill(bill.id, operatingCompanyId, {
                payment_date: paymentDate,
                amount_cents: amountCents,
                payment_method: paymentMethod,
                from_bank_account_id: needsBankAccount ? fromBankAccountId : undefined,
                check_number: paymentMethod === "check" ? checkNumber : undefined,
                reference_number: referenceNumber || undefined,
                memo: memo || undefined,
              });
              onSaved();
            } catch (submitError) {
              setError(submitError instanceof Error ? submitError.message : "Failed to submit payment.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}

          <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
            Bill Payment Details
          </div>

          <div className="grid grid-cols-1 gap-2 rounded border border-gray-200 bg-white p-2 md:grid-cols-6">
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Vendor
              <input value={vendorName} readOnly className="h-9 rounded border border-gray-300 bg-gray-100 px-2 text-[13px]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Bill #
              <input value={bill.bill_number || bill.id.slice(0, 8)} readOnly className="h-9 rounded border border-gray-300 bg-gray-100 px-2 text-[13px]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Payment date
              <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Payment method
              <SelectCombobox value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as BillPaymentMethod)} className="h-9 rounded border border-gray-300 px-2 text-[13px]">
                {METHOD_OPTIONS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </SelectCombobox>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Payment amount (USD)
              <input value={amountDollars} onChange={(event) => setAmountDollars(event.target.value)} inputMode="decimal" className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Remaining
              <input value={money(remainingCents)} readOnly className="h-9 rounded border border-gray-300 bg-gray-100 px-2 text-[13px]" />
            </label>
            {needsBankAccount ? (
              <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
                From bank account
                <SelectCombobox value={fromBankAccountId} onChange={(event) => setFromBankAccountId(event.target.value)} className="h-9 rounded border border-gray-300 px-2 text-[13px]">
                  <option value="">Select account</option>
                  {(accountsQuery.data?.accounts ?? []).map((account: Record<string, unknown>) => (
                    <option key={String(account.id ?? "")} value={String(account.id ?? "")}>
                      {String(account.display_name ?? "Account")}
                    </option>
                  ))}
                </SelectCombobox>
              </label>
            ) : null}
            {paymentMethod === "check" ? (
              <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
                Check number
                <input value={checkNumber} onChange={(event) => setCheckNumber(event.target.value)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Reference number
              <input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-6">
              Memo
              <textarea rows={3} value={memo} onChange={(event) => setMemo(event.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-[13px]" />
            </label>
          </div>

          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Apply to bill</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Bill #</th>
                    <th className="px-2 py-1.5 font-semibold">Total</th>
                    <th className="px-2 py-1.5 font-semibold">Paid</th>
                    <th className="px-2 py-1.5 font-semibold">Open</th>
                    <th className="px-2 py-1.5 font-semibold">Apply</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-100">
                    <td className="px-2 py-1.5">{bill.bill_number || bill.id.slice(0, 8)}</td>
                    <td className="px-2 py-1.5">{money(bill.amount_cents)}</td>
                    <td className="px-2 py-1.5">{money(bill.paid_cents)}</td>
                    <td className="px-2 py-1.5 font-semibold text-red-700">{money(remainingCents)}</td>
                    <td className="px-2 py-1.5">
                      <input
                        value={amountDollars}
                        onChange={(event) => setAmountDollars(event.target.value)}
                        inputMode="decimal"
                        className="h-8 w-24 rounded border border-gray-300 px-2 text-[13px]"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Paying..." : "Record Payment"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
