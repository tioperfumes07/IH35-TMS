import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createExpense, createVendorBill, listBills, listExpenses } from "../../api/accounting";
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

type CostChoice = "expense" | "bill" | null;
type Draft = { id: string; kind: CostChoice; date: string; vendorId: string; categoryId: string; paymentAccountId: string; invoiceNo: string; amount: string; error: string | null };
type DriverBillRow = { gross_amount_cents: number; status: string };

function blankDraft(): Draft {
  return { id: crypto.randomUUID(), kind: null, date: companyToday(), vendorId: "", categoryId: "", paymentAccountId: "", invoiceNo: "", amount: "", error: null };
}

export function LoadDetailCostsTab({ load, canEdit }: { load: LoadDetail; canEdit: boolean }) {
  const [drafts, setDrafts] = useState<Draft[]>([blankDraft()]);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const opco = load.operating_company_id;
  const expenses = useQuery({ queryKey: ["load-costs", "expenses", opco, load.id], queryFn: () => listExpenses(opco, { load_id: load.id, limit: 200 }) });
  const bills = useQuery({ queryKey: ["load-costs", "bills", opco, load.id], queryFn: () => listBills(opco, { load_id: load.id, limit: 200 }) });
  const driverBills = useQuery({ queryKey: ["load-costs", "driver-bills", opco, load.id], queryFn: () => apiRequest<{ driver_bills: DriverBillRow[] }>(`/api/v1/driver-finance/driver-bills?load_id=${encodeURIComponent(load.id)}&operating_company_id=${encodeURIComponent(opco)}`) });
  const vendors = useQuery({ queryKey: ["load-costs", "vendors", opco], queryFn: () => listVendors({ operating_company_id: opco, status: "active", limit: 5000 }) });
  const accounts = useQuery({ queryKey: ["load-costs", "accounts", opco], queryFn: () => listCatalogAccounts({ operating_company_id: opco, status: "active", postable_only: true }) });
  const savedExpenses = expenses.data?.rows ?? [];
  const savedBills = bills.data?.rows ?? [];
  const savedCount = savedExpenses.length + savedBills.length;
  const currency = load.currency_code === "MXN" ? "MXN" : "USD";
  const savedCosts = savedExpenses.filter((row) => row.status !== "void").reduce((sum, row) => sum + Number(row.total_amount_cents || 0), 0) + savedBills.filter((row) => row.status !== "voided").reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  const driverPay = (driverBills.data?.driver_bills ?? []).filter((row) => row.status !== "void").reduce((sum, row) => sum + Number(row.gross_amount_cents || 0), 0);
  const revenue = Number(load.rate_total_cents ?? 0);
  const chart = accounts.data?.accounts ?? [];
  const categories = chart.filter((row) => /expense|cost of goods/i.test(row.account_type));
  const paymentAccounts = chart.filter((row) => /asset/i.test(row.account_type));
  const draftTotal = drafts.reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.amount || 0) * 100)), 0);
  const displayNumber = (index: number) => savedCount + index === 0 ? load.load_number : `${load.load_number}-${savedCount + index}`;
  const update = (id: string, patch: Partial<Draft>) => setDrafts((rows) => rows.map((row) => row.id === id ? { ...row, ...patch, error: null } : row));

  const save = useMutation({
    mutationFn: async () => {
      const errors = new Map<string, string>();
      for (const [index, row] of drafts.entries()) {
        const amountCents = Math.round(Number(row.amount) * 100);
        const missing = !row.kind ? "Choose Expense or Bill." : !row.vendorId ? "Vendor is required." : !row.categoryId ? "Category is required." : !(amountCents > 0) ? "Amount must be greater than zero." : row.kind === "expense" && !row.paymentAccountId ? "Paid with is required." : row.kind === "bill" && !row.invoiceNo.trim() ? "Vendor invoice number is required." : null;
        if (missing) { errors.set(row.id, missing); continue; }
        try {
          if (row.kind === "expense") {
            await createExpense(opco, { category_account_id: row.categoryId, expense_date: row.date, amount_cents: amountCents, payment_account_uuid: row.paymentAccountId, vendor_uuid: row.vendorId, load_id: load.id, expense_number: displayNumber(index), memo: `Load cost · ${load.load_number}`, is_sample_data: false });
          } else {
            await createVendorBill(opco, { vendor_id: row.vendorId, bill_number: row.invoiceNo.trim(), display_id: displayNumber(index), bill_date: row.date, amount_cents: amountCents, coa_account_id: row.categoryId, driver_id: load.assigned_primary_driver_id ?? undefined, memo: `Load cost · ${load.load_number}`, is_sample_data: false, lines: [{ account_id: row.categoryId, amount_cents: amountCents, description: `Load cost · ${load.load_number}`, section: "A", load_id: load.id }] }, { idempotencyKey: generateIdempotencyKey() });
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
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-gray-600">Every cost is born attached to this load. You never type the number.</p><div className="flex gap-2"><Button data-testid="load-costs-save-all" type="button" size="sm" variant="secondary" disabled={save.isPending} onClick={() => save.mutate()}>Save all</Button><Button data-testid="load-costs-add-top" type="button" size="sm" onClick={() => setDrafts((rows) => [...rows, blankDraft()])}>+ Add another cost</Button></div></div>
      {drafts.map((row, index) => <article key={row.id} data-testid="load-costs-entry" className="overflow-hidden rounded-sm border border-gray-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2"><span className="font-mono text-xs font-semibold">{displayNumber(index)}</span><div className="flex overflow-hidden rounded-sm border border-gray-200"><button data-testid="load-cost-toggle-expense" type="button" className={`px-3 py-1 text-xs font-semibold ${row.kind === "expense" ? "bg-slate-700 text-white" : "bg-white text-gray-600"}`} onClick={() => update(row.id, { kind: "expense" })}>Expense · paid now</button><button data-testid="load-cost-toggle-bill" type="button" className={`px-3 py-1 text-xs font-semibold ${row.kind === "bill" ? "bg-slate-700 text-white" : "bg-white text-gray-600"}`} onClick={() => update(row.id, { kind: "bill" })}>Bill · owed</button></div><span data-testid="load-cost-status" className="text-xs text-gray-500">new — not saved</span></header>
        <div className="grid gap-3 p-3 md:grid-cols-5">
          <Field label="Date"><DatePicker data-testid="load-cost-field-date" className="mt-1 h-8 w-full" value={row.date} onChange={(value) => update(row.id, { date: value })} /></Field>
          <Field label="Vendor"><select data-testid="load-cost-field-vendor" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={row.vendorId} onChange={(e) => update(row.id, { vendorId: e.target.value })}><option value="">Select vendor</option>{(vendors.data?.vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
          <Field label="Category"><select data-testid="load-cost-field-category" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={row.categoryId} onChange={(e) => update(row.id, { categoryId: e.target.value })}><option value="">Select category</option>{categories.map((a) => <option key={a.id} value={a.id}>{a.account_number ? `${a.account_number} · ` : ""}{a.account_name}</option>)}</select></Field>
          {row.kind === "bill" ? <Field label="Vendor invoice no."><input data-testid="load-cost-field-vendor-invoice" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="off the paper" value={row.invoiceNo} onChange={(e) => update(row.id, { invoiceNo: e.target.value })} /></Field> : <Field label="Paid with"><select data-testid="load-cost-field-paid-with" className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={row.paymentAccountId} onChange={(e) => update(row.id, { paymentAccountId: e.target.value })}><option value="">Select bank or card</option>{paymentAccounts.map((a) => <option key={a.id} value={a.id}>{a.account_number ? `${a.account_number} · ` : ""}{a.account_name}</option>)}</select></Field>}
          <Field label="Amount"><div data-testid="load-cost-field-amount"><MoneyInput className="mt-1 h-8 w-full" valueCents={row.amount ? Math.round(Number(row.amount) * 100) : null} onChangeCents={(cents) => update(row.id, { amount: cents == null ? "" : String(cents / 100) })} /></div></Field>
        </div>
        <p data-testid="load-cost-hint" className={`px-3 pb-3 text-xs ${row.error ? "text-red-700" : "text-gray-500"}`}>{row.error ?? (row.kind === "bill" ? "Bill · owed credits Accounts Payable. The vendor invoice number is never filled in for you, because it stops us paying the same bill twice." : row.kind === "expense" ? "Expense · paid now debits the selected category and credits the selected bank or card." : "Choose whether this cost was paid now or is owed.")}</p>
      </article>)}
      <div className="flex gap-2"><Button data-testid="load-costs-add-bottom" type="button" size="sm" onClick={() => setDrafts((rows) => [...rows, blankDraft()])}>+ Add another cost</Button><Link data-testid="load-costs-receipt-photo" className="inline-flex h-8 items-center rounded-sm border border-slate-700 px-3 text-xs font-semibold text-slate-700" to={`/accounting/receipts?load_id=${encodeURIComponent(load.id)}`}>+ From a receipt photo</Link></div>
    </section> : null}
    <section data-testid="load-costs-totals" className="overflow-hidden rounded-sm border border-gray-200 bg-gray-50 text-xs"><Total label="Line haul revenue" value={formatMoneyCents(revenue, currency)} /><Total label={`Costs on this load · ${savedCount} saved`} value={formatMoneyCents(savedCosts + draftTotal, currency)} /><Total label="Driver pay" value={formatMoneyCents(driverPay, currency)} /><Total label={`Approximate margin on ${load.load_number}`} value={formatMoneyCents(revenue - savedCosts - driverPay - draftTotal, currency)} strong /></section>
    <section data-testid="load-costs-bank-panel" className="rounded-sm border border-gray-200 bg-white"><h3 className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase text-gray-600">WHAT THE BANK WILL DO WITH THESE</h3><p className="px-3 py-3 text-xs text-gray-600">Paid expenses are offered for bank matching: saved · matched or saved · waiting for the bank. Bills match when their payment lands.</p></section>
    {savedCount ? <section className="rounded-sm border border-gray-200 bg-white p-3 text-xs text-gray-600">
      <h3 className="mb-2 font-semibold uppercase">Saved costs</h3>
      {savedExpenses.map((row) => <div key={row.id} className="flex justify-between border-b border-gray-100 py-2" data-cost-driver-column="driver_uuid"><EntityLink kind="expense" id={row.id} label={row.expense_number ?? "Expense"} /><span>{formatMoneyCents(Number(row.total_amount_cents), currency)} · {row.matched_bank_transaction_id ? "saved · matched to bank" : "saved · waiting for the bank"}</span></div>)}
      {savedBills.map((row) => <div key={row.id} className="flex justify-between border-b border-gray-100 py-2" data-cost-driver-column="driver_id"><EntityLink kind="bill" id={row.id} label={row.bill_number ?? "Bill"} /><span>{formatMoneyCents(Number(row.amount_cents), currency)} · saved</span></div>)}
      <Link className="mt-2 inline-block font-semibold underline" to={`/accounting/expenses?load_id=${encodeURIComponent(load.id)}`}>Open saved costs</Link>
    </section> : <div className="rounded-sm border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">No costs on this load yet.</div>}
    <p className="text-xs text-gray-500">Approximate · before settlement</p>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-xs font-semibold uppercase text-gray-500">{label}{children}</label>; }
function Total({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`flex justify-between border-b border-gray-200 px-3 py-2 last:border-b-0 ${strong ? "bg-slate-100 font-semibold text-slate-700" : ""}`}><span>{label}</span><span>{value}</span></div>; }
