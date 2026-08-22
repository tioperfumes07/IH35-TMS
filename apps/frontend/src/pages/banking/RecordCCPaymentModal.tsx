import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { categorizeBankTransaction, getPlaidBankAccounts, recordCcPayment } from "../../api/banking";
import { listCatalogAccounts } from "../../api/catalog-accounts";
import { listVendors } from "../../api/mdata";
import { Button } from "../../components/Button";
import { CappedListNotice } from "../../components/CappedListNotice";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { vendorReferenceOption } from "../../components/parity/referenceOptionLabels";
import { useToast } from "../../components/Toast";
import { EntityLink } from "../../components/shared/EntityLink";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { companyToday } from "../../lib/businessDate";
import { userFacingApiError } from "../../lib/api-error-message";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: () => void;
  prefillAmountCents?: number;
  prefillDate?: string;
  prefillMemo?: string;
  prefillFromBankId?: string;
  linkBankTransactionId?: string | null;
  linkBankTransactionLabel?: string | null;
};

function todayIsoDate() {
  return companyToday();
}

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
  linkBankTransactionLabel,
}: Props) {
  const { pushToast } = useToast();
  const [ccVendorId, setCcVendorId] = useState<string | null>(null);
  const [liabilityAccountId, setLiabilityAccountId] = useState<string | null>(null);
  const [fromBankId, setFromBankId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [amount, setAmount] = useState<number | null>(null);
  const [memo, setMemo] = useState("");
  const [statementPeriod, setStatementPeriod] = useState("");
  const [saving, setSaving] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setCcVendorId(null);
    setLiabilityAccountId(null);
    setFromBankId(prefillFromBankId || "");
    setPaymentDate(prefillDate || todayIsoDate());
    setAmount(prefillAmountCents != null && prefillAmountCents > 0 ? prefillAmountCents / 100 : null);
    setMemo(prefillMemo ?? "");
    setStatementPeriod("");
    setVendorSearch("");
  }, [open, prefillAmountCents, prefillDate, prefillFromBankId, prefillMemo]);

  const bankAccountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", operatingCompanyId, "cc-payment-modal"],
    queryFn: () => getPlaidBankAccounts(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });
  const vendorsQuery = useQuery({
    queryKey: ["cc-payment", "vendors", operatingCompanyId, vendorSearch],
    queryFn: () =>
      listVendors({
        operating_company_id: operatingCompanyId,
        limit: 200,
        search: vendorSearch.trim() || undefined,
      }),
    enabled: open && Boolean(operatingCompanyId),
  });
  const accountsQuery = useQuery({
    queryKey: ["cc-payment", "liability-accounts", operatingCompanyId],
    // LST-F14: CC payment account picker — server-side is_postable=true.
    queryFn: () =>
      listCatalogAccounts({
        status: "active",
        operating_company_id: operatingCompanyId,
        postable_only: true,
      }),
    enabled: open && Boolean(operatingCompanyId),
    staleTime: 60_000,
  });

  const bankAccounts = useMemo(
    () =>
      (bankAccountsQuery.data?.accounts ?? []).map((account) => ({
        id: account.id,
        name: `${account.institution_name || "Bank"} - ${account.account_name || "Account"}${account.account_mask ? ` ••••${account.account_mask}` : ""}`,
      })),
    [bankAccountsQuery.data?.accounts]
  );

  const vendorOptions = useMemo(
    () => (vendorsQuery.data?.vendors ?? []).map(vendorReferenceOption),
    [vendorsQuery.data?.vendors]
  );

  const liabilityOptions = useMemo(
    () =>
      (accountsQuery.data?.accounts ?? [])
        .filter(
          (acct) =>
            acct.is_postable &&
            !acct.deactivated_at &&
            (acct.account_type === "Liability" ||
              String(acct.account_subtype ?? "").toLowerCase().includes("credit") ||
              String(acct.account_name ?? "").toLowerCase().includes("credit card"))
        )
        .map((acct) => ({
          value: acct.id,
          label: acct.account_name,
          type: acct.account_type ?? undefined,
        })),
    [accountsQuery.data?.accounts]
  );

  const amountCents = centsFromAmount(amount);
  const valid =
    Boolean(ccVendorId && liabilityAccountId && fromBankId && paymentDate) && amountCents > 0;

  const handleSave = async () => {
    if (!valid || !liabilityAccountId || !ccVendorId) return;
    setSaving(true);
    try {
      await recordCcPayment(operatingCompanyId, {
        cc_vendor_id: ccVendorId,
        cc_liability_coa_account_id: liabilityAccountId,
        from_bank_account_id: fromBankId,
        payment_date: paymentDate,
        amount_cents: amountCents,
        memo: memo.trim() || undefined,
        statement_period: statementPeriod.trim() || undefined,
      });
      pushToast("Credit card payment recorded", "success");
      if (linkBankTransactionId) {
        try {
          await categorizeBankTransaction(linkBankTransactionId, operatingCompanyId, {
            category_kind: "CC Payment",
            gl_account_id: liabilityAccountId ?? undefined,
            vendor_id: UUID_RE.test(ccVendorId) ? ccVendorId : undefined,
            memo: memo.trim() || undefined,
          });
        } catch {
          // Best-effort only — the payment itself already posted; leave the row for manual review.
        }
      }
      onSaved();
      onClose();
    } catch (error) {
      pushToast(userFacingApiError(error, "Failed to record payment"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ParityDrawer
      open={open}
      onClose={onClose}
      title="Pay credit card"
      size="wide"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={!valid || saving}>
            {saving ? "Saving…" : "Record payment"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm" data-testid="record-cc-payment-drawer">
        {/* LINK-F5190: linkBankTransactionId is the real originating banking.bank_transactions id
            (already used functionally in categorizeBankTransaction below) -- was never rendered. */}
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
        <label className="block text-xs font-semibold text-gray-700">
          Credit card vendor
          <div className="mt-1 font-normal">
            <ReferenceSelect
              value={ccVendorId}
              onChange={setCcVendorId}
              options={vendorOptions}
              createKind="vendor"
              operatingCompanyId={operatingCompanyId}
              placeholder="Search vendor…"
              onSearch={setVendorSearch}
              loading={vendorsQuery.isFetching}
              disabled={!operatingCompanyId}
            />
            <CappedListNotice
              shown={vendorOptions.length}
              limit={200}
              hint="Vendor search returns at most 200 matches — refine your search if the card vendor is missing."
              className="mt-1 text-[11px] text-slate-600"
            />
          </div>
        </label>
        <label className="block text-xs font-semibold text-gray-700">
          Card liability account (COA)
          <div className="mt-1 font-normal">
            <ReferenceSelect
              value={liabilityAccountId}
              onChange={setLiabilityAccountId}
              options={liabilityOptions}
              createKind="account"
              addNewLabel="+ Add new account"
              operatingCompanyId={operatingCompanyId}
              placeholder="Select liability account…"
              disabled={!operatingCompanyId}
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
            <DatePicker className="mt-1 h-9 w-full" value={paymentDate} onChange={setPaymentDate} />
          </label>
          <label className="block">
            Amount (USD)
            <MoneyInput valueDollars={amount} onChangeDollars={setAmount} className="mt-1 w-full" ariaLabel="Amount (USD)" />
          </label>
        </div>
        <label className="block">
          Statement period (optional)
          <input className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2" value={statementPeriod} onChange={(e) => setStatementPeriod(e.target.value)} placeholder="e.g. 2026-04" />
        </label>
        <label className="block">
          Memo (optional)
          <input className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
      </div>
    </ParityDrawer>
  );
}
