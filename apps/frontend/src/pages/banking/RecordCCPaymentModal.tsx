import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPlaidBankAccounts, recordCcPayment } from "../../api/banking";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { QboCombobox } from "../../components/forms/QboCombobox";
import { useToast } from "../../components/Toast";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: () => void;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function centsFromAmount(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function RecordCCPaymentModal({ open, operatingCompanyId, onClose, onSaved }: Props) {
  const { pushToast } = useToast();
  const [ccVendorId, setCcVendorId] = useState<string | null>(null);
  const [ccVendorLabel, setCcVendorLabel] = useState("");
  const [liabilityAccountId, setLiabilityAccountId] = useState<string | null>(null);
  const [liabilityLabel, setLiabilityLabel] = useState("");
  const [fromBankId, setFromBankId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [statementPeriod, setStatementPeriod] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCcVendorId(null);
    setCcVendorLabel("");
    setLiabilityAccountId(null);
    setLiabilityLabel("");
    setFromBankId("");
    setPaymentDate(todayIsoDate());
    setAmount("");
    setMemo("");
    setStatementPeriod("");
  }, [open]);

  const bankAccountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", operatingCompanyId, "cc-payment-modal"],
    queryFn: () => getPlaidBankAccounts(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });

  const bankAccounts = useMemo(
    () =>
      (bankAccountsQuery.data?.accounts ?? []).map((account) => ({
        id: account.id,
        name: `${account.institution_name || "Bank"} - ${account.account_name || "Account"}${account.account_mask ? ` ••••${account.account_mask}` : ""}`,
      })),
    [bankAccountsQuery.data?.accounts]
  );

  const vendorKey = (ccVendorId ?? ccVendorLabel).trim();
  const amountCents = centsFromAmount(amount);
  const valid =
    Boolean(vendorKey && liabilityAccountId && fromBankId && paymentDate) && amountCents > 0;

  const handleSave = async () => {
    if (!valid || !liabilityAccountId) return;
    setSaving(true);
    try {
      await recordCcPayment(operatingCompanyId, {
        cc_vendor_id: vendorKey,
        cc_liability_coa_account_id: liabilityAccountId,
        from_bank_account_id: fromBankId,
        payment_date: paymentDate,
        amount_cents: amountCents,
        memo: memo.trim() || undefined,
        statement_period: statementPeriod.trim() || undefined,
      });
      pushToast("Credit card payment recorded", "success");
      onSaved();
      onClose();
    } catch (error) {
      pushToast(String((error as Error)?.message ?? "Failed to record payment"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Pay credit card">
      <div className="space-y-3 text-sm">
        <label className="block text-xs font-semibold text-gray-700">
          Credit card vendor (QuickBooks)
          <div className="mt-1 font-normal">
            <QboCombobox
              entityType="vendor"
              operatingCompanyId={operatingCompanyId}
              value={ccVendorId}
              displayValue={ccVendorLabel}
              onChange={(qboId, displayName) => {
                setCcVendorId(qboId);
                setCcVendorLabel(displayName);
              }}
            />
          </div>
        </label>
        <label className="block text-xs font-semibold text-gray-700">
          Card liability account (COA)
          <div className="mt-1 font-normal">
            <QboCombobox
              entityType="account"
              operatingCompanyId={operatingCompanyId}
              value={liabilityAccountId}
              displayValue={liabilityLabel}
              onChange={(qboId, displayName) => {
                setLiabilityAccountId(qboId);
                setLiabilityLabel(displayName);
              }}
            />
          </div>
        </label>
        <label className="block">
          Pay from bank account
          <select
            aria-label="Pay from bank account"
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
            value={fromBankId}
            onChange={(e) => setFromBankId(e.target.value)}
          >
            <option value="">Select account</option>
            {bankAccounts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            Payment date
            <input type="date" className="mt-1 h-9 w-full rounded border border-gray-300 px-2" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </label>
          <label className="block">
            Amount (USD)
            <input
              aria-label="Amount (USD)"
              type="number"
              min="0"
              step="0.01"
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          Statement period (optional)
          <input className="mt-1 h-9 w-full rounded border border-gray-300 px-2" value={statementPeriod} onChange={(e) => setStatementPeriod(e.target.value)} placeholder="e.g. 2026-04" />
        </label>
        <label className="block">
          Memo (optional)
          <textarea className="mt-1 min-h-16 w-full rounded border border-gray-300 px-2 py-1" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        {!valid ? <p className="text-xs text-amber-700">Select vendor, liability COA, bank account, and enter an amount greater than zero.</p> : null}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} disabled={!valid} onClick={() => void handleSave()}>
            Record payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}
