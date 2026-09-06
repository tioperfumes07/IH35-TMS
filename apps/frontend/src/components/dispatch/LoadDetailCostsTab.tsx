import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { DatePicker } from "../forms/DatePicker";
import { MoneyInput } from "../forms/MoneyInput";
import { useToast } from "../Toast";
import { EntityLink } from "../shared/EntityLink";
import { EntityDocumentUpload } from "../documents/EntityDocumentUpload";
import { formatMoneyCents } from "./constants";

// LDT-1 (register CURSOR-LOAD-DETAIL-TABS-BUILD-2026-09-05.md § LDT-1, deadline 04:00Z) + LIVE render
// LOAD-DETAIL-TABS-RENDERS-LIVE-13526-2026-09-05.html. The Costs tab is a stacked register of entry
// CARDS (not the old 12-column spreadsheet): number is an auto label (never typed), an Expense·paid now /
// Bill·owed toggle, Date · Vendor · Category · Paid-with (bank/card/fuel-card ONLY) OR Vendor doc no.
// on a bill · Amount · Receipt on every card; a plain-English posting hint; a margin footer; and a
// "What the bank will do with these" section. Pre-Settlement + Settlement are the load's own top-level
// drawer tabs (LDT-5/6) — never sub-tabs here.

type CostChoice = "expense" | "bill" | "advance" | "fuel_advance";

type Draft = {
  id: string;
  kind: CostChoice;
  date: string;
  vendorId: string;
  vendorName: string;
  categoryId: string;
  categoryName: string;
  paymentAccountId: string;
  invoiceNo: string;
  amount: string;
  error: string | null;
  advanceCategory: BrokerAdvanceCategory | "";
  instrumentType: string;
  instrumentReference: string;
};
type DriverBillRow = { gross_amount_cents: number; status: string };
type PopId = "receipt" | "bank" | "pay" | null;

const ADVANCE_CATEGORY_LABEL: Record<BrokerAdvanceCategory, string> = {
  diesel: "Diesel",
  driver_pay: "Driver pay",
  repair: "Repair",
  other: "Other",
};

function blankDraft(kind: CostChoice = "expense"): Draft {
  return {
    id: crypto.randomUUID(),
    kind,
    date: companyToday(),
    vendorId: "",
    vendorName: "",
    categoryId: "",
    categoryName: "",
    paymentAccountId: "",
    invoiceNo: "",
    amount: "",
    error: null,
    advanceCategory: "",
    instrumentType: "",
    instrumentReference: "",
  };
}

/** LDT-1 LIVE DEFECT fix — "Paid with" may list ONLY bank, credit-card and fuel-card accounts. The old
 *  filter matched /asset/ on account_type, which surfaced 1240 Freight Claims Receivable and 1296 Faro
 *  Factoring (both assets) plus driver-advance accounts. QBO account_type enums for the allowed roles are
 *  exactly "Bank" and "CreditCard"; a fuel-card is a CreditCard sub-account. Receivables (OtherCurrentAsset,
 *  AccountsReceivable) and factoring/advance accounts are excluded by construction. */
function isPaidWithAccount(accountType: string | null | undefined): boolean {
  const t = (accountType ?? "").replace(/\s+/g, "").toLowerCase();
  return t === "bank" || t === "creditcard";
}

