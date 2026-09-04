import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createIntercompanyTransfer,
  createTransfer,
  getAllAccounts,
  listIntercompanyPairs,
  markBankTransactionTransfer,
  type TransferAccountKind,
} from "../../api/banking";
import { Button } from "../../components/Button";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { useToast } from "../../components/Toast";
import { EntityLink } from "../../components/shared/EntityLink";
import { SelectCombobox } from "../../components/Combobox";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { companyToday } from "../../lib/businessDate";
import { entityLabel } from "../../lib/entity-label";
import { formatBankAccountPickerLabel, type BankAccountPickerRow } from "./transferAccountPicker";
import { userFacingApiError } from "../../lib/api-error-message";

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

type TransferScope = "intra" | "intercompany";

function todayIsoDate() {
  return companyToday();
}

function minDateIso90DaysAgo() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 90);
  return d.toISOString().slice(0, 10);
}

function centsFromAmount(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function mapBankOptions(rows: Array<Record<string, unknown>> | undefined) {
  return (rows ?? [])
    .map(
      (row): BankAccountPickerRow => ({
        id: String(row.id ?? ""),
        display_name: (row.display_name as string | null | undefined) ?? null,
        account_name: (row.account_name as string | null | undefined) ?? null,
        institution_name: (row.institution_name as string | null | undefined) ?? null,
        account_mask: (row.account_mask as string | null | undefined) ?? null,
        ledger_account_id: (row.ledger_account_id as string | null | undefined) ?? null,
      })
    )
    .filter((account) => account.id.length > 0)
    .map((account) => ({ id: account.id, name: formatBankAccountPickerLabel(account) }));
}

export function TransferModal({ open, operatingCompanyId, onClose, onSaved, prefill = null, linkBankTransactionId = null }: Props) {
  const { pushToast } = useToast();
  const [scope, setScope] = useState<TransferScope>("intra");
  const [counterpartyCompanyId, setCounterpartyCompanyId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [transferDate, setTransferDate] = useState(todayIsoDate());
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const minD = minDateIso90DaysAgo();

  useEffect(() => {
    if (!open) return;
    setScope("intra");
    setCounterpartyCompanyId("");
    if (prefill) {
      setFromAccountId(prefill.from_account_id ?? "");
      setToAccountId(prefill.to_account_id ?? "");
      setAmount(prefill.amount_cents != null && prefill.amount_cents > 0 ? prefill.amount_cents / 100 : null);
      setTransferDate(prefill.transfer_date ?? todayIsoDate());
      setMemo(prefill.memo ?? "");
    } else {
      setFromAccountId("");
      setToAccountId("");
      setAmount(null);
      setTransferDate(todayIsoDate());
      setMemo("");
    }
  }, [open, prefill]);

  // QBO parity: all active banking.bank_accounts (includes Relay Fuel Wallet — no Plaid link).
  const bankAccountsQuery = useQuery({
    queryKey: ["banking", "accounts-all", operatingCompanyId, "transfer-modal"],
    queryFn: () => getAllAccounts(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });

  const pairsQuery = useQuery({
    queryKey: ["banking", "intercompany-pairs", operatingCompanyId],
    queryFn: () => listIntercompanyPairs(operatingCompanyId),
    enabled: open && scope === "intercompany" && Boolean(operatingCompanyId),
  });

  const counterpartyAccountsQuery = useQuery({
    queryKey: ["banking", "accounts-all", counterpartyCompanyId, "transfer-modal-counterparty"],
    queryFn: () => getAllAccounts(counterpartyCompanyId),
    enabled: open && scope === "intercompany" && Boolean(counterpartyCompanyId),
  });

  const bankAccounts = useMemo(
    () => mapBankOptions(bankAccountsQuery.data?.accounts as Array<Record<string, unknown>> | undefined),
    [bankAccountsQuery.data?.accounts]
  );

  const counterpartyAccounts = useMemo(
    () => mapBankOptions(counterpartyAccountsQuery.data?.accounts as Array<Record<string, unknown>> | undefined),
    [counterpartyAccountsQuery.data?.accounts]
  );

  const toAccountOptions = scope === "intercompany" ? counterpartyAccounts : bankAccounts.filter((a) => a.id !== fromAccountId);

  const amountCents = centsFromAmount(amount);
  const dateOk = transferDate >= minD && transferDate <= todayIsoDate();
  const valid =
    Boolean(fromAccountId && toAccountId && transferDate) &&
    amountCents > 0 &&
    dateOk &&
    (scope === "intra"
      ? fromAccountId !== toAccountId
      : Boolean(counterpartyCompanyId) && counterpartyCompanyId !== operatingCompanyId);

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      if (scope === "intercompany") {
        await createIntercompanyTransfer(operatingCompanyId, {
          counterparty_company_id: counterpartyCompanyId,
          transfer_type: "bank_to_bank",
          from_account_id: fromAccountId,
          from_account_kind: "bank",
          to_account_id: toAccountId,
          to_account_kind: "bank",
          amount_cents: amountCents,
          transfer_date: transferDate,
          memo: memo.trim() || undefined,
        });
        pushToast("Intercompany transfer recorded (both entity legs)", "success");
      } else {
        const created = await createTransfer(operatingCompanyId, {
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
            // linkBankTransactionId is the bank-feed row for the OUTGOING leg (money leaving fromAccountId);
            // tag it as an inter-account transfer to toAccountId so bank-feed GL posting skips it.
            // existing_transfer_id: the ledger row was ALREADY minted above — this call must only LINK
            // (matched_transfer_id), never mint a second banking.transfers row (BANK-ECON-03).
            await markBankTransactionTransfer(linkBankTransactionId, operatingCompanyId, {
              destination_bank_account_id: toAccountId,
              transfer_kind: "out",
              existing_transfer_id: created.transfer.id,
            });
          } catch {
            /* optional — the createTransfer ledger entry above is the source of truth either way */
          }
        }
        pushToast("Transfer recorded", "success");
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
      title={scope === "intercompany" ? "Record intercompany transfer" : "Record transfer (bank to bank)"}
      footer={
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} disabled={!valid} onClick={() => void handleSave()} data-testid="transfer-modal-save">
            Save transfer
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-xs">
        {/* LINK-F5190: linkBankTransactionId is the real bank-feed row for the outgoing leg
            (already used functionally in markBankTransactionTransfer below) -- was never rendered. */}
        {linkBankTransactionId ? (
          <p className="text-xs text-gray-600">
            Originating bank transaction:{" "}
            <EntityLink kind="bank_transaction" id={linkBankTransactionId} label="View transaction →" />
          </p>
        ) : null}
        <div className="flex items-center gap-1 rounded-sm border border-gray-300 p-0.5 text-xs w-fit" data-testid="transfer-scope-toggle">
          {(["intra", "intercompany"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setScope(tab);
                setToAccountId("");
                if (tab === "intra") setCounterpartyCompanyId("");
              }}
              className={`rounded px-3 py-1 ${scope === tab ? "bg-[#1f2a44] text-white" : "text-gray-700 hover:bg-gray-50"}`}
            >
              {tab === "intra" ? "Same entity" : "Intercompany"}
            </button>
          ))}
        </div>

        {scope === "intercompany" ? (
          <label className="block">
            Counterparty entity
            <SelectCombobox
              aria-label="Counterparty entity"
              className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
              value={counterpartyCompanyId}
              onChange={(e) => {
                setCounterpartyCompanyId(e.target.value);
                setToAccountId("");
              }}
              data-testid="transfer-intercompany-counterparty"
            >
              <option value="">Select counterparty</option>
              {(pairsQuery.data?.pairs ?? []).map((pair) => (
                <option key={pair.id} value={pair.counterparty_company_id}>
                  {entityLabel(pair.counterparty_code, pair.counterparty_company_id, "Entity")}
                  {pair.account_number ? ` · IC ${pair.account_number}` : ""}
                </option>
              ))}
            </SelectCombobox>
            {pairsQuery.isFetched && (pairsQuery.data?.pairs ?? []).length === 0 ? (
              <p className="mt-1 text-xs text-slate-600">
                No active intercompany entity pairs for this company (honest empty — map pairs before posting).
              </p>
            ) : null}
          </label>
        ) : null}

        <label className="block">
          From bank account{scope === "intercompany" ? " (this entity)" : ""}
          <SelectCombobox
            aria-label="From bank account"
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
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
          To bank account{scope === "intercompany" ? " (counterparty entity)" : ""}
          <SelectCombobox
            aria-label="To bank account"
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
          >
            <option value="">Select account</option>
            {toAccountOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            Amount (USD)
            {/* M-1: dollars-mode QBO money entry; amount stays a DOLLAR number → amount_cents = round(amount*100)
                unchanged (byte-for-byte). */}
            <MoneyInput valueDollars={amount} onChangeDollars={setAmount} className="mt-1 w-full" ariaLabel="Amount (USD)" />
          </label>
          <label className="block">
            Date
            <DatePicker
              min={minD}
              max={todayIsoDate()}
              className="mt-1 h-9 w-full"
              value={transferDate}
              onChange={setTransferDate}
            />
          </label>
        </div>
        <label className="block">
          Memo (optional)
          <textarea className="mt-1 min-h-16 w-full rounded-sm border border-gray-300 px-2 py-1" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        {scope === "intercompany" ? (
          <p className="text-xs text-slate-600">
            Posts two reciprocal legs (one per entity book) joined by intercompany_transfer_group_id. GL still flag-gated per entity.
          </p>
        ) : null}
        {!dateOk ? <p className="text-xs text-slate-700">Transfer date must be within the last 90 days (not today-future).</p> : null}
        {!valid && dateOk ? (
          <p className="text-xs text-slate-700">
            {scope === "intercompany"
              ? "Select counterparty, both bank accounts, and an amount greater than zero."
              : "Select two different accounts and enter an amount greater than zero."}
          </p>
        ) : null}
      </div>
    </ParityDrawer>
  );
}
