import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPayment, listCoaRoles, listInvoices, type Invoice, type PaymentMethod } from "../../api/accounting";
import { getAllAccounts, getCoaAccounts } from "../../api/banking";
import { listCustomers } from "../../api/mdata";
import { Button } from "../../components/Button";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { UploadZone } from "../../components/UploadZone";
import { ReferenceSelect, type ReferenceOption } from "../../components/parity/ReferenceSelect";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { companyToday } from "../../lib/businessDate";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { formatBankAccountPickerLabel } from "../banking/transferAccountPicker";
import { entityLabel } from "../../lib/entity-label";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onRecorded: (paymentId: string) => void;
  prefillCustomerId?: string;
  // ACCT-F5791: the customer combobox below only knows about ACTIVE customers (listCustomers has
  // no status filter). When an invoice's customer has since been deactivated, prefillCustomerId
  // still carries the correct id (Apply-to-invoices/Amount resolve fine), but the combobox has no
  // matching option and silently renders blank — a same-company-scoped display name here lets a
  // synthetic option be injected so the field shows who is actually selected. Never used to
  // override the active-customer options list itself.
  prefillCustomerName?: string | null;
  prefillAmountCents?: number;
  prefillInvoiceId?: string;
};

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "ach", label: "ACH" },
  { value: "wire", label: "Wire" },
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "factoring_advance", label: "Factoring Advance" },
  { value: "factoring_reserve", label: "Factoring Reserve" },
  { value: "credit_card", label: "Credit Card" },
  { value: "other", label: "Other" },
];

const DEPOSIT_COA_TYPES = new Set(["Asset", "Bank", "Other Current Asset", "Other Current Assets", "Other Asset"]);

