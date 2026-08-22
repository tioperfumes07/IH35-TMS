import { entityLabel } from "../../lib/entity-label";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listVendorBills, type VendorBill } from "../../api/accounting";
import { recordApBillPayment } from "../../api/ap";
import { getAllAccounts } from "../../api/banking";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { PlaidLink } from "../banking/PlaidLink";
import { ParityDrawer } from "../parity/ParityDrawer";
import { ParityTable } from "../parity/ParityTable";
import { SelectCombobox } from "../shared/SelectCombobox";
import { TaskLinkPicker } from "../tasks/TaskLinkPicker";
import { EntityLink } from "../shared/EntityLink";
import { useToast } from "../Toast";
import { MoneyInput } from "../forms/MoneyInput";
import { DatePicker } from "../forms/DatePicker";
import { companyToday } from "../../lib/businessDate";

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

// M-1: amount stays a DOLLAR number → *_cents = round(amount*100) unchanged (byte-for-byte).
function centsFromInput(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

export function BillPaymentModal({ open, operatingCompanyId, vendorId, vendorName, onClose, onSaved }: Props) {
  const { pushToast } = useToast();
  const [paymentDate, setPaymentDate] = useState(() => companyToday());
  const [paymentMethod, setPaymentMethod] = useState<(typeof METHOD_OPTIONS)[number]["value"]>("ach");
  const [totalAmount, setTotalAmount] = useState<number | null>(null);
  const [checkNumber, setCheckNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [memo, setMemo] = useState("");
  const [autoApply, setAutoApply] = useState(true);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // TASKS-PLANNER-V2-CONNECTIVITY: after a payment posts, offer to close an open task it fulfils.
  const [completedPaymentId, setCompletedPaymentId] = useState<string | null>(null);
  // ACCT-F5981: picker law — every non-cash payment needs a real "from bank account" so
  // accounting.bill_payments.from_bank_account_id (and the bank balance) aren't silently left null.
  // Mirrors PayBillModal.tsx's already-live Combobox + Plaid "+ Add new bank account" pattern exactly.
  const [fromBankAccountId, setFromBankAccountId] = useState("");
  const [bankCreateOpen, setBankCreateOpen] = useState(false);

  const billsQuery = useQuery({
    queryKey: ["ap-bill-payment-modal", operatingCompanyId, vendorId],
    queryFn: () => listVendorBills(operatingCompanyId, { vendor_id: vendorId, has_balance: true, limit: 200 }).then((res) => res.rows ?? []),
    enabled: open && Boolean(operatingCompanyId && vendorId),
  });

  const accountsQuery = useQuery({
    queryKey: ["bill-payment-modal", "accounts", operatingCompanyId],
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

  const needsBankAccount = paymentMethod !== "cash";

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
            bill_number: entityLabel(bill.bill_number, bill.id, "Record"),
            original_balance_cents: open,
            payment_amount_cents: apply,
          },
        ];
      });
    }
    return openBills.flatMap((bill) => {
      if (!included[bill.id]) return [];
      const apply = centsFromInput(amounts[bill.id] ?? null);
      if (apply <= 0) return [];
      return [
        {
          bill_id: bill.id,
          bill_number: entityLabel(bill.bill_number, bill.id, "Record"),
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
    setPaymentDate(companyToday());
    setPaymentMethod("ach");
    setTotalAmount(null);
    setCheckNumber("");
    setReferenceNumber("");
    setMemo("");
    setAutoApply(true);
    setIncluded({});
    setAmounts({});
    setError(null);
    setFromBankAccountId("");
    setBankCreateOpen(false);
  }, [open, vendorId]);

  // Default "From bank" once accounts arrive, but never overwrite an explicit selection (including a
  // freshly Plaid-created account) — same rule as PayBillModal.tsx's identical effect.
  useEffect(() => {
    if (!open) return;
    if (fromBankAccountId) return;
    const firstId = accountsQuery.data?.accounts?.[0]?.id;
    if (firstId) setFromBankAccountId(String(firstId));
  }, [open, fromBankAccountId, accountsQuery.data?.accounts]);

  return (
    <>
    <ParityDrawer
      open={open}
      onClose={onClose}
      title="Bill payment — multiple bills"
      size="wide"
      footer={
        completedPaymentId ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Payment recorded. Close an open task it fulfils:</span>
            <div className="flex items-center gap-2">
              {/* LINK-F5186 (accounting.modal.bill_payment): the recorded payment's own detail page
              carries the real GL journal entry -- surface it here so this modal doesn't leave the
              operator with no path to it. */}
              <EntityLink
                kind="bill_payment"
                id={completedPaymentId}
                label="View payment →"
                className="text-xs font-semibold text-slate-700 underline"
                data-testid="bill-payment-modal-view-payment"
              />
              <TaskLinkPicker
                operatingCompanyId={operatingCompanyId}
                targetType="bill_payment"
                targetId={completedPaymentId}
                onLinked={() => { setCompletedPaymentId(null); onClose(); }}
              />
              <Button type="button" variant="secondary" onClick={() => { setCompletedPaymentId(null); onClose(); }}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="bill-payment-modal-form" disabled={saving || manualInvalid}>
              {saving ? "Saving…" : "Record payment"}
            </Button>
          </div>
        )
      }
    >
      <form
        id="bill-payment-modal-form"
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
          if (needsBankAccount && !fromBankAccountId) {
            setError("From bank account is required for this payment method.");
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
            const res = await recordApBillPayment(operatingCompanyId, {
              vendor_id: vendorId,
              paid_at: paymentDate,
              amount_cents: totalCents,
              payment_method: paymentMethod,
              bank_account_id: needsBankAccount ? fromBankAccountId : undefined,
              check_number: paymentMethod === "check" ? checkNumber.trim() || undefined : undefined,
              reference_number: referenceNumber.trim() || undefined,
              memo: memo.trim() || undefined,
              applications: rows.map((row) => ({ bill_id: row.bill_id, amount_cents: row.payment_amount_cents })),
            });
            pushToast(`Bill payment of ${money(totalCents)} recorded`, "success");
            onSaved();
            // If we have a payment id, keep the modal open on a completion step so the payment can
            // close an open task; otherwise preserve the original auto-close behavior.
            const paymentId = res?.bill_payment_ids?.[0] ?? res?.payment_batch_id ?? null;
            if (paymentId) setCompletedPaymentId(paymentId);
            else onClose();
          } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Failed to record payment.");
          } finally {
            setSaving(false);
          }
        }}
      >
        {error ? <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Vendor
            <input readOnly value={vendorName} className="h-9 rounded-sm border border-gray-300 bg-gray-100 px-2 text-[13px]" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Payment date
            <DatePicker value={paymentDate} onChange={setPaymentDate} className="h-9" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Method
            <SelectCombobox value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]">
              {METHOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Total payment (USD)
            {/* M-1: dollars-mode QBO money entry; amount stays a DOLLAR number → *_cents byte-for-byte. */}
            <MoneyInput valueDollars={totalAmount} onChangeDollars={setTotalAmount} ariaLabel="Total payment amount (USD)" />
          </label>
          {needsBankAccount ? (
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-2">
              From bank account
              {/* Picker law: catalog + inline + Add new inside Combobox (first row), not outside —
                  same pattern as PayBillModal.tsx's identical field. */}
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
              Check #
              <input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-3">
            Reference
            <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" />
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} />
          Auto-apply oldest bills first (FIFO)
        </label>

        {/* ACCT-F3590: embedded ParityTable owns Search+Range+gear; selectable when manual apply. */}
        <ParityTable<VendorBill>
          embedded
          rows={openBills}
          rowKey={(bill) => bill.id}
          storageKey="bill-payment-modal-open-bills"
          exportFilename="bill-payment-open-bills"
          tableTestId="bill-payment-open-bills-table"
          emptyText={billsQuery.isLoading ? "Loading open bills…" : "No open bills for this vendor."}
          selectable={!autoApply}
          selectedKeys={!autoApply ? Object.keys(included).filter((id) => included[id]) : undefined}
          onSelectionChange={
            !autoApply
              ? (keys) => {
                  const next: Record<string, boolean> = {};
                  for (const id of keys) next[id] = true;
                  setIncluded(next);
                }
              : undefined
          }
          columns={[
            {
              key: "bill",
              label: "Bill #",
              render: (bill) => entityLabel(bill.bill_number, bill.id, "Record"),
            },
            {
              key: "open",
              label: "Open balance",
              render: (bill) => money(billOpenBalanceCents(bill)),
            },
            {
              key: "apply",
              label: "Apply",
              render: (bill) => {
                const row = rows.find((r) => r.bill_id === bill.id);
                const applyCents = row?.payment_amount_cents ?? 0;
                if (autoApply) return money(applyCents);
                return (
                  <MoneyInput
                    valueDollars={amounts[bill.id] ?? null}
                    onChangeDollars={(d) => setAmounts((prev) => ({ ...prev, [bill.id]: d }))}
                    disabled={!included[bill.id]}
                    ariaLabel={`Apply to ${entityLabel(bill.bill_number, bill.id, "Record")}`}
                    className="w-24"
                  />
                );
              },
            },
            {
              key: "remaining",
              label: "Remaining",
              render: (bill) => {
                const open = billOpenBalanceCents(bill);
                const row = rows.find((r) => r.bill_id === bill.id);
                const applyCents = row?.payment_amount_cents ?? 0;
                return money(Math.max(0, open - applyCents));
              },
            },
          ]}
        />

        <div className="text-xs text-gray-600">
          Applied {money(appliedSum)} of {money(totalCents)}
          {totalCents > appliedSum ? ` · ${money(totalCents - appliedSum)} unapplied credit` : null}
        </div>

        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Memo
          <textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]" />
        </label>

      </form>
    </ParityDrawer>

    {/* Nested drawer: bank accounts are provisioned via Plaid (canonical Banking path) — same
        pattern as PayBillModal.tsx's identical "Add bank account" drawer. */}
    <ParityDrawer
      open={bankCreateOpen}
      onClose={() => setBankCreateOpen(false)}
      title="Add bank account"
      size="regular"
    >
      <div className="space-y-3 text-sm text-gray-700" data-testid="bill-payment-modal-add-bank-drawer">
        <p>
          Connect a bank account for this company. After Plaid succeeds, the new account appears in{" "}
          <strong>From bank account</strong> and can be selected for this payment.
        </p>
        <PlaidLink
          operatingCompanyId={operatingCompanyId}
          label="Connect via Plaid"
          onSuccess={async (accounts) => {
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
