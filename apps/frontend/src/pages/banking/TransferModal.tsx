import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createTransfer, getPlaidBankAccounts, markBankTransactionTransfer, type TransferAccountKind } from "../../api/banking";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: () => void;
  prefill?: {
    from_account_id?: string;
    to_account_id?: string;
    amount_cents?: number;
    transfer_date?: string;
    memo?: string;
  } | null;
  linkBankTransactionId?: string | null;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function minDateIso90DaysAgo() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 90);
  return d.toISOString().slice(0, 10);
}

function centsFromAmount(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function TransferModal({ open, operatingCompanyId, onClose, onSaved, prefill = null, linkBankTransactionId = null }: Props) {
  const { pushToast } = useToast();
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [transferDate, setTransferDate] = useState(todayIsoDate());
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const minD = minDateIso90DaysAgo();

  useEffect(() => {
    if (!open) return;
    if (prefill) {
      setFromAccountId(prefill.from_account_id ?? "");
      setToAccountId(prefill.to_account_id ?? "");
      setAmount(prefill.amount_cents != null && prefill.amount_cents > 0 ? (prefill.amount_cents / 100).toFixed(2) : "");
      setTransferDate(prefill.transfer_date ?? todayIsoDate());
      setMemo(prefill.memo ?? "");
    } else {
      setFromAccountId("");
      setToAccountId("");
      setAmount("");
      setTransferDate(todayIsoDate());
      setMemo("");
    }
  }, [open, prefill]);

  const bankAccountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", operatingCompanyId, "transfer-modal"],
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

  const amountCents = centsFromAmount(amount);
  const dateOk = transferDate >= minD && transferDate <= todayIsoDate();
  const valid =
    Boolean(fromAccountId && toAccountId && transferDate) && fromAccountId !== toAccountId && amountCents > 0 && dateOk;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await createTransfer(operatingCompanyId, {
        transfer_type: "bank_to_bank",
        from_account_id: fromAccountId,
        from_account_kind: "bank" as TransferAccountKind,
        to_account_id: toAccountId,
        to_account_kind: "bank",
        amount_cents: amountCents,
        transfer_date: transferDate,
        memo: memo.trim() || undefined,
      });
      if (linkBankTransactionId) {
        try {
          await markBankTransactionTransfer(linkBankTransactionId, operatingCompanyId, {
            from_account_id: fromAccountId,
            to_account_id: toAccountId,
          });
        } catch {
          /* optional until P6-T11204 */
        }
      }
      pushToast("Transfer recorded", "success");
      onSaved();
      onClose();
    } catch (error) {
      pushToast(String((error as Error)?.message ?? "Failed to record transfer"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Record transfer (bank to bank)">
      <div className="space-y-3 text-sm">
        <label className="block">
          From bank account
          <SelectCombobox
            aria-label="From bank account"
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
          >
            <option value="">Select account</option>
            {bankAccounts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="block">
          To bank account
          <SelectCombobox
            aria-label="To bank account"
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
          >
            <option value="">Select account</option>
            {bankAccounts
              .filter((a) => a.id !== fromAccountId)
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
          </SelectCombobox>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <label className="block">
            Date
            <input
              type="date"
              min={minD}
              max={todayIsoDate()}
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          Memo (optional)
          <textarea className="mt-1 min-h-16 w-full rounded border border-gray-300 px-2 py-1" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        {!dateOk ? <p className="text-xs text-amber-700">Transfer date must be within the last 90 days (not today-future).</p> : null}
        {!valid && dateOk ? <p className="text-xs text-amber-700">Select two different accounts and enter an amount greater than zero.</p> : null}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} disabled={!valid} onClick={() => void handleSave()}>
            Save transfer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