export function LoadDetailCostsTab({ load, canEdit, canEditReason }: { load: LoadDetail; canEdit: boolean; canEditReason?: string }) {
  const [drafts, setDrafts] = useState<Draft[]>([blankDraft()]);
  const [pop, setPop] = useState<PopId>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const opco = load.operating_company_id;
  const expenses = useQuery({ queryKey: ["load-costs", "expenses", opco, load.id], queryFn: () => listExpenses(opco, { load_id: load.id, limit: 200 }) });
  const bills = useQuery({ queryKey: ["load-costs", "bills", opco, load.id], queryFn: () => listBills(opco, { load_id: load.id, limit: 200 }) });
  const driverBills = useQuery({ queryKey: ["load-costs", "driver-bills", opco, load.id], queryFn: () => apiRequest<{ driver_bills: DriverBillRow[] }>(`/api/v1/driver-finance/driver-bills?load_id=${encodeURIComponent(load.id)}&operating_company_id=${encodeURIComponent(opco)}`) });
  const vendors = useQuery({ queryKey: ["load-costs", "vendors", opco], queryFn: () => listVendors({ operating_company_id: opco, status: "active", limit: 5000 }) });
  const accounts = useQuery({ queryKey: ["load-costs", "accounts", opco], queryFn: () => listCatalogAccounts({ operating_company_id: opco, status: "active", postable_only: true }) });
  const advances = useQuery({ queryKey: ["load-costs", "advances", opco, load.id], queryFn: () => listBrokerAdvances(opco, { load_id: load.id }) });
  const coaRoles = useQuery({ queryKey: ["load-costs", "coa-roles", opco], queryFn: () => listCoaRoles(opco) });
  const bankAccountsQuery = useQuery({ queryKey: ["load-costs", "bank-accounts", opco], queryFn: () => getAllAccounts(opco) });
  const advanceBankAccountRows = (bankAccountsQuery.data?.accounts ?? []) as Array<{ id: string; display_name?: string | null; account_name?: string | null; institution_name?: string | null; account_mask?: string | null }>;
  const savedExpenses = expenses.data?.rows ?? [];
  const savedBills = bills.data?.rows ?? [];
  const savedAdvances = (advances.data?.rows ?? []).filter((row) => !row.voided_at);
  const savedCount = savedExpenses.length + savedBills.length;
  const currency = load.currency_code === "MXN" ? "MXN" : "USD";
  const savedCosts = savedExpenses.filter((row) => row.status !== "void").reduce((sum, row) => sum + Number(row.total_amount_cents || 0), 0) + savedBills.filter((row) => row.status !== "voided").reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  const driverPay = (driverBills.data?.driver_bills ?? []).filter((row) => row.status !== "void").reduce((sum, row) => sum + Number(row.gross_amount_cents || 0), 0);
  const revenue = Number(load.rate_total_cents ?? 0);
  const chart = accounts.data?.accounts ?? [];
  const categories = chart.filter((row) => row.account_type === "Expense" || row.account_type === "OtherExpense" || row.account_type === "CostOfGoodsSold");
  // LDT-1: bank/card/fuel-card ONLY (see isPaidWithAccount) — never receivables, factoring or advances.
  const paymentAccounts = chart.filter((row) => isPaidWithAccount(row.account_type));
  const fuelRoleRow = (coaRoles.data?.rows ?? []).find((row) => row.role === "company_fuel_advance_expense" && row.is_active && row.account_id);
  const fuelAccount = fuelRoleRow ? chart.find((row) => row.id === fuelRoleRow.account_id) : undefined;
  const operatingBankRoleRow = (coaRoles.data?.rows ?? []).find((row) => row.role === "operating_bank" && row.is_active && row.account_id);
  const operatingBankAccount = operatingBankRoleRow ? chart.find((row) => row.id === operatingBankRoleRow.account_id) : undefined;
  const draftTotal = drafts.reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.amount || 0) * 100)), 0);
  // Margin = revenue − costs − driver pay (footer identity; the guard asserts this exact formula).
  const margin = revenue - savedCosts - driverPay - draftTotal;
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : null;

  // The number is a LABEL, never typed: first cost = load number, then load#-1, load#-2… across saved +
  // preceding drafts (owner: "you never type the number").
  const autoNumber = (index: number) => {
    const seq = savedCount + index;
    return seq === 0 ? load.load_number : `${load.load_number}-${seq}`;
  };
  const update = (id: string, patch: Partial<Draft>) => setDrafts((rows) => rows.map((row) => row.id === id ? { ...row, ...patch, error: null } : row));
  const removeDraft = (id: string) => setDrafts((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  const addDraft = (kind: CostChoice = "expense") => setDrafts((rows) => [...rows, blankDraft(kind)]);

  useEffect(() => {
    if (!pop) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPop(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pop]);

  const save = useMutation({
    mutationFn: async () => {
      const errors = new Map<string, string>();
      for (const [index, row] of drafts.entries()) {
        const amountCents = Math.round(Number(row.amount) * 100);
        const number = autoNumber(index);
        const missing = row.kind === "advance"
          ? !row.advanceCategory
            ? "Advance category is required."
            : !row.instrumentType.trim()
              ? "Instrument type is required."
              : !row.instrumentReference.trim()
                ? "Instrument reference is required."
                : row.advanceCategory !== "driver_pay" && !row.paymentAccountId
                  ? "Bank account is required for this category — cash always lands in our bank for diesel/repair/other."
                  : !(amountCents > 0)
                    ? "Amount must be greater than zero."
                    : null
          : row.kind === "fuel_advance"
            ? !load.assigned_primary_driver_id
              ? "Assign a driver to this load before recording a fuel advance."
              : !fuelAccount
                ? "No Fuel expense account found — designate the company_fuel_advance_expense role on the CoaRoles page before recording a fuel advance."
                : !operatingBankAccount
                  ? "No operating bank account found — designate the operating_bank role on the CoaRoles page before recording a fuel advance."
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
            await createExpense(opco, { category_account_id: row.categoryId, expense_date: row.date, amount_cents: amountCents, payment_account_uuid: row.paymentAccountId, vendor_uuid: row.vendorId, load_id: load.id, expense_number: number, memo: `Load cost · ${load.load_number}`, is_sample_data: false });
          } else if (row.kind === "bill") {
            await createVendorBill(opco, { vendor_id: row.vendorId, bill_number: row.invoiceNo.trim(), display_id: number, bill_date: row.date, amount_cents: amountCents, coa_account_id: row.categoryId, driver_id: load.assigned_primary_driver_id ?? undefined, memo: `Load cost · ${load.load_number}`, is_sample_data: false, lines: [{ account_id: row.categoryId, amount_cents: amountCents, description: `Load cost · ${load.load_number}`, section: "A", load_id: load.id }] }, { idempotencyKey: generateIdempotencyKey() });
          } else if (row.kind === "fuel_advance") {
            await createExpense(opco, { category_account_id: fuelAccount!.id, expense_date: row.date, amount_cents: amountCents, payment_account_uuid: operatingBankAccount!.id, driver_id: load.assigned_primary_driver_id!, load_id: load.id, expense_number: number, memo: `Fuel advance · Load ${load.load_number}`, is_sample_data: false });
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

  return <div className="space-y-3" data-testid="load-costs-tab-shell">
    {/* Identity strip */}
    <section data-testid="load-costs-identity" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs">
      <span className="font-semibold uppercase text-gray-500">Load</span>
      <EntityLink kind="load" id={load.id} label={load.load_number} />
      <span className="text-gray-300">·</span><span>{load.customer_name ?? "Customer not visible"}</span>
      <span className="text-gray-300">·</span><span>{load.assigned_primary_driver_name ?? "Driver not assigned"}</span>
      {load.assigned_unit_number ? <><span className="text-gray-300">·</span><span>Unit {load.assigned_unit_number}</span></> : null}
    </section>

    {canEdit ? <>
      <div className="flex flex-wrap items-center justify-between gap-2" data-testid="load-costs-actions">
        <span className="text-xs text-gray-500">Every cost carries the load number. Add a card per cost, attach its receipt, then Save all.</span>
        <div className="flex flex-wrap items-center gap-2">
          <NewCostMenu onPick={(kind) => addDraft(kind)} receiptHref={`/accounting/receipts?load_id=${encodeURIComponent(load.id)}`} billsHref={`/accounting/bills?load_id=${encodeURIComponent(load.id)}`} />
          <ActionButton testId="load-costs-save-all" primary onClick={() => save.mutate()} disabled={save.isPending}>Save all</ActionButton>
        </div>
      </div>

      {/* Draft entry cards */}
      <div className="space-y-2" data-testid="load-costs-register">
        {drafts.map((row, index) => (
          <DraftCard
            key={row.id}
            row={row}
            number={autoNumber(index)}
            canRemove={drafts.length > 1}
            load={load}
            vendors={(vendors.data?.vendors ?? []).map((v) => ({ id: v.id, label: v.name }))}
            categories={categories.map((a) => ({ id: a.id, label: `${a.account_number ? `${a.account_number} · ` : ""}${a.account_name}` }))}
            paymentAccounts={paymentAccounts.map((a) => ({ id: a.id, label: `${a.account_number ? `${a.account_number} · ` : ""}${a.account_name}` }))}
            advanceBankAccountRows={advanceBankAccountRows}
            fuelAccountLabel={fuelAccount ? `${fuelAccount.account_number ? `${fuelAccount.account_number} · ` : ""}${fuelAccount.account_name} (auto)` : null}
            operatingBankLabel={operatingBankAccount ? `${operatingBankAccount.account_number ? `${operatingBankAccount.account_number} · ` : ""}${operatingBankAccount.account_name} (auto)` : null}
            onUpdate={(patch) => update(row.id, patch)}
            onRemove={() => removeDraft(row.id)}
            onOpenReceiptInfo={() => setPop("receipt")}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ActionButton testId="load-costs-add-another" onClick={() => addDraft("expense")}>+ Add another cost</ActionButton>
        <ActionButton testId="load-costs-add-from-receipt" onClick={() => setPop("receipt")}>+ Add from a receipt photo</ActionButton>
        <ActionButton testId="load-costs-add-fuel-advance" onClick={() => addDraft("fuel_advance")}>+ Fuel advance (company expense)</ActionButton>
      </div>
    </> : <section data-testid="load-costs-readonly-reason" className="rounded-sm border border-slate-300 bg-slate-100 p-3 text-xs text-slate-700">{canEditReason ?? "You don't have permission to add costs to this load right now."}</section>}

    {/* Saved cost cards — read-only; every one shows the full columns + its receipt + bank status.
        The linkage marker is literal per type: an expense reverse-links a driver by expense.driver_uuid,
        a bill by bill.driver_id — the honesty guard reads these exact attributes. */}
    <div className="space-y-2" data-testid="load-costs-saved">
      {savedExpenses.map((row) => (
        <div key={row.id} data-cost-driver-column="driver_uuid">
          <SavedCard
            entityType="expense"
            entityId={row.id}
            number={row.expense_number ?? "Expense"}
            typeLabel="Expense · paid now"
            amountCents={Number(row.total_amount_cents)}
            currency={currency}
            status={row.status === "void" ? "void" : row.matched_bank_transaction_id ? "paid · matched to bank" : "paid · waiting for the bank"}
            bankMatched={Boolean(row.matched_bank_transaction_id)}
            loadNumber={load.load_number}
            operatingCompanyId={opco}
          />
        </div>
      ))}
      {savedBills.map((row) => (
        <div key={row.id} data-cost-driver-column="driver_id">
          <SavedCard
            entityType="bill"
            entityId={row.id}
            number={row.bill_number ?? "Bill"}
            typeLabel="Bill · owed"
            amountCents={Number(row.amount_cents)}
            currency={currency}
            status={row.status === "voided" ? "void" : "owed — matches on the bill payment"}
            bankMatched={false}
            loadNumber={load.load_number}
            operatingCompanyId={opco}
          />
        </div>
      ))}
      {savedAdvances.map((row) => (
        <div key={row.id} data-testid="load-cost-saved-advance" className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs">
          <span className="font-semibold text-[#0F1219]">Advance · {ADVANCE_CATEGORY_LABEL[row.category]}</span>
          <span className="text-gray-400"> · {row.instrument_type} {row.instrument_reference}</span>
          <span className="float-right tabular-nums font-semibold">{formatMoneyCents(Number(row.amount_cents), currency)}</span>
        </div>
      ))}
      {!savedCount && !savedAdvances.length ? <p className="rounded-sm border border-gray-200 bg-white px-3 py-3 text-center text-xs text-gray-500">No costs on this load yet.</p> : null}
    </div>

    {/* Totals FIXED footer — stays stuck to the bottom when the cards scroll (owner: totals stay put). revenue − costs − driver pay = margin */}
    <div data-testid="load-costs-margin" className="sticky bottom-0 z-10 rounded-sm border border-gray-200 bg-white text-xs shadow-[0_-1px_0_0_#E5E7EB]">
      <table className="w-full">
        <tbody>
          <tr className="border-b border-gray-100"><td className="px-3 py-1.5 text-gray-600">Line haul revenue</td><td className="px-3 py-1.5 text-right tabular-nums">{formatMoneyCents(revenue, currency)}</td></tr>
          <tr className="border-b border-gray-100"><td className="px-3 py-1.5 text-gray-600">Costs on this load — {savedCount} {savedCount === 1 ? "entry" : "entries"}{draftTotal ? ` (+ ${formatMoneyCents(draftTotal, currency)} unsaved)` : ""}</td><td className="px-3 py-1.5 text-right tabular-nums">{formatMoneyCents(savedCosts + draftTotal, currency)}</td></tr>
          <tr className="border-b border-gray-100 cursor-pointer hover:bg-gray-50" onClick={() => setPop("pay")}><td className="px-3 py-1.5 text-gray-600">Driver pay <span className="text-gray-400">(short mi × rate — open ↗)</span></td><td className="px-3 py-1.5 text-right tabular-nums">{formatMoneyCents(driverPay, currency)}</td></tr>
          <tr className="font-semibold text-[#0F1219]"><td className="px-3 py-2">Margin on load {load.load_number}</td><td className="px-3 py-2 text-right tabular-nums" data-testid="load-costs-margin-value">{formatMoneyCents(margin, currency)}{marginPct != null ? ` · ${marginPct.toFixed(1)}%` : ""}</td></tr>
        </tbody>
      </table>
      <p className="border-t border-gray-100 px-3 py-1.5 text-xs text-gray-500">Approximate · before settlement. Nothing here has posted to the general ledger — this tour is open.</p>
    </div>

    {/* What the bank will do with these */}
    <button type="button" data-testid="load-costs-bank-section" onClick={() => setPop("bank")} className="block w-full rounded-sm border border-gray-200 bg-white px-3 py-2 text-left text-xs hover:bg-gray-50">
      <span className="font-semibold uppercase text-[#4B5563]">What the bank will do with these</span>
      <span className="float-right text-gray-400">open ↗</span>
      <p className="mt-1 text-gray-500">Each expense is offered against its "Paid with" account when the matching transaction lands in the bank feed (same account, amount ±$0.01, date ±3 days, vendor descriptor).</p>
    </button>

    {pop ? <CostPopup id={pop} onClose={() => setPop(null)} savedExpenses={savedExpenses} currency={currency} loadNumber={load.load_number} /> : null}
  </div>;
}

/** An editable draft cost card. Expense/Bill toggle for the common case; the advance cards carry their
 *  own field set (reached via + New). NUMBER is an auto label — never typed. */
function DraftCard({ row, number, canRemove, load, vendors, categories, paymentAccounts, advanceBankAccountRows, fuelAccountLabel, operatingBankLabel, onUpdate, onRemove, onOpenReceiptInfo }: {
  row: Draft; number: string; canRemove: boolean; load: LoadDetail;
  vendors: Array<{ id: string; label: string }>; categories: Array<{ id: string; label: string }>; paymentAccounts: Array<{ id: string; label: string }>;
  advanceBankAccountRows: Array<{ id: string; display_name?: string | null; account_name?: string | null; institution_name?: string | null; account_mask?: string | null }>;
  fuelAccountLabel: string | null; operatingBankLabel: string | null;
  onUpdate: (patch: Partial<Draft>) => void; onRemove: () => void; onOpenReceiptInfo: () => void;
}) {
  const isExpenseOrBill = row.kind === "expense" || row.kind === "bill";
  const paidWithName = paymentAccounts.find((a) => a.id === row.paymentAccountId)?.label;
  const hint = row.kind === "bill"
    ? `Posts debit ${row.categoryName || "the expense account"}, credit Accounts Payable. The vendor document number is its own box (never filled for you) — it is what stops us paying the same bill twice.`
    : row.kind === "fuel_advance"
      ? `Fuel advance to ${load.assigned_primary_driver_name ?? "the driver"} — posts debit Fuel expense, credit ${operatingBankLabel ?? "the operating bank"}. A company expense, never a driver receivable.`
      : row.kind === "advance"
        ? `Broker advance received — reduces what the broker still owes on this load, never a driver deduction.`
        : `Posts debit ${row.categoryName || "the expense account"}, credit ${paidWithName || "the bank or card"}. Numbered ${number} — you never type the number.`;

  return <div data-testid="load-costs-entry" className="rounded-sm border border-gray-200 bg-white">
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-[#F7F8FA] px-3 py-2">
      <span className="font-semibold text-[#0F1219]" data-testid="load-cost-number">{number}</span>
      {isExpenseOrBill ? <div className="inline-flex overflow-hidden rounded-sm border border-[#C7D2DC]">
        <button type="button" data-testid="load-cost-toggle-expense" aria-pressed={row.kind === "expense"} onClick={() => onUpdate({ kind: "expense" })} className={`h-[24px] px-2 text-xs font-semibold ${row.kind === "expense" ? "bg-[#14314F] text-white" : "bg-white text-[#4B5563] hover:bg-gray-50"}`}>Expense · paid now</button>
        <button type="button" data-testid="load-cost-toggle-bill" aria-pressed={row.kind === "bill"} onClick={() => onUpdate({ kind: "bill" })} className={`h-[24px] border-l border-[#C7D2DC] px-2 text-xs font-semibold ${row.kind === "bill" ? "bg-[#14314F] text-white" : "bg-white text-[#4B5563] hover:bg-gray-50"}`}>Bill · owed</button>
      </div> : row.kind === "advance"
        ? <span data-testid="load-cost-toggle-advance" className="inline-block rounded-sm border border-[#C7D2DC] bg-white px-2 py-px text-xs text-[#4B5563]">Cash advance · from broker</span>
        : <span data-testid="load-cost-toggle-fuel-advance" className="inline-block rounded-sm border border-[#C7D2DC] bg-white px-2 py-px text-xs text-[#4B5563]">Fuel advance · to driver</span>}
      <span data-testid="load-cost-status" className="ml-auto text-gray-500">{row.kind === "bill" ? "owed" : row.kind === "advance" ? "received" : "paid"} · new — not saved</span>
      {canRemove ? <button type="button" data-testid="load-cost-remove" className="text-gray-400 hover:text-red-600" onClick={onRemove} aria-label="Remove row">×</button> : null}
    </div>

    <div className="grid grid-cols-2 gap-3 px-3 py-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
      <Field label="Date"><DatePicker data-testid="load-cost-field-date" className="mt-1 h-8 w-full" value={row.date} onChange={(value) => onUpdate({ date: value })} /></Field>

      <Field label="Vendor">
        {row.kind === "advance"
          ? <span className="mt-1 block text-gray-500">{load.customer_name ?? "Broker"}</span>
          : row.kind === "fuel_advance"
            ? <span className="mt-1 block text-gray-500">{load.assigned_primary_driver_name ?? "Driver"}</span>
            : <div className="mt-1"><LocalCombobox testId="load-cost-field-vendor" placeholder="Select vendor" value={row.vendorName} options={vendors} onSelect={(o) => onUpdate({ vendorId: o.id, vendorName: o.label })} createHref="/dispatch/vendors" /></div>}
      </Field>

      <Field label="Category">
        {row.kind === "advance"
          ? <select data-testid="load-cost-field-advance-category" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-1 text-xs" value={row.advanceCategory} onChange={(e) => onUpdate({ advanceCategory: e.target.value as BrokerAdvanceCategory | "" })}><option value="">Select category</option>{BROKER_ADVANCE_CATEGORIES.map((c) => <option key={c} value={c}>{ADVANCE_CATEGORY_LABEL[c]}</option>)}</select>
          : row.kind === "fuel_advance"
            ? <span data-testid="load-cost-field-fuel-category" className="mt-1 block text-gray-500">{fuelAccountLabel ?? "No Fuel expense account found"}</span>
            : <div className="mt-1"><LocalCombobox testId="load-cost-field-category" placeholder="Select category" value={row.categoryName} options={categories} onSelect={(o) => onUpdate({ categoryId: o.id, categoryName: o.label })} createHref="/accounting/chart-of-accounts" /></div>}
      </Field>

      {/* Paid with (expense: bank/card only) · Vendor doc no. (bill) · bank (advances) */}
      {row.kind === "bill"
        ? <Field label="Vendor doc no."><input data-testid="load-cost-field-vendor-invoice" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="off the paper" value={row.invoiceNo} onChange={(e) => onUpdate({ invoiceNo: e.target.value })} /></Field>
        : row.kind === "expense"
          ? <Field label="Paid with"><select data-testid="load-cost-field-paid-with" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={row.paymentAccountId} onChange={(e) => onUpdate({ paymentAccountId: e.target.value })}><option value="">Select bank or card</option>{paymentAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
          : row.kind === "fuel_advance"
            ? <Field label="Paid from (bank)"><div data-testid="load-cost-field-fuel-bank" className="mt-1 flex h-8 w-full items-center rounded-sm border border-gray-200 bg-white px-2 text-xs text-gray-600">{operatingBankLabel ?? "No operating bank account found"}</div></Field>
            : <Field label={row.advanceCategory === "driver_pay" ? "Deposited into (bank) — optional" : "Deposited into (bank)"}><select data-testid="load-cost-field-advance-bank" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={row.paymentAccountId} onChange={(e) => onUpdate({ paymentAccountId: e.target.value })}><option value="">{row.advanceCategory === "driver_pay" ? "No bank — broker paid the driver directly" : "Select bank account"}</option>{advanceBankAccountRows.map((a) => <option key={a.id} value={a.id}>{formatBankAccountPickerLabel(a)}</option>)}</select></Field>}

      <Field label="Amount"><div data-testid="load-cost-field-amount" className="mt-1"><MoneyInput className="h-8 w-full" valueCents={row.amount ? Math.round(Number(row.amount) * 100) : null} onChangeCents={(c) => onUpdate({ amount: c == null ? "" : String(c / 100) })} /></div></Field>

      {/* Receipt on every card. The draft has no id yet, so attach opens the mechanism note; the receipt
          links to the expense/bill row on Save (same docs.files path as the saved cards). */}
      <Field label="Receipt"><button type="button" data-testid="load-cost-receipt" className="mt-1 inline-flex h-8 items-center rounded-sm border border-dashed border-gray-300 px-2 text-xs text-slate-600 hover:bg-gray-50" onClick={onOpenReceiptInfo}>+ attach</button></Field>
    </div>

    {row.kind === "advance" ? <div className="grid grid-cols-1 gap-3 border-t border-gray-100 px-3 py-2 text-xs sm:grid-cols-2">
      <Field label="Instrument type"><input data-testid="load-cost-field-instrument-type" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="Comchek / EFT / wire" value={row.instrumentType} onChange={(e) => onUpdate({ instrumentType: e.target.value })} /></Field>
      <Field label="Instrument reference"><input data-testid="load-cost-field-instrument-reference" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="check / transaction no." value={row.instrumentReference} onChange={(e) => onUpdate({ instrumentReference: e.target.value })} /></Field>
    </div> : null}

    <p data-testid="load-cost-caption" className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">{hint}</p>
    {row.error ? <p data-testid="load-cost-hint" className="border-t border-gray-100 bg-red-50 px-3 py-1.5 text-xs text-red-700">{row.error}</p> : null}
  </div>;
}

/** A saved cost, read-only, with its full columns + receipt attachment (docs.files) + bank status. */
function SavedCard({ entityType, entityId, number, typeLabel, amountCents, currency, status, bankMatched, loadNumber, operatingCompanyId }: {
  entityType: "expense" | "bill"; entityId: string; number: string; typeLabel: string;
  amountCents: number; currency: string; status: string; bankMatched: boolean; loadNumber: string; operatingCompanyId: string;
}) {
  return <div data-testid="load-cost-saved-entry" className="rounded-sm border border-gray-200 bg-white">
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-[#F7F8FA] px-3 py-2 text-xs">
      <EntityLink kind={entityType} id={entityId} label={number} />
      <span className="text-gray-400">· {typeLabel}</span>
      <span className="ml-auto tabular-nums font-semibold text-[#0F1219]">{formatMoneyCents(amountCents, currency)}</span>
      <span data-testid="load-cost-bank-status" className={`inline-block rounded-sm border px-1.5 py-px text-xs ${bankMatched ? "border-slate-300 bg-slate-100 text-slate-700" : "border-[#C7D2DC] bg-[#F4F7FA] text-[#1F2937]"}`}>{status}</span>
    </div>
    <div className="px-3 py-2">
      <EntityDocumentUpload entityType={entityType} entityId={entityId} entityName={`${typeLabel} ${number} · Load ${loadNumber}`} operatingCompanyId={operatingCompanyId} />
    </div>
  </div>;
}

/** Drill-down pop-up for a header/section box (Escape / backdrop closes). */
function CostPopup({ id, onClose, savedExpenses, currency, loadNumber }: { id: Exclude<PopId, null>; onClose: () => void; savedExpenses: Array<{ id: string; expense_number?: string | null; total_amount_cents: number | string; matched_bank_transaction_id?: string | null }>; currency: string; loadNumber: string }) {
  const title = id === "receipt" ? "Receipt attachment" : id === "bank" ? "What the bank will do with these" : "Driver pay lines";
  return <div className="fixed inset-0 z-[220] flex items-start justify-center bg-black/30 p-6" onClick={onClose} data-testid="load-costs-popup">
    <div className="mt-16 w-full max-w-lg rounded-sm border border-gray-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <h3 className="text-xs font-semibold uppercase text-[#4B5563]">{title}</h3>
        <button type="button" className="text-gray-400 hover:text-gray-700" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="px-4 py-3 text-xs text-gray-700">
        {id === "receipt" ? <p>Upload a photo or PDF and it attaches to this expense or bill, shown as a thumbnail with a count on the card. "+ Add from a receipt photo" reads the receipt (vendor, date, total) and pre-fills a new card for review — it never auto-saves. The same control appears on the vendor-bill form, Create multiple bills, the New expense screen and the Book Load accessorial rows.</p> : null}
        {id === "bank" ? <table className="w-full"><thead><tr className="text-left text-gray-500"><th className="py-1">Cost</th><th className="py-1 text-right">Amount</th><th className="py-1">Bank status</th></tr></thead><tbody>{savedExpenses.map((e) => <tr key={e.id} className="border-t border-gray-100"><td className="py-1">{e.expense_number ?? "—"}</td><td className="py-1 text-right tabular-nums">{formatMoneyCents(Number(e.total_amount_cents), currency)}</td><td className="py-1">{e.matched_bank_transaction_id ? `Matched to ${loadNumber}` : "Offered when it lands"}</td></tr>)}{!savedExpenses.length ? <tr><td colSpan={3} className="py-2 text-center text-gray-500">No saved expenses yet.</td></tr> : null}</tbody></table> : null}
        {id === "pay" ? <p>Driver pay is loaded miles (short) × the stored loaded rate + empty miles (deadhead) × the stored empty rate — miles × stored rate is the only path. Open the Driver Pay tab for the two lines and the posting preview.</p> : null}
      </div>
    </div>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-xs font-semibold uppercase text-gray-500">{label}{children}</label>; }

function ActionButton({ testId, children, onClick, primary = false, disabled = false }: { testId: string; children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return <button data-testid={testId} type="button" disabled={disabled} onClick={onClick} className={`inline-flex h-[28px] items-center rounded-sm border px-2 text-xs font-semibold disabled:opacity-50 ${primary ? "border-[#14314F] bg-[#14314F] text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>{children}</button>;
}

/** ONE QuickBooks "+ New" button with a drop-down. Each item opens a real create flow. Dismisses on
 *  outside click (owner picker law). */
function NewCostMenu({ onPick, receiptHref, billsHref }: { onPick: (kind: CostChoice) => void; receiptHref: string; billsHref: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, []);
  const pick = (kind: CostChoice) => { onPick(kind); setOpen(false); };
  const itemClass = "block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-slate-100";
  return <div ref={rootRef} className="relative">
    <button type="button" data-testid="load-costs-add-top" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex h-[28px] items-center gap-1 rounded-sm border border-[#14314F] bg-[#14314F] px-2 text-xs font-semibold text-white">+ New <span aria-hidden>▾</span></button>
    {open ? <div role="menu" data-testid="load-costs-new-menu" className="absolute right-0 z-50 mt-1 w-56 rounded-sm border border-gray-200 bg-white py-1 shadow-md">
      <button type="button" role="menuitem" data-testid="load-costs-menu-expense" className={itemClass} onClick={() => pick("expense")}>Expense · paid now</button>
      <button type="button" role="menuitem" data-testid="load-costs-menu-bill" className={itemClass} onClick={() => pick("bill")}>Bill · owed</button>
      <Link role="menuitem" data-testid="load-costs-menu-bill-payment" className={itemClass} to={billsHref} onClick={() => setOpen(false)}>Bill payment · pay a bill</Link>
      <button type="button" role="menuitem" data-testid="load-costs-add-advance-top" className={itemClass} onClick={() => pick("advance")}>Cash advance · from broker</button>
      <button type="button" role="menuitem" data-testid="load-costs-add-fuel-advance-top" className={itemClass} onClick={() => pick("fuel_advance")}>Fuel advance · to driver</button>
      <div className="my-1 border-t border-gray-100" />
      <Link role="menuitem" data-testid="load-costs-receipt-photo" className={itemClass} to={receiptHref} onClick={() => setOpen(false)}>From a receipt photo</Link>
    </div> : null}
  </div>;
}

/** Local typed-filter combobox with a "+ Create" link. Dismisses on outside click. */
function LocalCombobox({ testId, value, options, onSelect, placeholder, createHref }: { testId: string; value: string; options: Array<{ id: string; label: string }>; onSelect: (o: { id: string; label: string }) => void; placeholder?: string; createHref?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  const q = draft.trim().toLowerCase();
  const filtered = useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options).slice(0, 50), [options, q]);
  return <div ref={rootRef} className="relative w-full">
    <input data-testid={testId} className="h-8 w-full rounded-sm border border-gray-300 px-1.5 text-xs" placeholder={placeholder} value={draft} onFocus={() => setOpen(true)} onChange={(e) => { setDraft(e.target.value); setOpen(true); }} />
    {open ? <div className="absolute z-50 mt-1 max-h-56 w-64 overflow-auto rounded-sm border border-gray-200 bg-white shadow-md">
      {filtered.map((o) => <button key={o.id} type="button" className="block w-full px-2 py-1.5 text-left text-xs hover:bg-slate-100" onMouseDown={(e) => e.preventDefault()} onClick={() => { onSelect(o); setDraft(o.label); setOpen(false); }}>{o.label}</button>)}
      {!filtered.length ? <div className="px-2 py-1.5 text-xs text-gray-500">No matches.</div> : null}
      {createHref ? <Link to={createHref} className="block border-t border-gray-100 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">+ Create</Link> : null}
    </div> : null}
  </div>;
}
