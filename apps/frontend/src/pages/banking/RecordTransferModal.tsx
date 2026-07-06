import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  categorizeBankTransaction,
  createTransfer,
  getCoaAccounts,
  getPlaidBankAccounts,
  type TransferAccountKind,
  type TransferType,
} from "../../api/banking";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { MoneyInput } from "../../components/forms/MoneyInput";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  defaultTransferType?: TransferType;
  onClose: () => void;
  onSaved: () => void;
  // banking Categorize inline wiring (HELD): opening this modal FROM a bank-feed row (Transaction
  // type = "Transfer") pre-seeds the amount/date/memo + one side of the transfer from that row, and —
  // once the transfer posts — best-effort marks the originating row categorized so it clears the "for
  // review" queue. All optional; a caller that omits them (none exist today) keeps prior blank-form
  // behavior byte-for-byte.
  prefillAmountCents?: number;
  prefillDate?: string;
  prefillMemo?: string;
  seedAccountId?: string;
  seedAccountSide?: "from" | "to";
  linkBankTransactionId?: string | null;
};

type AccountOption = { id: string; name: string; kind: TransferAccountKind };

// OWNER SPEC (2026-07-06): the bank-to-bank From/To picker lists BANK + ASSET + LIABILITY accounts only —
// EXCLUDE Expense/Income/Equity/CostOfGoodsSold. Expenses stay in the separate "Category (Chart of
// Accounts)" categorize field, never here. catalogs.accounts.account_type values are the fixed CHECK-
// constraint set from db/migrations/0010_catalogs_init.sql.
const TRANSFER_ELIGIBLE_COA_TYPES = new Set(["Asset", "Liability"]);

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

// M-1: amount stays a DOLLAR number → amount_cents = round(amount*100) unchanged (byte-for-byte).
function centsFromAmount(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function RecordTransferModal({
  open,
  operatingCompanyId,
  defaultTransferType = "bank_to_bank",
  onClose,
  onSaved,
  prefillAmountCents,
  prefillDate,
  prefillMemo,
  seedAccountId,
  seedAccountSide,
  linkBankTransactionId,
}: Props) {
  const { pushToast } = useToast();
  const [transferType, setTransferType] = useState<TransferType>(defaultTransferType);
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [transferDate, setTransferDate] = useState(todayIsoDate());
  const [memo, setMemo] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTransferType(defaultTransferType);
    setFromAccountId(seedAccountSide === "from" && seedAccountId ? seedAccountId : "");
    setToAccountId(seedAccountSide === "to" && seedAccountId ? seedAccountId : "");
    setAmount(prefillAmountCents != null && prefillAmountCents > 0 ? prefillAmountCents / 100 : null);
    setTransferDate(prefillDate || todayIsoDate());
    setMemo(prefillMemo ?? "");
    setReferenceNumber("");
  }, [defaultTransferType, open, prefillAmountCents, prefillDate, prefillMemo, seedAccountId, seedAccountSide]);

  const bankAccountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", operatingCompanyId],
    queryFn: () => getPlaidBankAccounts(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });
  const coaAccountsQuery = useQuery({
    queryKey: ["banking", "coa-accounts", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
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
        account_type: account.account_type ?? "",
      })),
    [coaAccountsQuery.data?.accounts]
  );

  // OWNER SPEC (2026-07-06): Bank-to-Bank From/To = real bank accounts PLUS CoA Asset/Liability
  // accounts (e.g. a loan payable, a money-market asset) — never Expense/Income/Equity.
  const assetLiabilityCoaAccounts = useMemo(
    () => coaAccounts.filter((account) => TRANSFER_ELIGIBLE_COA_TYPES.has(account.account_type)),
    [coaAccounts]
  );

  const fromOptions = useMemo<AccountOption[]>(() => {
    if (transferType === "bank_to_bank") return [...bankAccounts, ...assetLiabilityCoaAccounts];
    if (transferType === "cc_payment" || transferType === "owner_distribution") return bankAccounts;
    if (transferType === "cash_deposit") {
      return coaAccounts.filter((account) => /cash|petty/i.test(account.name));
    }
    if (transferType === "owner_contribution") {
      return coaAccounts.filter((account) => /owner|equity|capital/i.test(account.name));
    }
    return [];
  }, [assetLiabilityCoaAccounts, bankAccounts, coaAccounts, transferType]);

  const toOptions = useMemo<AccountOption[]>(() => {
    if (transferType === "bank_to_bank") {
      return [...bankAccounts, ...assetLiabilityCoaAccounts].filter((account) => account.id !== fromAccountId);
    }
    if (transferType === "cc_payment") {
      const creditAccounts = coaAccounts.filter((account) => /credit|card|visa|mastercard|amex|liability/i.test(account.name));
      return creditAccounts.length > 0 ? creditAccounts : coaAccounts;
    }
    if (transferType === "cash_deposit" || transferType === "owner_contribution") return bankAccounts;
    if (transferType === "owner_distribution") {
      return coaAccounts.filter((account) => /owner|equity|capital/i.test(account.name));
    }
    return [];
  }, [assetLiabilityCoaAccounts, bankAccounts, coaAccounts, transferType, fromAccountId]);

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
      // Best-effort: mark the originating bank-feed row categorized so it clears "for review". Reuses
      // the EXISTING /categorize poster (no new GL math — categorize is a status/tag update, the JE
      // already posted via createTransfer above). Only wired for a Bank<->CoA leg: the CoA side IS a
      // catalogs.accounts id, exactly what gl_account_id expects. A bank<->bank leg (destination is
      // another Plaid account, not a catalogs.accounts row) is intentionally left for manual
      // categorization — the only endpoint built for that (mark-transfer) has a known-broken/mismatched
      // contract (see api/banking.ts markBankTransactionTransfer comment); wiring around a broken
      // contract here would be a guess, not a verified fix.
      if (linkBankTransactionId) {
        const coaSideId = fromAccountKind === "coa" ? fromAccountId : toAccountKind === "coa" ? toAccountId : null;
        if (coaSideId) {
          try {
            await categorizeBankTransaction(linkBankTransactionId, operatingCompanyId, {
              category_kind: "Transfer",
              gl_account_id: coaSideId,
              memo: memo.trim() || undefined,
            });
          } catch {
            // Best-effort only — the transfer itself already posted; leave the row for manual review.
          }
        }
      }
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
            <label key={option.value} className="flex items-center gap-2 rounded-sm border border-gray-200 px-2 py-1">
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
          <SelectCombobox className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
            <option value="">Select account</option>
            {fromOptions.map((option) => (
              <option key={`${option.kind}-${option.id}`} value={option.id}>
                {option.name}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="block">
          To Account
          <SelectCombobox className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            <option value="">Select account</option>
            {toOptions.map((option) => (
              <option key={`${option.kind}-${option.id}`} value={option.id}>
                {option.name}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            Amount (USD)
            {/* M-1: dollars-mode QBO money entry; amount stays a DOLLAR number → amount_cents byte-for-byte. */}
            <MoneyInput valueDollars={amount} onChangeDollars={setAmount} className="mt-1 w-full" ariaLabel="Amount (USD)" />
          </label>
          <label className="block">
            Date
            <input type="date" className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
          </label>
        </div>
        <label className="block">
          Memo
          <textarea className="mt-1 min-h-20 w-full rounded-sm border border-gray-300 px-2 py-1" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        <label className="block">
          Reference Number
          <input className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        </label>
        {!valid ? <p className="text-xs text-slate-700">Select both accounts, use different accounts, and enter an amount greater than zero.</p> : null}
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