// M-1: amount stays a DOLLAR number → *_cents = round(amount*100) unchanged (byte-for-byte).
function dollarsToCents(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

function centsToDollars(value: number): number | null {
  const v = Math.max(0, Number(value || 0));
  return v > 0 ? v / 100 : null;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

/** Build deposit options as catalogs.accounts UUIDs (posting engine debit). Never a free-text bank slug. */
export function buildReceivePaymentDepositOptions(input: {
  bankAccounts: Array<Record<string, unknown>>;
  coaAccounts: Array<{ id: string; account_number?: string | null; account_name: string; account_type?: string }>;
  undepositedFundsAccountId: string | null;
}): ReferenceOption[] {
  const options: ReferenceOption[] = [];
  const seen = new Set<string>();

  const push = (value: string, label: string, type?: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    options.push({ value, label, type });
  };

  if (input.undepositedFundsAccountId) {
    const uf = input.coaAccounts.find((a) => a.id === input.undepositedFundsAccountId);
    push(
      input.undepositedFundsAccountId,
      uf ? uf.account_name : "Undeposited Funds",
      "Undeposited Funds"
    );
  }

  for (const row of input.bankAccounts) {
    const ledger = row.ledger_account_id != null ? String(row.ledger_account_id) : "";
    if (!ledger) continue;
    push(
      ledger,
      formatBankAccountPickerLabel({
        id: String(row.id ?? ""),
        display_name: (row.display_name as string | null | undefined) ?? null,
        account_name: (row.account_name as string | null | undefined) ?? null,
        institution_name: (row.institution_name as string | null | undefined) ?? null,
        account_mask: (row.account_mask as string | null | undefined) ?? null,
        ledger_account_id: ledger,
      }),
      "Bank"
    );
  }

  for (const account of input.coaAccounts) {
    const type = String(account.account_type ?? "");
    if (!DEPOSIT_COA_TYPES.has(type)) continue;
    push(account.id, account.account_name, type || "Asset");
  }

  return options;
}

export function RecordPaymentModal({
  open,
  operatingCompanyId,
  onClose,
  onRecorded,
  prefillCustomerId,
  prefillCustomerName,
  prefillAmountCents,
  prefillInvoiceId,
}: Props) {
  const [customerId, setCustomerId] = useState<string | null>(prefillCustomerId ?? null);
  const [paymentDate, setPaymentDate] = useState(companyToday());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("ach");
  const [reference, setReference] = useState("");
  const [amountDollars, setAmountDollars] = useState<number | null>(centsToDollars(prefillAmountCents ?? 0));
  const [depositedToAccountId, setDepositedToAccountId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [applyByInvoice, setApplyByInvoice] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draftAttachmentEntityId, setDraftAttachmentEntityId] = useState(() => crypto.randomUUID());
  const [extraDepositOptions, setExtraDepositOptions] = useState<ReferenceOption[]>([]);

  const customersQuery = useQuery({
    queryKey: ["record-payment", "customers", operatingCompanyId],
    // SAF-B29: was limit 200. PROD HAS 2,693 CUSTOMERS, so this silently returned the first 200
    // alphabetically and dropped 92% of them — with no empty state, no warning, nothing to
    // indicate the list was cut. 5000 matches the convention already used by Customers.tsx,
    // CustomerDetail.tsx and NewCustomerDrawerForm. Server-side type-ahead remains B29's target
    // shape; this removes the live truncation now rather than leaving it until then.
    queryFn: () => listCustomers({ operating_company_id: operatingCompanyId, limit: 5000 }).then((res) => res.customers),
    enabled: open && Boolean(operatingCompanyId),
  });

  const depositCatalogQuery = useQuery({
    queryKey: ["record-payment", "deposit-catalog", operatingCompanyId],
    queryFn: async () => {
      const [banks, coa, roles] = await Promise.all([
        getAllAccounts(operatingCompanyId),
        getCoaAccounts(operatingCompanyId),
        listCoaRoles(operatingCompanyId),
      ]);
      const uf =
        roles.rows.find((r) => r.role === "undeposited_funds" && r.is_active && r.account_id)?.account_id ??
        roles.rows.find((r) => r.role === "cash_clearing" && r.is_active && r.account_id)?.account_id ??
        null;
      return {
        bankAccounts: banks.accounts ?? [],
        coaAccounts: coa.accounts ?? [],
        undepositedFundsAccountId: uf,
      };
    },
    enabled: open && Boolean(operatingCompanyId),
  });

  const openInvoicesQuery = useQuery({
    queryKey: ["record-payment", "open-invoices", operatingCompanyId, customerId],
    queryFn: async () => {
      if (!customerId) return [] as Invoice[];
      const [sent, partial] = await Promise.all([
        listInvoices(operatingCompanyId, { customer_id: customerId, status: "sent" }).then((res) => res.invoices ?? []),
        listInvoices(operatingCompanyId, { customer_id: customerId, status: "partial" }).then((res) => res.invoices ?? []),
      ]);
      const map = new Map<string, Invoice>();
      for (const row of [...sent, ...partial]) {
        if (Number(row.amount_open_cents ?? 0) <= 0) continue;
        map.set(row.id, row);
      }
      return Array.from(map.values());
    },
    enabled: open && Boolean(customerId),
  });

  const amountCents = dollarsToCents(amountDollars);
  const openInvoices = openInvoicesQuery.data ?? [];

  const depositOptions = useMemo(() => {
    const catalog = depositCatalogQuery.data;
    const base = catalog ? buildReceivePaymentDepositOptions(catalog) : [];
    const baseIds = new Set(base.map((o) => o.value));
    return [...base, ...extraDepositOptions.filter((opt) => !baseIds.has(opt.value))];
  }, [depositCatalogQuery.data, extraDepositOptions]);

  useEffect(() => {
    if (!open) return;
    setCustomerId(prefillCustomerId ?? null);
    setPaymentDate(companyToday());
    setPaymentMethod("ach");
    setReference("");
    setAmountDollars(centsToDollars(prefillAmountCents ?? 0));
    setDepositedToAccountId(null);
    setNotes("");
    setErrorMessage(null);
    setApplyByInvoice({});
    setDraftAttachmentEntityId(crypto.randomUUID());
    setExtraDepositOptions([]);
  }, [open, prefillAmountCents, prefillCustomerId]);

  useEffect(() => {
    if (!open || depositedToAccountId) return;
    const preferred = depositCatalogQuery.data?.undepositedFundsAccountId ?? depositOptions[0]?.value ?? null;
    if (preferred) setDepositedToAccountId(preferred);
  }, [open, depositedToAccountId, depositCatalogQuery.data, depositOptions]);

  useEffect(() => {
    if (!open || !prefillInvoiceId || !prefillAmountCents) return;
    setApplyByInvoice((current) => ({
      ...current,
      [prefillInvoiceId]: prefillAmountCents,
    }));
  }, [open, prefillInvoiceId, prefillAmountCents]);

  useEffect(() => {
    if (!open || !customerId || openInvoices.length === 0) return;
    if (Object.keys(applyByInvoice).length > 0) return;

    let remaining = amountCents;
    const next: Record<string, number> = {};
    for (const invoice of openInvoices) {
      if (remaining <= 0) break;
      const openAmount = Number(invoice.amount_open_cents ?? 0);
      const apply = Math.min(openAmount, remaining);
      if (apply > 0) {
        next[invoice.id] = apply;
        remaining -= apply;
      }
    }
    if (Object.keys(next).length > 0) setApplyByInvoice(next);
  }, [open, customerId, openInvoices, amountCents, applyByInvoice]);

  const totalApplied = useMemo(() => Object.values(applyByInvoice).reduce((sum, value) => sum + Number(value || 0), 0), [applyByInvoice]);
  const remaining = Math.max(0, amountCents - totalApplied);

  const customerOptions = useMemo(() => {
    const base = (customersQuery.data ?? []).map((row) => ({
      value: row.id,
      label: row.name,
      type: row.customer_code ?? undefined,
    }));
    // ACCT-F5791: prefillCustomerId can point at a deactivated customer, which the active-only
    // customersQuery above never returns. Without a matching option the combobox renders blank
    // even though customerId state is correct (see prefillCustomerName comment on Props). Inject
    // a synthetic option ONLY for that case — the active-customer list itself is never widened.
    if (prefillCustomerId && !base.some((opt) => opt.value === prefillCustomerId)) {
      base.unshift({ value: prefillCustomerId, label: prefillCustomerName ?? "Customer (inactive)", type: undefined });
    }
    return base;
  }, [customersQuery.data, prefillCustomerId, prefillCustomerName]);

  return (
    <ParityDrawer
      open={open}
      onClose={onClose}
      title="Receive Payment"
      size="wide"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="record-payment-form">
            Record Payment
          </Button>
        </div>
      }
    >
      <form
        id="record-payment-form"
        className="space-y-3"
        data-testid="record-payment-drawer"
        onSubmit={async (event) => {
          event.preventDefault();
          setErrorMessage(null);
          if (!customerId) {
            setErrorMessage("Customer is required.");
            return;
          }
          if (amountCents <= 0) {
            setErrorMessage("Amount must be greater than zero.");
            return;
          }
          if (!depositedToAccountId) {
            setErrorMessage("Deposited to account is required.");
            return;
          }
          if (totalApplied > amountCents) {
            setErrorMessage("Sum of apply amounts cannot exceed payment amount.");
            return;
          }

          const apply_to = Object.entries(applyByInvoice)
            .map(([invoice_id, cents]) => ({ invoice_id, amount_cents: Number(cents) }))
            .filter((row) => row.amount_cents > 0);

          try {
            const result = await createPayment(operatingCompanyId, {
              customer_id: customerId,
              payment_method: paymentMethod,
              payment_date: paymentDate,
              reference: reference || undefined,
              amount_cents: amountCents,
              deposited_to_account_id: depositedToAccountId,
              notes: notes || undefined,
              apply_to,
              // Option B: send the UploadZone draft id so the payment route re-keys the uploaded
              // check/ACH/wire confirmation onto the new payment id (otherwise it orphans).
              attachment_draft_id: draftAttachmentEntityId,
            });
            onRecorded(result.id);
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to record payment.");
          }
        }}
      >
        {errorMessage ? <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div> : null}

        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Customer</label>
            {customersQuery.isError ? (
              <ListErrorBanner
                message={`Failed to load customers: ${(customersQuery.error as Error)?.message ?? "Request failed"}`}
                onRetry={() => void customersQuery.refetch()}
              />
            ) : null}
            <ReferenceSelect
              value={customerId}
              onChange={setCustomerId}
              options={customerOptions}
              createKind="customer"
              operatingCompanyId={operatingCompanyId}
              placeholder="Select customer"
              disabled={!operatingCompanyId || customersQuery.isLoading}
            />
          </div>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Payment date
            <DatePicker value={paymentDate} onChange={setPaymentDate} className="h-9" />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Payment method
            <SelectCombobox value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]">
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </SelectCombobox>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Reference
            <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Check # / ACH ref" className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Amount (USD)
            {/* M-1: dollars-mode QBO money entry; amount stays a DOLLAR number → amount_cents byte-for-byte. */}
            <MoneyInput valueDollars={amountDollars} onChangeDollars={setAmountDollars} ariaLabel="Amount (USD)" />
          </label>

          <div className="space-y-1" data-testid="receive-payment-deposit-to">
            <label className="text-xs font-semibold text-gray-600">Deposited to</label>
            {depositCatalogQuery.isError ? (
              <ListErrorBanner
                message={`Failed to load deposit accounts: ${(depositCatalogQuery.error as Error)?.message ?? "Request failed"}`}
                onRetry={() => void depositCatalogQuery.refetch()}
              />
            ) : null}
            <ReferenceSelect
              value={depositedToAccountId}
              onChange={setDepositedToAccountId}
              options={depositOptions}
              createKind="account"
              addNewLabel="+ Add new account"
              operatingCompanyId={operatingCompanyId}
              placeholder="Select deposit account"
              disabled={!operatingCompanyId || depositCatalogQuery.isLoading}
              onOptionCreated={(opt) => {
                setExtraDepositOptions((prev) => [...prev, opt]);
                void depositCatalogQuery.refetch();
              }}
            />
          </div>

          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-2">
            Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]" />
          </label>
        </div>

        <div className="rounded-sm border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Apply to invoices</h3>
            <span className="text-xs text-gray-600">
              Applied {money(totalApplied)} / Remaining {money(remaining)}
            </span>
          </div>

          {!customerId ? <div className="text-xs text-gray-600">Select a customer to view open invoices.</div> : null}
          {customerId && openInvoicesQuery.isLoading ? <div className="text-xs text-gray-600">Loading open invoices...</div> : null}
          {customerId && openInvoicesQuery.isError ? (
            <ListErrorBanner
              message={`Failed to load open invoices: ${(openInvoicesQuery.error as Error)?.message ?? "Request failed"}`}
              onRetry={() => void openInvoicesQuery.refetch()}
            />
          ) : null}
          {customerId && !openInvoicesQuery.isLoading && !openInvoicesQuery.isError && openInvoices.length === 0 ? (
            <div className="text-xs text-gray-600">No open invoices for this customer.</div>
          ) : null}

          <div className="space-y-2">
            {openInvoices.map((invoice) => {
              const checked = applyByInvoice[invoice.id] !== undefined;
              const invoiceOpen = Number(invoice.amount_open_cents ?? 0);
              return (
                <div key={invoice.id} className="rounded-sm border border-gray-200 bg-white p-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm text-gray-800">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (!event.target.checked) {
                            setApplyByInvoice((current) => {
                              const copy = { ...current };
                              delete copy[invoice.id];
                              return copy;
                            });
                            return;
                          }
                          const defaultApply = Math.min(invoiceOpen, Math.max(0, amountCents - totalApplied));
                          setApplyByInvoice((current) => ({ ...current, [invoice.id]: Math.max(0, defaultApply) }));
                        }}
                      />
                      {entityLabel(invoice.display_id, invoice.id, "Invoice")} · Open {money(invoiceOpen)}
                    </label>
                    {checked ? (
                      // M-1: cents-mode QBO money entry; clamp to the invoice open balance unchanged.
                      <MoneyInput
                        valueCents={applyByInvoice[invoice.id] ?? 0}
                        onChangeCents={(cents) =>
                          setApplyByInvoice((current) => ({ ...current, [invoice.id]: Math.min(invoiceOpen, cents ?? 0) }))
                        }
                        ariaLabel={`Apply to ${invoice.display_id}`}
                        className="w-36"
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <UploadZone
          operatingCompanyId={operatingCompanyId}
          entityType="payment"
          entityId={draftAttachmentEntityId}
          defaultCategory={paymentMethod === "check" ? "check_image" : paymentMethod === "wire" ? "wire_confirmation" : "ach_confirmation"}
          title="Payment Proof / Backup"
        />
      </form>
    </ParityDrawer>
  );
}
