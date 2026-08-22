import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  categorizeBankTransaction,
  createTransfer,
  getAllAccounts,
  getCoaAccounts,
  markBankTransactionTransfer,
  type TransferAccountKind,
  type TransferType,
} from "../../api/banking";
import { Button } from "../../components/Button";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { useToast } from "../../components/Toast";
import { EntityLink } from "../../components/shared/EntityLink";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { companyToday } from "../../lib/businessDate";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  buildBankTransferPickerOptions,
  formatBankAccountPickerLabel,
  type BankAccountPickerRow,
  type TransferPickerOption,
} from "./transferAccountPicker";

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
  linkBankTransactionLabel?: string | null;
};

const transferTypeOptions: Array<{ value: TransferType; label: string }> = [
  { value: "bank_to_bank", label: "Bank-to-Bank" },
  { value: "cc_payment", label: "CC Payment" },
  { value: "cash_deposit", label: "Cash Deposit" },
  { value: "owner_contribution", label: "Owner Contribution" },
  { value: "owner_distribution", label: "Owner Distribution" },
];

function todayIsoDate() {
  return companyToday();
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
  linkBankTransactionLabel,
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

  // QBO parity: all active banking.bank_accounts (Plaid + manual/system e.g. Relay), not Plaid-only.
  const bankAccountsQuery = useQuery({
    queryKey: ["banking", "accounts-all", operatingCompanyId, "record-transfer"],
    queryFn: () => getAllAccounts(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });
  const coaAccountsQuery = useQuery({
    queryKey: ["banking", "coa-accounts", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });

  const bankAccountRows = useMemo<BankAccountPickerRow[]>(
    () =>
      (bankAccountsQuery.data?.accounts ?? []).map((row) => ({
        id: String(row.id ?? ""),
        display_name: (row.display_name as string | null | undefined) ?? null,
        account_name: (row.account_name as string | null | undefined) ?? null,
        institution_name: (row.institution_name as string | null | undefined) ?? null,
        account_mask: (row.account_mask as string | null | undefined) ?? null,
        ledger_account_id: (row.ledger_account_id as string | null | undefined) ?? null,
      })).filter((row) => row.id.length > 0),
    [bankAccountsQuery.data?.accounts]
  );

  const coaAccounts = useMemo(
    () =>
      (coaAccountsQuery.data?.accounts ?? []).map((account) => ({
        id: account.id,
        name: account.account_name,
        kind: "coa" as const,
        account_type: account.account_type ?? "",
        account_number: account.account_number ?? null,
        account_name: account.account_name,
      })),
    [coaAccountsQuery.data?.accounts]
  );

  const bankOptions = useMemo(
    () =>
      bankAccountRows.map((account) => ({
        id: account.id,
        name: formatBankAccountPickerLabel(account),
        kind: "bank" as const,
      })),
    [bankAccountRows]
  );

  // OWNER SPEC (2026-07-06) + QBO: bank_to_bank = all bank accounts + Asset/Liability CoA not already
  // linked as a bank ledger (avoids double-listing Relay wallet as bank + CoA).
  const bankToBankOptions = useMemo(
    () =>
      buildBankTransferPickerOptions({
        bankAccounts: bankAccountRows,
        coaAccounts: coaAccounts.map((a) => ({
          id: a.id,
          account_number: a.account_number,
          account_name: a.account_name,
          account_type: a.account_type,
        })),
      }),
    [bankAccountRows, coaAccounts]
  );

  const fromOptions = useMemo<TransferPickerOption[]>(() => {
    if (transferType === "bank_to_bank") return bankToBankOptions;
    if (transferType === "cc_payment" || transferType === "owner_distribution") return bankOptions;
    if (transferType === "cash_deposit") {
      return coaAccounts
        .filter((account) => /cash|petty/i.test(account.name))
        .map((account) => ({ id: account.id, name: account.name, kind: "coa" as const }));
    }
    if (transferType === "owner_contribution") {
      return coaAccounts
        .filter((account) => /owner|equity|capital/i.test(account.name))
        .map((account) => ({ id: account.id, name: account.name, kind: "coa" as const }));
    }
    return [];
  }, [bankOptions, bankToBankOptions, coaAccounts, transferType]);

  const toOptions = useMemo<TransferPickerOption[]>(() => {
    if (transferType === "bank_to_bank") {
      return bankToBankOptions.filter((account) => account.id !== fromAccountId);
    }
    if (transferType === "cc_payment") {
      const creditAccounts = coaAccounts.filter((account) => /credit|card|visa|mastercard|amex|liability/i.test(account.name));
      const list = creditAccounts.length > 0 ? creditAccounts : coaAccounts;
      return list.map((account) => ({ id: account.id, name: account.name, kind: "coa" as const }));
    }
    if (transferType === "cash_deposit" || transferType === "owner_contribution") return bankOptions;
    if (transferType === "owner_distribution") {
      return coaAccounts
        .filter((account) => /owner|equity|capital/i.test(account.name))
        .map((account) => ({ id: account.id, name: account.name, kind: "coa" as const }));
    }
    return [];
  }, [bankOptions, bankToBankOptions, coaAccounts, transferType, fromAccountId]);

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
      // Best-effort: link the originating bank-feed row so it clears "for review".
      // Bank<->CoA legs use /categorize (gl_account_id = catalogs.accounts id).
      // Bank<->Bank legs use markBankTransactionTransfer → POST …/transfer (TransferModal parity).
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
        } else if (transferType === "bank_to_bank" && fromAccountKind === "bank" && toAccountKind === "bank") {
          try {
            const destinationBankAccountId = seedAccountSide === "to" ? fromAccountId : toAccountId;
            const transferKind = seedAccountSide === "to" ? "in" : "out";
            // existing_transfer_id: the ledger row was ALREADY minted above — this call must only LINK
            // (matched_transfer_id), never mint a second banking.transfers row (BANK-ECON-03).
            await markBankTransactionTransfer(linkBankTransactionId, operatingCompanyId, {
              destination_bank_account_id: destinationBankAccountId,
              transfer_kind: transferKind,
              existing_transfer_id: response.transfer.id,
            });
          } catch {
            // Best-effort only — createTransfer ledger entry above is source of truth.
          }
        }
      }
      onSaved();
      onClose();
    } catch (error) {
      pushToast(userFacingApiError(error, "Failed to record transfer"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ParityDrawer
      open={open}
      onClose={onClose}
      title="Record Transfer"
      footer={
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} disabled={!valid} onClick={() => void handleSave()}>
            Save Transfer
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        {/* LINK-F5190: linkBankTransactionId is the real originating banking.bank_transactions id
            (already used functionally in categorizeBankTransaction/markBankTransactionTransfer
            below) -- was never rendered. */}
        {linkBankTransactionId ? (
          <p className="text-xs text-gray-600">
            Originating bank transaction:{" "}
            <EntityLink
              kind="bank_transaction"
              id={linkBankTransactionId}
              label={linkBankTransactionLabel?.trim() || "Bank transaction"}
            />
          </p>
        ) : null}
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
            <DatePicker className="mt-1 h-9 w-full" value={transferDate} onChange={setTransferDate} />
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
      </div>
    </ParityDrawer>
  );
}
