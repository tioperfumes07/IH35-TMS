import { useEffect, useMemo, useState } from "react";
import { entityLabel } from "../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { payVendorBill, type BillPaymentMethod, type VendorBill } from "../../api/accounting";
import { getAllAccounts } from "../../api/banking";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Combobox";
import { PlaidLink } from "../../components/banking/PlaidLink";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { companyToday } from "../../lib/businessDate";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";

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

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function PayBillModal({ open, operatingCompanyId, vendorName, bill, onClose, onSaved }: Props) {
  const [paymentDate, setPaymentDate] = useState(companyToday());
  const [paymentMethod, setPaymentMethod] = useState<BillPaymentMethod>("check");
  const [amountCents, setAmountCents] = useState<number | null>(0);
  const [fromBankAccountId, setFromBankAccountId] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bankCreateOpen, setBankCreateOpen] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["pay-bill", "accounts", operatingCompanyId],
    queryFn: () => getAllAccounts(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });

  const bankOptions = useMemo(
    () =>
      (accountsQuery.data?.accounts ?? []).map((account: Record<string, unknown>) => ({
        value: String(account.id ?? ""),
        label: String(account.display_name ?? account.account_name ?? "Account"),
      })),
    [accountsQuery.data?.accounts]
  );

  const remainingCents = useMemo(() => {
    if (!bill) return 0;
    return Math.max(0, Number(bill.amount_cents ?? 0) - Number(bill.paid_cents ?? 0));
  }, [bill]);

  // Seed form only when the drawer opens on a bill — never when the accounts
  // query refetches after Plaid (that wipe turned ACH/$500 into Check/full).
  useEffect(() => {
    if (!open || !bill) return;
    setPaymentDate(companyToday());
    setPaymentMethod("check");
    setAmountCents(remainingCents);
    setFromBankAccountId("");
    setCheckNumber("");
    setReferenceNumber("");
    setMemo("");
    setError(null);
    setBankCreateOpen(false);
  }, [open, bill, remainingCents]);

  // Default "From bank" once accounts arrive, but never overwrite an explicit
  // selection (including a freshly Plaid-created account).
  useEffect(() => {
    if (!open || !bill) return;
    if (fromBankAccountId) return;
    const firstId = accountsQuery.data?.accounts?.[0]?.id;
    if (firstId) setFromBankAccountId(String(firstId));
  }, [open, bill, fromBankAccountId, accountsQuery.data?.accounts]);

  const payAmountCents = amountCents ?? 0;
  const needsBankAccount =
    paymentMethod === "check" ||
    paymentMethod === "ach" ||
    paymentMethod === "wire" ||
    paymentMethod === "credit_card";

  return (
    <>
      <ParityDrawer
        open={open}
        onClose={onClose}
        title="Pay Bill"
        size="wide"
        footer={
          bill ? (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" form="pay-bill-form" disabled={saving}>
                {saving ? "Paying..." : "Record Payment"}
              </Button>
            </div>
          ) : undefined
        }
      >
        {!bill ? (
          <div className="text-sm text-gray-600">No bill selected.</div>
        ) : (
          <form
            id="pay-bill-form"
            className="space-y-3"
            data-testid="pay-bill-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              if (payAmountCents <= 0) {
                setError("Payment amount must be greater than zero.");
                return;
              }
              if (payAmountCents > remainingCents) {
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
                  amount_cents: payAmountCents,
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
            {error ? (
              <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            ) : null}
            {accountsQuery.isError ? (
              <ListErrorBanner
                message={`Failed to load payment accounts: ${(accountsQuery.error as Error)?.message ?? "Request failed"}`}
                onRetry={() => void accountsQuery.refetch()}
              />
            ) : null}

            {/* CHROME: flat sections — no nested bordered panel inside the drawer (box-in-box) */}
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Bill Payment Details</div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
              <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
                Vendor
                <input
                  value={vendorName}
                  readOnly
                  className="h-9 rounded-sm border border-gray-300 bg-gray-100 px-2 text-[13px]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
                Bill #
                <input
                  value={entityLabel(bill.bill_number, bill.id, "Bill")}
                  readOnly
                  className="h-9 rounded-sm border border-gray-300 bg-gray-100 px-2 text-[13px]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
                Payment date
                <DatePicker value={paymentDate} onChange={setPaymentDate} className="text-[13px]" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
                Payment method
                <select
                  aria-label="Payment method"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as BillPaymentMethod)}
                  className="h-9 rounded-sm border border-gray-300 bg-white px-2 text-[13px]"
                >
                  {METHOD_OPTIONS.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
                Payment amount (USD)
                <MoneyInput valueCents={amountCents} onChangeCents={setAmountCents} ariaLabel="Payment amount" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
                Remaining
                <input
                  value={money(remainingCents)}
                  readOnly
                  className="h-9 rounded-sm border border-gray-300 bg-gray-100 px-2 text-[13px]"
                />
              </label>
              {needsBankAccount ? (
                <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-2">
                  From bank account
                  {/* Picker law: catalog + inline + Add new inside Combobox (first row), not outside. */}
                  <Combobox
                    dataField="from-bank-account"
                    placeholder="Select bank account…"
                    options={bankOptions}
                    value={fromBankAccountId || null}
                    onChange={(next) => setFromBankAccountId(next ?? "")}
                    allowAddNew={{
                      label: "+ Add new bank account",
                      onAdd: () => setBankCreateOpen(true),
                    }}
                  />
                </label>
              ) : null}
              {paymentMethod === "check" ? (
                <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
                  Check number
                  <input
                    value={checkNumber}
                    onChange={(event) => setCheckNumber(event.target.value)}
                    className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]"
                  />
                </label>
              ) : null}
              <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
                Reference number
                <input
                  value={referenceNumber}
                  onChange={(event) => setReferenceNumber(event.target.value)}
                  className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-6">
                Memo
                <textarea
                  rows={3}
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
                />
              </label>
            </div>

            <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Apply to bill</div>
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
                    <td className="px-2 py-1.5">{entityLabel(bill.bill_number, bill.id, "Bill")}</td>
                    <td className="px-2 py-1.5">{money(bill.amount_cents)}</td>
                    <td className="px-2 py-1.5">{money(bill.paid_cents)}</td>
                    <td className="px-2 py-1.5 font-semibold text-red-700">{money(remainingCents)}</td>
                    <td className="px-2 py-1.5">
                      <MoneyInput
                        valueCents={amountCents}
                        onChangeCents={setAmountCents}
                        ariaLabel="Payment amount"
                        className="w-24"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </form>
        )}
      </ParityDrawer>

      {/* Nested drawer: bank accounts are provisioned via Plaid (canonical Banking path) — same QBO connect chrome. */}
      <ParityDrawer
        open={bankCreateOpen}
        onClose={() => setBankCreateOpen(false)}
        title="Add bank account"
        size="regular"
      >
        <div className="space-y-3 text-sm text-gray-700" data-testid="pay-bill-add-bank-drawer">
          <p>
            Connect a bank account for this company. After Plaid succeeds, the new account appears in{" "}
            <strong>From bank account</strong> and can be selected for this payment.
          </p>
          <PlaidLink
            operatingCompanyId={operatingCompanyId}
            label="Connect via Plaid"
            onSuccess={async (accounts) => {
              // Use the Plaid-returned row — NOT accountsQuery[0]. /banking/accounts/all
              // orders by display_order, display_name; a new Plaid row sets neither and
              // sorts last, so [0] would keep paying Chase while the operator connected BOA.
              const nextId = String(accounts[0]?.id ?? "");
              if (nextId) setFromBankAccountId(nextId);
              await accountsQuery.refetch();
              setBankCreateOpen(false);
            }}
          />
        </div>
      </ParityDrawer>
    </>
  );
}
