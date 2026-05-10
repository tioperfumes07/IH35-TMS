import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createTransfer,
  getCoaAccounts,
  getPlaidBankAccounts,
  type TransferAccountKind,
  type TransferType,
} from "../../api/banking";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  defaultTransferType?: TransferType;
  onClose: () => void;
  onSaved: () => void;
};

type AccountOption = { id: string; name: string; kind: TransferAccountKind };

const transferTypeOptions: Array<{ value: TransferType; label: string }> = [
  { value: "bank_to_bank", label: "Bank-to-Bank" },
  { value: "cc_payment", label: "CC Payment" },
  { value: "cash_deposit", label: "Cash Deposit" },
  { value: "owner_contribution", label: "Owner Contribution" },
  { value: "owner_distribution", label: "Owner Distribution" },
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function centsFromAmount(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function RecordTransferModal({ open, operatingCompanyId, defaultTransferType = "bank_to_bank", onClose, onSaved }: Props) {
  const { pushToast } = useToast();
  const [transferType, setTransferType] = useState<TransferType>(defaultTransferType);
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [transferDate, setTransferDate] = useState(todayIsoDate());
  const [memo, setMemo] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTransferType(defaultTransferType);
    setFromAccountId("");
    setToAccountId("");
    setAmount("");
    setTransferDate(todayIsoDate());
    setMemo("");
    setReferenceNumber("");
  }, [defaultTransferType, open]);

  const bankAccountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", operatingCompanyId],
    queryFn: () => getPlaidBankAccounts(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });
  const coaAccountsQuery = useQuery({
    queryKey: ["banking", "coa-accounts", operatingCompanyId],
    queryFn: () => getCoaAccounts(),
    enabled: open,
  });

  const bankAccounts = useMemo(
    () =>
      (bankAccountsQuery.data?.accounts ?? []).map((account) => ({
        id: account.id,
        name: `${account.institution_name || "Bank"} - ${account.account_name || "Account"}${account.account_mask ? ` ••••${account.account_mask}` : ""}`,
        kind: "bank" as const,
      })),
    [bankAccountsQuery.data?.accounts]
  );
  const coaAccounts = useMemo(
    () =>
      (coaAccountsQuery.data?.accounts ?? []).map((account) => ({
        id: account.id,
        name: `${account.account_number || "COA"} - ${account.account_name}`,
        kind: "coa" as const,
      })),
    [coaAccountsQuery.data?.accounts]
  );

  const fromOptions = useMemo<AccountOption[]>(() => {
    if (transferType === "bank_to_bank" || transferType === "cc_payment" || transferType === "owner_distribution") return bankAccounts;
    if (transferType === "cash_deposit") {
      return coaAccounts.filter((account) => /cash|petty/i.test(account.name));
    }
    if (transferType === "owner_contribution") {
      return coaAccounts.filter((account) => /owner|equity|capital/i.test(account.name));
    }
    return [];
  }, [bankAccounts, coaAccounts, transferType]);

  const toOptions = useMemo<AccountOption[]>(() => {
    if (transferType === "bank_to_bank") return bankAccounts.filter((account) => account.id !== fromAccountId);
    if (transferType === "cc_payment") {
      const creditAccounts = coaAccounts.filter((account) => /credit|card|visa|mastercard|amex|liability/i.test(account.name));
      return creditAccounts.length > 0 ? creditAccounts : coaAccounts;
    }
    if (transferType === "cash_deposit" || transferType === "owner_contribution") return bankAccounts;
    if (transferType === "owner_distribution") {
      return coaAccounts.filter((account) => /owner|equity|capital/i.test(account.name));
    }
    return [];
  }, [bankAccounts, coaAccounts, transferType, fromAccountId]);

  const fromAccountKind: TransferAccountKind = transferType === "cc_payment" ? "bank" : (fromOptions.find((option) => option.id === fromAccountId)?.kind ?? "bank");
  const toAccountKind: TransferAccountKind = transferType === "cc_payment" ? "cc" : (toOptions.find((option) => option.id === toAccountId)?.kind ?? "bank");

  const amountCents = centsFromAmount(amount);
  const valid = Boolean(fromAccountId && toAccountId && transferDate) && fromAccountId !== toAccountId && amountCents > 0;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const response = await createTransfer(operatingCompanyId, {
        transfer_type: transferType,
        from_account_id: fromAccountId,
        from_account_kind: fromAccountKind,
        to_account_id: toAccountId,
        to_account_kind: toAccountKind,
        amount_cents: amountCents,
        transfer_date: transferDate,
        memo: memo.trim() || undefined,
        reference_number: referenceNumber.trim() || undefined,
      });
      pushToast(`Transfer recorded (${response.transfer.id})`, "success");
      onSaved();
      onClose();
    } catch (error) {
      pushToast(String((error as Error)?.message ?? "Failed to record transfer"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Record Transfer">
      <div className="space-y-3 text-sm">
        <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {transferTypeOptions.map((option) => (
            <label key={option.value} className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1">
              <input
                type="radio"
                checked={transferType === option.value}
                onChange={() => {
                  setTransferType(option.value);
                  setFromAccountId("");
                  setToAccountId("");
                }}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <label className="block">
          From Account
          <select className="mt-1 h-9 w-full rounded border border-gray-300 px-2" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
            <option value="">Select account</option>
            {fromOptions.map((option) => (
              <option key={`${option.kind}-${option.id}`} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          To Account
          <select className="mt-1 h-9 w-full rounded border border-gray-300 px-2" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            <option value="">Select account</option>
            {toOptions.map((option) => (
              <option key={`${option.kind}-${option.id}`} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            Amount (USD)
            <input type="number" min="0" step="0.01" className="mt-1 h-9 w-full rounded border border-gray-300 px-2" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="block">
            Date
            <input type="date" className="mt-1 h-9 w-full rounded border border-gray-300 px-2" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
          </label>
        </div>
        <label className="block">
          Memo
          <textarea className="mt-1 min-h-20 w-full rounded border border-gray-300 px-2 py-1" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        <label className="block">
          Reference Number
          <input className="mt-1 h-9 w-full rounded border border-gray-300 px-2" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        </label>
        {!valid ? <p className="text-xs text-amber-700">Select both accounts, use different accounts, and enter an amount greater than zero.</p> : null}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} disabled={!valid} onClick={() => void handleSave()}>
            Save Transfer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

