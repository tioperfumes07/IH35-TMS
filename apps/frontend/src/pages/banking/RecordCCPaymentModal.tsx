import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { categorizeBankTransaction, getPlaidBankAccounts, recordCcPayment } from "../../api/banking";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { QboCombobox } from "../../components/forms/QboCombobox";
import { useToast } from "../../components/Toast";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { companyToday } from "../../lib/businessDate";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: () => void;
  // banking Categorize inline wiring (HELD): opening this modal FROM a bank-feed row (Transaction type
  // = "CC Payment") pre-seeds amount/date/from-bank-account from that row, and — once the payment
  // posts — best-effort marks the originating row categorized. Optional; the existing BankingHome
  // mount (no prefill props) keeps its blank-form behavior byte-for-byte.
  prefillAmountCents?: number;
  prefillDate?: string;
  prefillMemo?: string;
  prefillFromBankId?: string;
  linkBankTransactionId?: string | null;
};

function todayIsoDate() {
  return companyToday();
}

// M-1: amount stays a DOLLAR number → amount_cents = round(amount*100) unchanged (byte-for-byte).
function centsFromAmount(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function RecordCCPaymentModal({
  open,
  operatingCompanyId,
  onClose,
  onSaved,
  prefillAmountCents,
  prefillDate,
  prefillMemo,
  prefillFromBankId,
  linkBankTransactionId,
}: Props) {
  const { pushToast } = useToast();
  const [ccVendorId, setCcVendorId] = useState<string | null>(null);
  const [ccVendorLabel, setCcVendorLabel] = useState("");
  const [liabilityAccountId, setLiabilityAccountId] = useState<string | null>(null);
  const [liabilityLabel, setLiabilityLabel] = useState("");
  const [fromBankId, setFromBankId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [amount, setAmount] = useState<number | null>(null);
  const [memo, setMemo] = useState("");
  const [statementPeriod, setStatementPeriod] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCcVendorId(null);
    setCcVendorLabel("");
    setLiabilityAccountId(null);
    setLiabilityLabel("");
    setFromBankId(prefillFromBankId || "");
    setPaymentDate(prefillDate || todayIsoDate());
    setAmount(prefillAmountCents != null && prefillAmountCents > 0 ? prefillAmountCents / 100 : null);
    setMemo(prefillMemo ?? "");
    setStatementPeriod("");
  }, [open, prefillAmountCents, prefillDate, prefillFromBankId, prefillMemo]);

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
      // Best-effort: mark the originating bank-feed row categorized so it clears "for review". Reuses
      // the EXISTING /categorize poster (no new GL math — the JE already posted via recordCcPayment
      // above). vendor_id only sent when QboCombobox resolved a real vendors.id (uuid); a free-typed
      // label still lands in the memo via categorization_memo, never silently dropped.
      if (linkBankTransactionId) {
        try {
          await categorizeBankTransaction(linkBankTransactionId, operatingCompanyId, {
            category_kind: "CC Payment",
            gl_account_id: liabilityAccountId ?? undefined,
            vendor_id: vendorKey && UUID_RE.test(vendorKey) ? vendorKey : undefined,
            memo: memo.trim() || undefined,
          });
        } catch {
          // Best-effort only — the payment itself already posted; leave the row for manual review.
        }
      }
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
          <SelectCombobox
            aria-label="Pay from bank account"
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2"
            value={fromBankId}
            onChange={(e) => setFromBankId(e.target.value)}
          >
            <option value="">Select account</option>
            {bankAccounts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            Payment date
            <DatePicker className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2" value={paymentDate} onChange={setPaymentDate} />
          </label>
          <label className="block">
            Amount (USD)
            {/* M-1: dollars-mode QBO money entry; amount stays a DOLLAR number → amount_cents byte-for-byte. */}
            <MoneyInput valueDollars={amount} onChangeDollars={setAmount} className="mt-1 w-full" ariaLabel="Amount (USD)" />
          </label>
        </div>
        <label className="block">
          Statement period (optional)
          <input className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2" value={statementPeriod} onChange={(e) => setStatementPeriod(e.target.value)} placeholder="e.g. 2026-04" />
        </label>
        <label className="block">
          Memo (optional)
          <textarea className="mt-1 min-h-16 w-full rounded-sm border border-gray-300 px-2 py-1" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        {!valid ? <p className="text-xs text-slate-700">Select vendor, liability COA, bank account, and enter an amount greater than zero.</p> : null}
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
