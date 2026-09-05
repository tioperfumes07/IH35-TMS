import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  BROKER_ADVANCE_CATEGORIES,
  createBrokerAdvance,
  createExpense,
  createVendorBill,
  listBills,
  listBrokerAdvances,
  listCoaRoles,
  listExpenses,
  type BrokerAdvanceCategory,
} from "../../api/accounting";
import { getAllAccounts } from "../../api/banking";
import { formatBankAccountPickerLabel } from "../../pages/banking/transferAccountPicker";
import { listCatalogAccounts } from "../../api/catalog-accounts";
import { apiRequest, generateIdempotencyKey } from "../../api/client";
import type { LoadDetail } from "../../api/loads";
import { listVendors } from "../../api/mdata";
import { companyToday } from "../../lib/businessDate";
import { userFacingApiError } from "../../lib/api-error-message";
import { Button } from "../Button";
import { DatePicker } from "../forms/DatePicker";
import { MoneyInput } from "../forms/MoneyInput";
import { useToast } from "../Toast";
import { EntityLink } from "../shared/EntityLink";
import { formatMoneyCents } from "./constants";

type CostChoice = "expense" | "bill" | "advance" | "fuel_advance" | null;
type Draft = {
  id: string;
  kind: CostChoice;
  date: string;
  vendorId: string;
  categoryId: string;
  paymentAccountId: string;
  invoiceNo: string;
  amount: string;
  error: string | null;
  /** SET-15 — broker advance received (SET-24's write path), never a driver liability, never a reduction of the invoice face. */
  advanceCategory: BrokerAdvanceCategory | "";
  instrumentType: string;
  instrumentReference: string;
};
type DriverBillRow = { gross_amount_cents: number; status: string };

const ADVANCE_CATEGORY_LABEL: Record<BrokerAdvanceCategory, string> = {
  diesel: "Diesel",
  driver_pay: "Driver pay",
  repair: "Repair",
  other: "Other",
};

function blankDraft(kind: CostChoice = null): Draft {
  return {
    id: crypto.randomUUID(),
    kind,
    date: companyToday(),
    vendorId: "",
    categoryId: "",
    paymentAccountId: "",
    invoiceNo: "",
    amount: "",
    error: null,
    advanceCategory: "",
    instrumentType: "",
    instrumentReference: "",
  };
}

