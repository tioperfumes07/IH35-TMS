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
import { Button } from "../Button";
import { DatePicker } from "../forms/DatePicker";
import { MoneyInput } from "../forms/MoneyInput";
import { useToast } from "../Toast";
import { EntityLink } from "../shared/EntityLink";
import { formatMoneyCents } from "./constants";

type CostChoice = "expense" | "bill" | "advance" | "fuel_advance";
type Bucket = "late_fee" | "lumper" | "fuel" | "repairs_maintenance" | "other";
const DASH = "—";

type Draft = {
  id: string;
  /** QuickBooks register NUMBER — EMPTY and EDITABLE by default. Blank = system assigns load#, -1, -2.
   *  A typed value wins verbatim (expense_number / bill display_id). */
  number: string;
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

const ADVANCE_CATEGORY_LABEL: Record<BrokerAdvanceCategory, string> = {
  diesel: "Diesel",
  driver_pay: "Driver pay",
  repair: "Repair",
  other: "Other",
};
const TYPE_LABEL: Record<CostChoice, string> = {
  expense: "Expense · paid now",
  bill: "Bill · owed",
  fuel_advance: "Fuel advance",
  advance: "Advance received",
};
const TYPE_ORDER: CostChoice[] = ["expense", "bill", "fuel_advance", "advance"];

/** Same 5-way split the Load Costs board uses (load-costs-board.routes.ts): detention→late fee,
 *  lumper→lumper, diesel/def→fuel, work-order/repair→R&M, everything else→other. Here we classify by
 *  the chosen category account's name (display only — the AMOUNT column always carries the real number). */
function bucketOf(kind: CostChoice, categoryName: string): Bucket {
  if (kind === "fuel_advance") return "fuel";
  const n = categoryName.toLowerCase();
  if (/detention|late fee|late-fee/.test(n)) return "late_fee";
  if (/lumper/.test(n)) return "lumper";
  if (/diesel|\bdef\b|\bfuel\b/.test(n)) return "fuel";
  if (/repair|maintenance|\br&m\b|roadside|tire|wash|scale|toll/.test(n)) return "repairs_maintenance";
  return "other";
}

function blankDraft(kind: CostChoice = "expense"): Draft {
  return {
    id: crypto.randomUUID(),
    number: "",
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
  // ACCT-F25053 (owner ruling 2026-09-04: "bind by role, never by name") — the fuel-advance debit
  // account is resolved from accounting.chart_of_accounts_roles, never picked by a /fuel/i name match.
  const coaRoles = useQuery({ queryKey: ["load-costs", "coa-roles", opco], queryFn: () => listCoaRoles(opco) });
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
  // ACCT-F25053 — account_type is the QBO enum spelling exactly ("CostOfGoodsSold", no spaces).
  const categories = chart.filter((row) => row.account_type === "Expense" || row.account_type === "OtherExpense" || row.account_type === "CostOfGoodsSold");
  const paymentAccounts = chart.filter((row) => /asset|bank|credit ?card/i.test(row.account_type));
  const fuelRoleRow = (coaRoles.data?.rows ?? []).find((row) => row.role === "company_fuel_advance_expense" && row.is_active && row.account_id);
  const fuelAccount = fuelRoleRow ? chart.find((row) => row.id === fuelRoleRow.account_id) : undefined;
  const operatingBankRoleRow = (coaRoles.data?.rows ?? []).find((row) => row.role === "operating_bank" && row.is_active && row.account_id);
  const operatingBankAccount = operatingBankRoleRow ? chart.find((row) => row.id === operatingBankRoleRow.account_id) : undefined;
  const draftTotal = drafts.reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.amount || 0) * 100)), 0);
  const margin = revenue - savedCosts - driverPay - draftTotal;

  // QuickBooks: blank NUMBER = system assigns load# then load#-1, load#-2… (one per prior saved cost +
  // preceding blank drafts). A typed value wins verbatim.
  const autoNumber = (index: number) => {
    const priorBlank = drafts.slice(0, index).filter((r) => !r.number.trim()).length;
    const seq = savedCount + priorBlank;
    return seq === 0 ? load.load_number : `${load.load_number}-${seq}`;
  };
  const resolvedNumber = (row: Draft, index: number) => (row.number.trim() ? row.number.trim() : autoNumber(index));
  const update = (id: string, patch: Partial<Draft>) => setDrafts((rows) => rows.map((row) => row.id === id ? { ...row, ...patch, error: null } : row));
  const removeDraft = (id: string) => setDrafts((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  const addDraft = (kind: CostChoice = "expense") => setDrafts((rows) => [...rows, blankDraft(kind)]);

  const save = useMutation({
    mutationFn: async () => {
      const errors = new Map<string, string>();
      for (const [index, row] of drafts.entries()) {
        const amountCents = Math.round(Number(row.amount) * 100);
        const number = resolvedNumber(row, index);
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

  const statusBadge = statusLabel(load.status);

  return <div className="space-y-3" data-testid="load-costs-tab-shell">
    {/* Identity strip — LOAD 13508 · customer · driver · Unit + status badge */}
    <section data-testid="load-costs-identity" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-gray-200 bg-white px-3 py-2 text-xs">
      <span className="font-semibold uppercase text-gray-500">Load</span>
      <EntityLink kind="load" id={load.id} label={load.load_number} />
      <span className="text-gray-300">·</span><span>{load.customer_name ?? "Customer not visible"}</span>
      <span className="text-gray-300">·</span><span>{load.assigned_primary_driver_name ?? "Driver not assigned"}</span>
      {load.assigned_unit_number ? <><span className="text-gray-300">·</span><span>Unit {load.assigned_unit_number}</span></> : null}
      <span data-testid="load-costs-status-badge" className={`ml-auto inline-flex h-[22px] items-center rounded-sm border px-2 font-semibold uppercase ${statusBadge.className}`}>{statusBadge.label}</span>
    </section>

    {/* Four KPI cards — light bg, darker border, centered */}
    <section data-testid="load-costs-kpis" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Kpi label="Line haul revenue" value={formatMoneyCents(revenue, currency)} />
      <Kpi label="Costs on this load" value={formatMoneyCents(savedCosts + draftTotal, currency)} />
      <Kpi label="Driver pay" value={formatMoneyCents(driverPay, currency)} />
      <Kpi label="Approximate margin" value={formatMoneyCents(margin, currency)} strong />
    </section>
    <p className="text-xs text-gray-500">Approximate · before settlement. Nothing here has posted to the general ledger — this tour is open.</p>

    {canEdit ? <>
      {/* Action row — 28px square buttons */}
      <div className="flex flex-wrap gap-2" data-testid="load-costs-actions">
        <ActionButton testId="load-costs-add-top" primary onClick={() => addDraft("expense")}>+ Add another cost</ActionButton>
        <ActionButton testId="load-costs-add-fuel-advance-top" onClick={() => addDraft("fuel_advance")}>+ Fuel advance</ActionButton>
        <Link data-testid="load-costs-receipt-photo" className="inline-flex h-[28px] items-center rounded-sm border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-700 hover:bg-gray-50" to={`/accounting/receipts?load_id=${encodeURIComponent(load.id)}`}>+ From a receipt photo</Link>
        <ActionButton testId="load-costs-add-advance-top" onClick={() => addDraft("advance")}>Advance received · from broker</ActionButton>
        <ActionButton testId="load-costs-save-all" onClick={() => save.mutate()} disabled={save.isPending}>Save</ActionButton>
      </div>

      {/* QuickBooks register — 12 columns, NUMBER empty & editable */}
      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white" data-testid="load-costs-register">
        <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
          <thead>
            <tr className="bg-[#EEF2F6] font-bold uppercase tracking-wide text-[#4B5563]" style={{ fontSize: 11 }}>
              {["Number", "Date", "Type", "Vendor", "Category", "Late Fee", "Lumper", "Fuel", "R&M Exp", "Other", "Amount", "Status"].map((h) => (
                <th key={h} className={`whitespace-nowrap border-b-2 border-r border-[#C7D2DC] px-2 py-1.5 ${["Late Fee", "Lumper", "Fuel", "R&M Exp", "Other", "Amount"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
              ))}
              <th className="border-b-2 border-[#C7D2DC] px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {drafts.map((row, index) => {
              const cents = row.amount ? Math.round(Number(row.amount) * 100) : 0;
              const bucket = bucketOf(row.kind, row.categoryName);
              const splitCell = (b: Bucket) => (bucket === b && cents ? formatMoneyCents(cents, currency) : DASH);
              return <tr key={row.id} data-testid="load-costs-entry" className="border-b border-gray-100 align-top">
                <td className="border-r border-gray-100 px-2 py-1.5"><input data-testid="load-cost-field-number" className="h-7 w-24 rounded-sm border border-gray-300 px-1.5 text-xs" placeholder={autoNumber(index)} value={row.number} onChange={(e) => update(row.id, { number: e.target.value })} /></td>
                <td className="border-r border-gray-100 px-2 py-1.5"><DatePicker data-testid="load-cost-field-date" className="h-7 w-32" value={row.date} onChange={(value) => update(row.id, { date: value })} /></td>
                <td className="border-r border-gray-100 px-2 py-1.5">
                  <select data-testid="load-cost-field-type" className="h-7 w-36 rounded-sm border border-gray-300 px-1 text-xs" value={row.kind} onChange={(e) => update(row.id, { kind: e.target.value as CostChoice })}>
                    {TYPE_ORDER.map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
                  </select>
                </td>
                <td className="border-r border-gray-100 px-2 py-1.5">
                  {row.kind === "advance"
                    ? <span className="text-gray-500">{load.customer_name ?? "Broker"}</span>
                    : row.kind === "fuel_advance"
                      ? <span className="text-gray-500">{load.assigned_primary_driver_name ?? "Driver"}</span>
                      : <LocalCombobox testId="load-cost-field-vendor" placeholder="Select vendor" value={row.vendorName} options={(vendors.data?.vendors ?? []).map((v) => ({ id: v.id, label: v.name }))} onSelect={(o) => update(row.id, { vendorId: o.id, vendorName: o.label })} createHref="/dispatch/vendors" />}
                </td>
                <td className="border-r border-gray-100 px-2 py-1.5">
                  {row.kind === "advance"
                    ? <select data-testid="load-cost-field-advance-category" className="h-7 w-32 rounded-sm border border-gray-300 px-1 text-xs" value={row.advanceCategory} onChange={(e) => update(row.id, { advanceCategory: e.target.value as BrokerAdvanceCategory | "" })}><option value="">Select category</option>{BROKER_ADVANCE_CATEGORIES.map((c) => <option key={c} value={c}>{ADVANCE_CATEGORY_LABEL[c]}</option>)}</select>
                    : row.kind === "fuel_advance"
                      ? <span data-testid="load-cost-field-fuel-category" className="text-gray-500">{fuelAccount ? `${fuelAccount.account_number ? `${fuelAccount.account_number} · ` : ""}${fuelAccount.account_name} (auto)` : "No Fuel expense account found"}</span>
                      : <LocalCombobox testId="load-cost-field-category" placeholder="Select category" value={row.categoryName} options={categories.map((a) => ({ id: a.id, label: `${a.account_number ? `${a.account_number} · ` : ""}${a.account_name}` }))} onSelect={(o) => update(row.id, { categoryId: o.id, categoryName: o.label })} createHref="/accounting/chart-of-accounts" />}
                </td>
                <td className="whitespace-nowrap border-r border-gray-100 px-2 py-1.5 text-right tabular-nums text-gray-500">{splitCell("late_fee")}</td>
                <td className="whitespace-nowrap border-r border-gray-100 px-2 py-1.5 text-right tabular-nums text-gray-500">{splitCell("lumper")}</td>
                <td className="whitespace-nowrap border-r border-gray-100 px-2 py-1.5 text-right tabular-nums text-gray-500">{splitCell("fuel")}</td>
                <td className="whitespace-nowrap border-r border-gray-100 px-2 py-1.5 text-right tabular-nums text-gray-500">{splitCell("repairs_maintenance")}</td>
                <td className="whitespace-nowrap border-r border-gray-100 px-2 py-1.5 text-right tabular-nums text-gray-500">{splitCell("other")}</td>
                <td className="border-r border-gray-100 px-2 py-1.5 text-right"><div data-testid="load-cost-field-amount" className="ml-auto w-28"><MoneyInput className="h-7 w-full" valueCents={row.amount ? Math.round(Number(row.amount) * 100) : null} onChangeCents={(c) => update(row.id, { amount: c == null ? "" : String(c / 100) })} /></div></td>
                <td className="whitespace-nowrap border-r border-gray-100 px-2 py-1.5"><span data-testid="load-cost-status" className="text-gray-500">{row.kind === "bill" ? "owed" : row.kind === "advance" ? "received" : "paid"} · new, not saved</span></td>
                <td className="px-2 py-1.5 text-right">{drafts.length > 1 ? <button type="button" data-testid="load-cost-remove" className="text-gray-400 hover:text-red-600" onClick={() => removeDraft(row.id)} aria-label="Remove row">×</button> : null}</td>
              </tr>;
            })}
            {drafts.map((row) => row.error ? <tr key={`${row.id}-err`}><td colSpan={13} className="border-b border-gray-100 bg-red-50 px-2 py-1 text-xs text-red-700" data-testid="load-cost-hint">{row.error}</td></tr> : null)}
            {/* Extra inputs the register can't hold inline (bank / invoice / instrument) live in a details strip per draft */}
          </tbody>
        </table>
      </div>

      {drafts.map((row) => needsExtra(row) ? <div key={`${row.id}-extra`} data-testid="load-cost-extra" className="grid grid-cols-1 gap-2 rounded-sm border border-gray-200 bg-gray-50 p-2 text-xs sm:grid-cols-2">
        {row.kind === "expense" ? <Field label="Paid with"><select data-testid="load-cost-field-paid-with" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={row.paymentAccountId} onChange={(e) => update(row.id, { paymentAccountId: e.target.value })}><option value="">Select bank or card</option>{paymentAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_number ? `${a.account_number} · ` : ""}{a.account_name}</option>)}</select></Field> : null}
        {row.kind === "fuel_advance" ? <Field label="Paid from (bank)"><div data-testid="load-cost-field-fuel-bank" className="mt-1 flex h-8 w-full items-center rounded-sm border border-gray-200 bg-white px-2 text-xs text-gray-600">{operatingBankAccount ? `${operatingBankAccount.account_number ? `${operatingBankAccount.account_number} · ` : ""}${operatingBankAccount.account_name} (auto)` : "No operating bank account found"}</div></Field> : null}
        {row.kind === "bill" ? <Field label="Vendor invoice no."><input data-testid="load-cost-field-vendor-invoice" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="off the paper" value={row.invoiceNo} onChange={(e) => update(row.id, { invoiceNo: e.target.value })} /></Field> : null}
        {row.kind === "advance" ? <>
          <Field label="Instrument type"><input data-testid="load-cost-field-instrument-type" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="Comchek / EFT / wire" value={row.instrumentType} onChange={(e) => update(row.id, { instrumentType: e.target.value })} /></Field>
          <Field label="Instrument reference"><input data-testid="load-cost-field-instrument-reference" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="check / transaction no." value={row.instrumentReference} onChange={(e) => update(row.id, { instrumentReference: e.target.value })} /></Field>
          <Field label={row.advanceCategory === "driver_pay" ? "Deposited into (bank) — optional" : "Deposited into (bank)"}><select data-testid="load-cost-field-advance-bank" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={row.paymentAccountId} onChange={(e) => update(row.id, { paymentAccountId: e.target.value })}><option value="">{row.advanceCategory === "driver_pay" ? "No bank — broker paid the driver directly" : "Select bank account"}</option>{advanceBankAccountRows.map((a) => <option key={a.id} value={a.id}>{formatBankAccountPickerLabel(a)}</option>)}</select></Field>
        </> : null}
      </div> : null)}
    </> : <section data-testid="load-costs-readonly-reason" className="rounded-sm border border-slate-300 bg-slate-100 p-3 text-xs text-slate-700">{canEditReason ?? "You don't have permission to add costs to this load right now."}</section>}

    {/* Saved costs — read-only register rows, void never deletes */}
    <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white" data-testid="load-costs-saved">
      <table className="w-full min-w-[900px] border-collapse text-left text-xs">
        <thead><tr className="bg-[#EEF2F6] font-bold uppercase tracking-wide text-[#4B5563]" style={{ fontSize: 11 }}><th className="border-b-2 border-r border-[#C7D2DC] px-2 py-1.5">Number</th><th className="border-b-2 border-r border-[#C7D2DC] px-2 py-1.5">Type</th><th className="border-b-2 border-r border-[#C7D2DC] px-2 py-1.5 text-right">Amount</th><th className="border-b-2 border-[#C7D2DC] px-2 py-1.5">Status</th></tr></thead>
        <tbody>
          {savedExpenses.map((row) => <tr key={row.id} className="border-b border-gray-100" data-cost-driver-column="driver_uuid"><td className="border-r border-gray-100 px-2 py-1.5"><EntityLink kind="expense" id={row.id} label={row.expense_number ?? "Expense"} /></td><td className="border-r border-gray-100 px-2 py-1.5">Expense</td><td className="border-r border-gray-100 px-2 py-1.5 text-right tabular-nums">{formatMoneyCents(Number(row.total_amount_cents), currency)}</td><td className="px-2 py-1.5">{row.status === "void" ? "void" : row.matched_bank_transaction_id ? "paid · matched" : "paid"}</td></tr>)}
          {savedBills.map((row) => <tr key={row.id} className="border-b border-gray-100" data-cost-driver-column="driver_id"><td className="border-r border-gray-100 px-2 py-1.5"><EntityLink kind="bill" id={row.id} label={row.bill_number ?? "Bill"} /></td><td className="border-r border-gray-100 px-2 py-1.5">Bill</td><td className="border-r border-gray-100 px-2 py-1.5 text-right tabular-nums">{formatMoneyCents(Number(row.amount_cents), currency)}</td><td className="px-2 py-1.5">{row.status === "voided" ? "void" : "owed"}</td></tr>)}
          {savedAdvances.map((row) => <tr key={row.id} className="border-b border-gray-100" data-testid="load-cost-saved-advance"><td className="border-r border-gray-100 px-2 py-1.5" colSpan={2}>Advance · {ADVANCE_CATEGORY_LABEL[row.category]} · {row.instrument_type} {row.instrument_reference}</td><td className="border-r border-gray-100 px-2 py-1.5 text-right tabular-nums">{formatMoneyCents(Number(row.amount_cents), currency)}</td><td className="px-2 py-1.5">{row.applied_to_invoice_id ? "applied to invoice" : "received"}</td></tr>)}
          {!savedCount && !savedAdvances.length ? <tr><td colSpan={4} className="px-2 py-3 text-center text-gray-500">No costs on this load yet.</td></tr> : null}
        </tbody>
      </table>
    </div>
    {savedCount || savedAdvances.length ? <Link className="inline-block text-xs font-semibold text-slate-700 underline" to={`/accounting/expenses?load_id=${encodeURIComponent(load.id)}`}>Open saved costs</Link> : null}
  </div>;
}

function statusLabel(status: string | null | undefined): { label: string; className: string } {
  const s = (status ?? "").toLowerCase();
  if (s === "draft") return { label: "Draft", className: "border-red-300 bg-red-50 text-red-700" };
  if (s === "delivered" || s === "completed" || s === "invoiced" || s === "closed") return { label: s, className: "border-slate-200 bg-slate-100 text-slate-700" };
  return { label: s || "—", className: "border-[#C7D2DC] bg-[#F4F7FA] text-[#1F2937]" };
}

function needsExtra(row: Draft): boolean {
  return row.kind === "expense" || row.kind === "bill" || row.kind === "advance" || row.kind === "fuel_advance";
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-xs font-semibold uppercase text-gray-500">{label}{children}</label>; }

function Kpi({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div data-testid="load-costs-kpi" className="flex flex-col items-center justify-center rounded-sm border border-[#C7D2DC] bg-[#F4F7FA] px-2 py-2 text-center">
    <span className="font-bold uppercase tracking-wide text-[#4B5563]" style={{ fontSize: 11 }}>{label}</span>
    <span className={`mt-0.5 tabular-nums text-xs ${strong ? "font-semibold text-[#0F1219]" : "text-[#1F2A44]"}`} style={{ fontSize: 13 }}>{value}</span>
  </div>;
}

function ActionButton({ testId, children, onClick, primary = false, disabled = false }: { testId: string; children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return <button data-testid={testId} type="button" disabled={disabled} onClick={onClick} className={`inline-flex h-[28px] items-center rounded-sm border px-2 text-xs font-semibold disabled:opacity-50 ${primary ? "border-[#14314F] bg-[#14314F] text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>{children}</button>;
}

/** Local typed-filter combobox over an in-memory option list, with a "+ Create" link when nothing matches
 *  (owner spec: "every picker a Combobox with typed filter and + Create"). Dismisses on outside click. */
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
  return <div ref={rootRef} className="relative w-40">
    <input data-testid={testId} className="h-7 w-full rounded-sm border border-gray-300 px-1.5 text-xs" placeholder={placeholder} value={draft} onFocus={() => setOpen(true)} onChange={(e) => { setDraft(e.target.value); setOpen(true); }} />
    {open ? <div className="absolute z-50 mt-1 max-h-56 w-64 overflow-auto rounded-sm border border-gray-200 bg-white shadow-md">
      {filtered.map((o) => <button key={o.id} type="button" className="block w-full px-2 py-1.5 text-left text-xs hover:bg-slate-100" onMouseDown={(e) => e.preventDefault()} onClick={() => { onSelect(o); setDraft(o.label); setOpen(false); }}>{o.label}</button>)}
      {!filtered.length ? <div className="px-2 py-1.5 text-xs text-gray-500">No matches.</div> : null}
      {createHref ? <Link to={createHref} className="block border-t border-gray-100 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">+ Create</Link> : null}
    </div> : null}
  </div>;
}