export function LoadDetailCostsTab({ load, canEdit, canEditReason }: { load: LoadDetail; canEdit: boolean; canEditReason?: string }) {
  const [drafts, setDrafts] = useState<Draft[]>([blankDraft()]);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const opco = load.operating_company_id;
  const expenses = useQuery({ queryKey: ["load-costs", "expenses", opco, load.id], queryFn: () => listExpenses(opco, { load_id: load.id, limit: 200 }) });
  const bills = useQuery({ queryKey: ["load-costs", "bills", opco, load.id], queryFn: () => listBills(opco, { load_id: load.id, limit: 200 }) });
  const driverBills = useQuery({ queryKey: ["load-costs", "driver-bills", opco, load.id], queryFn: () => apiRequest<{ driver_bills: DriverBillRow[] }>(`/api/v1/driver-finance/driver-bills?load_id=${encodeURIComponent(load.id)}&operating_company_id=${encodeURIComponent(opco)}`) });
  const vendors = useQuery({ queryKey: ["load-costs", "vendors", opco], queryFn: () => listVendors({ operating_company_id: opco, status: "active", limit: 5000 }) });
  const accounts = useQuery({ queryKey: ["load-costs", "accounts", opco], queryFn: () => listCatalogAccounts({ operating_company_id: opco, status: "active", postable_only: true }) });
  const advances = useQuery({ queryKey: ["load-costs", "advances", opco, load.id], queryFn: () => listBrokerAdvances(opco, { load_id: load.id }) });
  // ACCT-F25053 (owner ruling 2026-09-04: "bind by role, never by name") -- the fuel-advance debit
  // account is resolved from accounting.chart_of_accounts_roles, never picked by a /fuel/i name match
  // (which could resolve to an ASSET receivable like "1250 Driver Fuel-Overage Receivable" instead of
  // the real expense account -- exactly the outcome the owner ruled must never happen).
  const coaRoles = useQuery({ queryKey: ["load-costs", "coa-roles", opco], queryFn: () => listCoaRoles(opco) });
  // LOAD-COSTS-COMPLETE items (1)/(5) (owner correction 2026-09-04): a broker advance receipt only
  // gets a real JE (DR bank / CR AR-or-deposit-liability) when the caller says which of OUR real
  // banking.bank_accounts the cash landed in -- required for diesel/repair/other (cash always
  // lands in our bank for those); optional for driver_pay (the broker may have paid the driver
  // directly, our bank never holding it). Reuses banking.ts's own getAllAccounts, the same source
  // every other bank-account picker in this app reads (RecordPaymentModal, CreateAdvanceModal).
  const bankAccountsQuery = useQuery({ queryKey: ["load-costs", "bank-accounts", opco], queryFn: () => getAllAccounts(opco) });
  const advanceBankAccountRows = (bankAccountsQuery.data?.accounts ?? []) as Array<{ id: string; display_name?: string | null; account_name?: string | null; institution_name?: string | null; account_mask?: string | null }>;
  const savedExpenses = expenses.data?.rows ?? [];
  const savedBills = bills.data?.rows ?? [];
  const savedAdvances = (advances.data?.rows ?? []).filter((row) => !row.voided_at);
  const savedAdvanceCents = savedAdvances.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  const savedCount = savedExpenses.length + savedBills.length;
  const currency = load.currency_code === "MXN" ? "MXN" : "USD";
  const savedCosts = savedExpenses.filter((row) => row.status !== "void").reduce((sum, row) => sum + Number(row.total_amount_cents || 0), 0) + savedBills.filter((row) => row.status !== "voided").reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  const driverPay = (driverBills.data?.driver_bills ?? []).filter((row) => row.status !== "void").reduce((sum, row) => sum + Number(row.gross_amount_cents || 0), 0);
  const revenue = Number(load.rate_total_cents ?? 0);
  const chart = accounts.data?.accounts ?? [];
  // ACCT-F25053 -- account_type is the QBO enum spelling exactly ("CostOfGoodsSold", no spaces);
  // the prior free-text regex (matching a spaced-out "cost of goods" phrase) never matched it,
  // silently excluding every COGS account
  // (10 of USMCA's 34 real cost accounts, including 5000 Fuel & Diesel) from the Category dropdown.
  const categories = chart.filter((row) => row.account_type === "Expense" || row.account_type === "OtherExpense" || row.account_type === "CostOfGoodsSold");
  // QBO/CoA account_type is literally "Bank" for a bank account, never "Asset" -- /asset/i alone
  // silently dropped every real bank account from "Paid with", leaving only cards/other-current-asset
  // rows. Match the same asset-type vocabulary used elsewhere in this app (account-picker-scope.ts).
  const paymentAccounts = chart.filter((row) => /asset|bank|credit ?card/i.test(row.account_type));
  // LOAD-COSTS-COMPLETE item (1) -- a fuel advance is cash the company hands a driver on the road to
  // buy fuel. Drivers here are B1 company drivers, never owner-operators, so this is a straight
  // company expense (DR fuel expense / CR bank) -- never a receivable, never a settlement deduction,
  // never a driver_finance.* write. ACCT-F25053 -- the debit account is resolved by ROLE
  // (company_fuel_advance_expense), never by a /fuel/i name match, which could silently resolve to an
  // ASSET receivable ("1250 Driver Fuel-Overage Receivable") on a chart where that sorts first.
  // Missing/unbound role -> fuelAccount is undefined -> the existing "No Fuel expense account found"
  // disabled state fires and names the gap, exactly the fail-closed behavior the owner asked for.
  const fuelRoleRow = (coaRoles.data?.rows ?? []).find((row) => row.role === "company_fuel_advance_expense" && row.is_active && row.account_id);
  const fuelAccount = fuelRoleRow ? chart.find((row) => row.id === fuelRoleRow.account_id) : undefined;
  const bankAccounts = paymentAccounts.filter((row) => /bank/i.test(row.account_type) || /bank/i.test(row.account_name));
  const fuelAdvancePaymentAccounts = bankAccounts.length ? bankAccounts : paymentAccounts;
  const draftTotal = drafts.reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.amount || 0) * 100)), 0);
  const displayNumber = (index: number) => savedCount + index === 0 ? load.load_number : `${load.load_number}-${savedCount + index}`;
  const update = (id: string, patch: Partial<Draft>) => setDrafts((rows) => rows.map((row) => row.id === id ? { ...row, ...patch, error: null } : row));

  const save = useMutation({
    mutationFn: async () => {
      const errors = new Map<string, string>();
      for (const [index, row] of drafts.entries()) {
        const amountCents = Math.round(Number(row.amount) * 100);
        const missing = !row.kind
          ? "Choose Expense, Bill, Fuel advance, or Advance received."
          : row.kind === "advance"
            ? !row.advanceCategory
              ? "Advance category is required."
              : !row.instrumentType.trim()
                ? "Instrument type is required."
                : !row.instrumentReference.trim()
                  ? "Instrument reference is required."
                  // LOAD-COSTS-COMPLETE items (1)/(5) -- required for diesel/repair/other (cash
                  // always lands in our bank for those); optional only for driver_pay (the broker
                  // may have paid the driver directly).
                  : row.advanceCategory !== "driver_pay" && !row.paymentAccountId
                    ? "Bank account is required for this category — cash always lands in our bank for diesel/repair/other."
                    : !(amountCents > 0)
                      ? "Amount must be greater than zero."
                      : null
            : row.kind === "fuel_advance"
              ? !load.assigned_primary_driver_id
                ? "Assign a driver to this load before recording a fuel advance."
                : !fuelAccount
                  ? "No Fuel expense account found in this entity's chart of accounts — add one before recording a fuel advance."
                  : !row.paymentAccountId
                    ? "Bank account is required."
                    : !(amountCents > 0)
                      ? "Amount must be greater than zero."
                      : null
              : !row.vendorId
                ? "Vendor is required."
                : !row.categoryId
                  ? "Category is required."
                  : !(amountCents > 0)
                    ? "Amount must be greater than zero."
                    : row.kind === "expense" && !row.paymentAccountId
                      ? "Paid with is required."
                      : row.kind === "bill" && !row.invoiceNo.trim()
                        ? "Vendor invoice number is required."
                        : null;
        if (missing) { errors.set(row.id, missing); continue; }
        try {
          if (row.kind === "expense") {
            await createExpense(opco, { category_account_id: row.categoryId, expense_date: row.date, amount_cents: amountCents, payment_account_uuid: row.paymentAccountId, vendor_uuid: row.vendorId, load_id: load.id, expense_number: displayNumber(index), memo: `Load cost · ${load.load_number}`, is_sample_data: false });
          } else if (row.kind === "bill") {
            await createVendorBill(opco, { vendor_id: row.vendorId, bill_number: row.invoiceNo.trim(), display_id: displayNumber(index), bill_date: row.date, amount_cents: amountCents, coa_account_id: row.categoryId, driver_id: load.assigned_primary_driver_id ?? undefined, memo: `Load cost · ${load.load_number}`, is_sample_data: false, lines: [{ account_id: row.categoryId, amount_cents: amountCents, description: `Load cost · ${load.load_number}`, section: "A", load_id: load.id }] }, { idempotencyKey: generateIdempotencyKey() });
          } else if (row.kind === "fuel_advance") {
            // Company expense, never a driver liability: DR fuel expense / CR bank, through the same
            // createExpense write path as any other paid-now cost — driver_id is set so the line
            // shows whose fuel this was, but nothing here writes driver_finance.* or a receivable.
            await createExpense(opco, { category_account_id: fuelAccount!.id, expense_date: row.date, amount_cents: amountCents, payment_account_uuid: row.paymentAccountId, driver_id: load.assigned_primary_driver_id!, load_id: load.id, expense_number: displayNumber(index), memo: `Fuel advance · Load ${load.load_number}`, is_sample_data: false });
          } else {
            await createBrokerAdvance(opco, { load_id: load.id, customer_id: load.customer_id, category: row.advanceCategory as BrokerAdvanceCategory, instrument_type: row.instrumentType.trim(), instrument_reference: row.instrumentReference.trim(), amount_cents: amountCents, received_at: row.date, bank_account_id: row.paymentAccountId || null });
          }
        } catch (error) { errors.set(row.id, userFacingApiError(error, "Could not save this cost.")); }
      }
      if (errors.size) { setDrafts((rows) => rows.map((row) => errors.has(row.id) ? { ...row, error: errors.get(row.id)! } : row)); throw new Error(`${errors.size} cost row${errors.size === 1 ? "" : "s"} need attention.`); }
    },
    onSuccess: async () => { pushToast("Load costs saved", "success"); setDrafts([blankDraft()]); await queryClient.invalidateQueries({ queryKey: ["load-costs"] }); },
    onError: (error) => pushToast(userFacingApiError(error, "Could not save load costs."), "error"),
  });

  return <div className="space-y-4" data-testid="load-costs-tab-shell">
    <section className="rounded-sm border border-gray-200 bg-white p-3 text-xs"><span className="font-semibold uppercase text-gray-500">Load </span><EntityLink kind="load" id={load.id} label={load.load_number} /> · {load.customer_name ?? "Customer not visible"} · {load.assigned_primary_driver_name ?? "Driver not assigned"}</section>
    {canEdit ? <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-gray-600">Every cost is born attached to this load. You never type the number.</p><div className="flex flex-wrap gap-2"><Button data-testid="load-costs-save-all" type="button" size="sm" variant="secondary" disabled={save.isPending} onClick={() => save.mutate()}>Save all</Button><Button data-testid="load-costs-add-top" type="button" size="sm" onClick={() => setDrafts((rows) => [...rows, blankDraft()])}>+ Add another cost</Button><Button data-testid="load-costs-add-fuel-advance-top" type="button" size="sm" onClick={() => setDrafts((rows) => [...rows, blankDraft("fuel_advance")])}>+ Fuel advance</Button></div></div>
      {drafts.map((row, index) => <article key={row.id} data-testid="load-costs-entry" className="overflow-hidden rounded-sm border border-gray-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2"><span className="font-mono text-xs font-semibold">{displayNumber(index)}</span><div className="flex overflow-hidden rounded-sm border border-gray-200"><button data-testid="load-cost-toggle-expense" type="button" className={`px-3 py-1 text-xs font-semibold ${row.kind === "expense" ? "bg-slate-700 text-white" : "bg-white text-gray-600"}`} onClick={() => update(row.id, { kind: "expense" })}>Expense · paid now</button><button data-testid="load-cost-toggle-bill" type="button" className={`px-3 py-1 text-xs font-semibold ${row.kind === "bill" ? "bg-slate-700 text-white" : "bg-white text-gray-600"}`} onClick={() => update(row.id, { kind: "bill" })}>Bill · owed</button><button data-testid="load-cost-toggle-fuel-advance" type="button" className={`px-3 py-1 text-xs font-semibold ${row.kind === "fuel_advance" ? "bg-slate-700 text-white" : "bg-white text-gray-600"}`} onClick={() => update(row.id, { kind: "fuel_advance" })}>Fuel advance</button><button data-testid="load-cost-toggle-advance" type="button" className={`px-3 py-1 text-xs font-semibold ${row.kind === "advance" ? "bg-slate-700 text-white" : "bg-white text-gray-600"}`} onClick={() => update(row.id, { kind: "advance" })}>Advance received</button></div><span data-testid="load-cost-status" className="text-xs text-gray-500">new — not saved</span></header>
        {/* LOAD-COSTS-COMPLETE item (2b) (owner order 2026-09-04, live-observed truncation) -- md:
           * columns key off VIEWPORT width, but this form lives inside a drawer FIXED at 600px
           * (LoadDetailDrawer.tsx) regardless of viewport -- so "wide viewport" and "wide container"
           * are different things here, and 5 md:-columns squeezed a 600px panel down to illegible
           * slivers ("Select vendor", "Select categ…", "09/04/20" all truncated live). Two columns,
           * unconditional on viewport, actually fits this container at every screen size. */}
        {row.kind === "advance" ? <div className="grid grid-cols-2 gap-3 p-3">
          <Field label="Date"><DatePicker data-testid="load-cost-field-date" className="mt-1 h-8 w-full" value={row.date} onChange={(value) => update(row.id, { date: value })} /></Field>
          <Field label="Category"><select data-testid="load-cost-field-advance-category" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={row.advanceCategory} onChange={(e) => update(row.id, { advanceCategory: e.target.value as BrokerAdvanceCategory | "" })}><option value="">Select category</option>{BROKER_ADVANCE_CATEGORIES.map((c) => <option key={c} value={c}>{ADVANCE_CATEGORY_LABEL[c]}</option>)}</select></Field>
          <Field label="Instrument type"><input data-testid="load-cost-field-instrument-type" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="Comchek / EFT / wire" value={row.instrumentType} onChange={(e) => update(row.id, { instrumentType: e.target.value })} /></Field>
          <Field label="Instrument reference"><input data-testid="load-cost-field-instrument-reference" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="check / transaction no." value={row.instrumentReference} onChange={(e) => update(row.id, { instrumentReference: e.target.value })} /></Field>
          {/* LOAD-COSTS-COMPLETE items (1)/(5) -- required for diesel/repair/other (cash always lands
             * in our bank for those, so this posts a real DR bank / CR AR-or-deposit-liability JE);
             * optional for driver_pay (the broker may have paid the driver directly, skipping our
             * bank entirely -- item (2)'s disbursement, if this row is later disbursed, is that
             * row's only ledger entry). */}
          <Field label={row.advanceCategory === "driver_pay" ? "Deposited into (bank) — optional" : "Deposited into (bank)"}><select data-testid="load-cost-field-advance-bank" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={row.paymentAccountId} onChange={(e) => update(row.id, { paymentAccountId: e.target.value })}><option value="">{row.advanceCategory === "driver_pay" ? "No bank -- broker paid the driver directly" : "Select bank account"}</option>{advanceBankAccountRows.map((a) => <option key={a.id} value={a.id}>{formatBankAccountPickerLabel(a)}</option>)}</select></Field>
          <Field label="Amount"><div data-testid="load-cost-field-amount"><MoneyInput className="mt-1 h-8 w-full" valueCents={row.amount ? Math.round(Number(row.amount) * 100) : null} onChangeCents={(cents) => update(row.id, { amount: cents == null ? "" : String(cents / 100) })} /></div></Field>
        </div> : row.kind === "fuel_advance" ? <div className="grid grid-cols-2 gap-3 p-3">
          <Field label="Date"><DatePicker data-testid="load-cost-field-date" className="mt-1 h-8 w-full" value={row.date} onChange={(value) => update(row.id, { date: value })} /></Field>
          <Field label="Category"><div data-testid="load-cost-field-fuel-category" className="mt-1 flex h-8 w-full items-center rounded-sm border border-gray-200 bg-gray-50 px-2 text-xs text-gray-600">{fuelAccount ? `${fuelAccount.account_number ? `${fuelAccount.account_number} · ` : ""}${fuelAccount.account_name} (auto)` : "No Fuel expense account found"}</div></Field>
          <Field label="Paid from (bank)"><select data-testid="load-cost-field-fuel-bank" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={row.paymentAccountId} onChange={(e) => update(row.id, { paymentAccountId: e.target.value })}><option value="">Select bank account</option>{fuelAdvancePaymentAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_number ? `${a.account_number} · ` : ""}{a.account_name}</option>)}</select></Field>
          <Field label="Amount"><div data-testid="load-cost-field-amount"><MoneyInput className="mt-1 h-8 w-full" valueCents={row.amount ? Math.round(Number(row.amount) * 100) : null} onChangeCents={(cents) => update(row.id, { amount: cents == null ? "" : String(cents / 100) })} /></div></Field>
        </div> : <div className="grid grid-cols-2 gap-3 p-3">
          <Field label="Date"><DatePicker data-testid="load-cost-field-date" className="mt-1 h-8 w-full" value={row.date} onChange={(value) => update(row.id, { date: value })} /></Field>
          <Field label="Vendor"><select data-testid="load-cost-field-vendor" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={row.vendorId} onChange={(e) => update(row.id, { vendorId: e.target.value })}><option value="">Select vendor</option>{(vendors.data?.vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
          <Field label="Category"><select data-testid="load-cost-field-category" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={row.categoryId} onChange={(e) => update(row.id, { categoryId: e.target.value })}><option value="">Select category</option>{categories.map((a) => <option key={a.id} value={a.id}>{a.account_number ? `${a.account_number} · ` : ""}{a.account_name}</option>)}</select></Field>
          {row.kind === "bill" ? <Field label="Vendor invoice no."><input data-testid="load-cost-field-vendor-invoice" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="off the paper" value={row.invoiceNo} onChange={(e) => update(row.id, { invoiceNo: e.target.value })} /></Field> : <Field label="Paid with"><select data-testid="load-cost-field-paid-with" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={row.paymentAccountId} onChange={(e) => update(row.id, { paymentAccountId: e.target.value })}><option value="">Select bank or card</option>{paymentAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_number ? `${a.account_number} · ` : ""}{a.account_name}</option>)}</select></Field>}
          <Field label="Amount"><div data-testid="load-cost-field-amount"><MoneyInput className="mt-1 h-8 w-full" valueCents={row.amount ? Math.round(Number(row.amount) * 100) : null} onChangeCents={(cents) => update(row.id, { amount: cents == null ? "" : String(cents / 100) })} /></div></Field>
        </div>}
        <p data-testid="load-cost-hint" className={`px-3 pb-3 text-xs ${row.error ? "text-red-700" : "text-gray-500"}`}>{row.error ?? (row.kind === "advance" ? "Advance received is a partial payment against this load's invoice — never a driver liability, never a reduction of the invoice amount. It nets against the invoice once one exists." : row.kind === "fuel_advance" ? "Fuel advance is cash the company gives the driver for fuel — a company expense, DR Fuel Expense / CR bank. Never a receivable, never a settlement deduction, never a driver liability." : row.kind === "bill" ? "Bill · owed credits Accounts Payable. The vendor invoice number is never filled in for you, because it stops us paying the same bill twice." : row.kind === "expense" ? "Expense · paid now debits the selected category and credits the selected bank or card." : "Choose whether this cost was paid now, is owed, a fuel advance, or a broker advance received.")}</p>
      </article>)}
      <div className="flex flex-wrap gap-2"><Button data-testid="load-costs-add-bottom" type="button" size="sm" onClick={() => setDrafts((rows) => [...rows, blankDraft()])}>+ Add another cost</Button><Button data-testid="load-costs-add-fuel-advance-bottom" type="button" size="sm" onClick={() => setDrafts((rows) => [...rows, blankDraft("fuel_advance")])}>+ Fuel advance</Button><Link data-testid="load-costs-receipt-photo" className="inline-flex h-8 items-center rounded-sm border border-slate-700 px-3 text-xs font-semibold text-slate-700" to={`/accounting/receipts?load_id=${encodeURIComponent(load.id)}`}>+ From a receipt photo</Link></div>
    </section> : <section data-testid="load-costs-readonly-reason" className="rounded-sm border border-slate-300 bg-slate-100 p-3 text-xs text-slate-700">{canEditReason ?? "You don't have permission to add costs to this load right now."}</section>}
    <section data-testid="load-costs-totals" className="overflow-hidden rounded-sm border border-gray-200 bg-gray-50 text-xs"><Total label="Line haul revenue" value={formatMoneyCents(revenue, currency)} /><Total label={`Costs on this load · ${savedCount} saved`} value={formatMoneyCents(savedCosts + draftTotal, currency)} /><Total label="Driver pay" value={formatMoneyCents(driverPay, currency)} />{savedAdvances.length ? <Total label={`Broker advance received · ${savedAdvances.length} saved`} value={formatMoneyCents(savedAdvanceCents, currency)} /> : null}<Total label={`Approximate margin on ${load.load_number}`} value={formatMoneyCents(revenue - savedCosts - driverPay - draftTotal, currency)} strong /></section>
    <section data-testid="load-costs-bank-panel" className="rounded-sm border border-gray-200 bg-white"><h3 className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase text-gray-600">WHAT THE BANK WILL DO WITH THESE</h3><p className="px-3 py-3 text-xs text-gray-600">Paid expenses are offered for bank matching: saved · matched or saved · waiting for the bank. Bills match when their payment lands. Advances received net against this load's invoice once one exists — they never touch the bank feed as a cost.</p></section>
    {savedCount || savedAdvances.length ? <section className="rounded-sm border border-gray-200 bg-white p-3 text-xs text-gray-600">
      <h3 className="mb-2 font-semibold uppercase">Saved costs</h3>
      {savedExpenses.map((row) => <div key={row.id} className="flex justify-between border-b border-gray-100 py-2" data-cost-driver-column="driver_uuid"><EntityLink kind="expense" id={row.id} label={row.expense_number ?? "Expense"} /><span>{formatMoneyCents(Number(row.total_amount_cents), currency)} · {row.matched_bank_transaction_id ? "saved · matched to bank" : "saved · waiting for the bank"}</span></div>)}
      {savedBills.map((row) => <div key={row.id} className="flex justify-between border-b border-gray-100 py-2" data-cost-driver-column="driver_id"><EntityLink kind="bill" id={row.id} label={row.bill_number ?? "Bill"} /><span>{formatMoneyCents(Number(row.amount_cents), currency)} · saved</span></div>)}
      {savedAdvances.map((row) => <div key={row.id} data-testid="load-cost-saved-advance" className="flex justify-between border-b border-gray-100 py-2"><span>Advance · {ADVANCE_CATEGORY_LABEL[row.category]} · {row.instrument_type} {row.instrument_reference}</span><span>{formatMoneyCents(Number(row.amount_cents), currency)} · {row.applied_to_invoice_id ? "applied to invoice" : "saved · unapplied"}</span></div>)}
      <Link className="mt-2 inline-block font-semibold underline" to={`/accounting/expenses?load_id=${encodeURIComponent(load.id)}`}>Open saved costs</Link>
    </section> : <div className="rounded-sm border border-gray-200 bg-white p-4 text-center text-xs text-gray-500">No costs on this load yet.</div>}
    <p className="text-xs text-gray-500">Approximate · before settlement</p>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-xs font-semibold uppercase text-gray-500">{label}{children}</label>; }
function Total({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`flex justify-between border-b border-gray-200 px-3 py-2 last:border-b-0 ${strong ? "bg-slate-100 font-semibold text-slate-700" : ""}`}><span>{label}</span><span>{value}</span></div>; }
