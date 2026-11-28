/**
 * TIO Perfumes · Books · Sales tax — ROUND L.31 M11 (owner 2026-11-27 22:54 CT "… liability … fully total and complete"). QuickBooks
 * "Sales tax": what ScentsX owes the State for a period and paying it.
 *   · Liability: 2100 Sales Tax Payable - Texas straight from the books (balance at the start, collected, paid, owed now) and the sales
 *     behind it by month — taxable vs exempt (resale certificate / export, never guessed — sales-invoice.service.ts).
 *   · The tax agency (Texas Comptroller of Public Accounts) is a ScentsX vendor, so paying it is a BILL coded to 2100 paid from the bank —
 *     the ONE bill + bill-payment engines (Dr 2100 / Cr A/P, then Dr A/P / Cr bank) — and the period's return is marked paid with it.
 *   · Returns: prepare a period (taxable / non-taxable / tax from the invoices), mark it filed, pay it.
 * No GL math here.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { CappedListNotice } from "../../components/CappedListNotice";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatUsdCents } from "../../lib/money";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { createVendorBill, payVendorBill, type BillPaymentMethod } from "../../api/accounting";
import { getAllAccounts } from "../../api/banking";
import { createScentsxVendor, getScentsxCompany } from "../../api/scentsx";
import {
  createSalesTaxAgency, fileSalesTaxReturn, getScentsxSalesTaxLiability, listSalesTaxAgencies, listSalesTaxReturns, markSalesTaxReturnPaid, prepareSalesTaxReturn,
  type SalesTaxAgency, type SalesTaxMonth, type SalesTaxReturn,
} from "../../api/sales-tax";
import { tr } from "./perfumeI18n";
import { ctl, DASH, usDate } from "./perfumeDocParts";

const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const money = (c: number | string) => formatUsdCents(Number(c));
const TX = "Texas Comptroller of Public Accounts";

export function PerfumeSalesTaxPanel() {
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const id = co.data?.company.id ?? "";
  const [from, setFrom] = useState(monthStart(todayCT()));
  const [to, setTo] = useState(todayCT());
  const liab = useQuery({ queryKey: ["scentsx", "sales-tax", from, to], queryFn: () => getScentsxSalesTaxLiability(from, to), enabled: Boolean(id) });
  const agencies = useQuery({ queryKey: ["scentsx", "sales-tax-agencies", id], queryFn: () => listSalesTaxAgencies(id), enabled: Boolean(id) });
  const returns = useQuery({ queryKey: ["scentsx", "sales-tax-returns", id], queryFn: () => listSalesTaxReturns(id), enabled: Boolean(id) });
  const [paying, setPaying] = useState<SalesTaxReturn | null>(null);
  const [busy, setBusy] = useState(false);
  const { pushToast } = useToast();
  const agency = agencies.data?.agencies[0] ?? null;
  const refresh = async () => { await Promise.all([liab.refetch(), agencies.refetch(), returns.refetch()]); };
  const setUpAgency = async () => {
    setBusy(true);
    try {
      const v = await createScentsxVendor(id, TX);
      const vendorId = v.id ?? v.vendor?.id;
      if (!vendorId) throw new Error("The agency vendor was created but its id did not come back");
      await createSalesTaxAgency(id, { name: TX, jurisdiction: "Texas", agency_vendor_id: vendorId });
      pushToast(`${TX} set up as ScentsX's sales tax agency`, "success"); await refresh();
    } catch (e) { pushToast(userFacingApiError(e, "Not set up"), "error"); } finally { setBusy(false); }
  };
  const prepare = async () => {
    if (!agency) return;
    setBusy(true);
    try { const r = await prepareSalesTaxReturn(id, { agency_id: agency.id, period_start: from, period_end: to }); pushToast(`Return ${usDate(from)}–${usDate(to)} · tax ${money(r.sales_tax_return.tax_owed_cents)}`, "success"); await refresh(); }
    catch (e) { pushToast(userFacingApiError(e, "Not prepared"), "error"); } finally { setBusy(false); }
  };
  const file = async (r: SalesTaxReturn) => {
    setBusy(true);
    try { await fileSalesTaxReturn(id, r.id); pushToast("Marked filed", "success"); await refresh(); } catch (e) { pushToast(userFacingApiError(e, "Not filed"), "error"); } finally { setBusy(false); }
  };
  if (co.isError) return <ListErrorState title={tr("scentsx.stx.co_error", "Couldn't load ScentsX")} status={0} message={(co.error as Error)?.message} onRetry={() => void co.refetch()} />;
  const L = liab.data;
  return (
    <div className="space-y-3" data-testid="perfume-sales-tax-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("scentsx.stx.title", "Sales tax")}>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <div className="text-card-title mr-2">{tr("scentsx.stx.title", "Sales tax")} · {co.data?.company.legal_name ?? "ScentsX"}</div>
          <label>{tr("scentsx.stx.from", "From")} <DatePicker aria-label="From" value={from} onChange={(v) => setFrom(v || monthStart(todayCT()))} /></label>
          <label>{tr("scentsx.stx.to", "To")} <DatePicker aria-label="To" value={to} onChange={(v) => setTo(v || todayCT())} /></label>
          {agency ? <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void prepare()} data-testid="scentsx-stx-prepare">{tr("scentsx.stx.prepare", "Prepare return for these dates")}</Button>
            : <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !id || agencies.isLoading} onClick={() => void setUpAgency()} data-testid="scentsx-stx-agency">{tr("scentsx.stx.set_agency", "Set up the Texas Comptroller as the agency")}</Button>}
        </div>
        {liab.isError ? <ListErrorState title={tr("scentsx.stx.error", "Couldn't load the sales tax")} status={0} message={(liab.error as Error)?.message} onRetry={() => void liab.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 gap-[10px] md:grid-cols-6">
              <KpiCard label={tr("scentsx.stx.opening", "Owed at the start")} number={money(L?.liability.opening_cents ?? 0)} disabled />
              <KpiCard label={tr("scentsx.stx.collected", "Tax collected")} number={money(L?.liability.collected_cents ?? 0)} disabled />
              <KpiCard label={tr("scentsx.stx.paid", "Tax paid")} number={money(L?.liability.paid_cents ?? 0)} disabled />
              <KpiCard label={tr("scentsx.stx.owed", "Owed now")} number={money(L?.liability.closing_cents ?? 0)} disabled />
              <KpiCard label={tr("scentsx.stx.taxable", "Taxable sales")} number={money(L?.sales.taxable_sales_cents ?? 0)} disabled />
              <KpiCard label={tr("scentsx.stx.exempt", "Exempt sales")} number={money(L?.sales.exempt_sales_cents ?? 0)} disabled />
            </div>
            {L ? <div className="text-xs text-[#5B6B7F]" data-testid="scentsx-stx-account">{`${tr("scentsx.stx.from_books", "From the books")}: ${formatAccountDisplayLabel({ account_number: L.account.account_number, account_name: L.account.account_name })}${agency ? ` · ${tr("scentsx.stx.agency", "Agency")}: ${agency.name}` : ""}`}</div> : null}
            {/* TABLE_DATE_OMIT: one row per month of sales — the month IS the row, not a dated event. */}
            <ParityTable<SalesTaxMonth> selectable
              cardTitle title={tr("scentsx.stx.by_month", "Sales by month")} rows={L?.sales.months ?? []} rowKey={(m) => m.month} loading={liab.isLoading || co.isLoading}
              storageKey="scentsx-stx-months-v1" exportFilename={`ScentsX sales tax ${from} to ${to}`} exportExcel emptyText="No invoices in these dates — ScentsX opened at $0."
              columns={[
                { className: "text-left", cellClass: "text-left font-semibold", key: "month", sortable: true, label: "Month", render: (m) => m.month, exportValue: (m) => m.month },
                { key: "invoices", sortable: true, label: "Invoices", kind: "number", cellClass: "text-right tabular-nums", render: (m) => String(m.invoices), exportValue: (m) => m.invoices },
                { key: "taxable_sales_cents", sortable: true, label: "Taxable sales", kind: "number", cellClass: "text-right tabular-nums", render: (m) => money(m.taxable_sales_cents), exportValue: (m) => m.taxable_sales_cents / 100 },
                { key: "exempt_sales_cents", sortable: true, label: "Exempt sales", kind: "number", cellClass: "text-right tabular-nums", render: (m) => money(m.exempt_sales_cents), exportValue: (m) => m.exempt_sales_cents / 100 },
                { key: "exempt_invoices", sortable: true, label: "Exempt invoices", kind: "number", cellClass: "text-right tabular-nums", render: (m) => String(m.exempt_invoices), exportValue: (m) => m.exempt_invoices },
                { key: "tax_cents", sortable: true, label: "Tax", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (m) => money(m.tax_cents), exportValue: (m) => m.tax_cents / 100 },
              ]}
            />
          </>
        )}
      </section>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("scentsx.stx.returns", "Sales tax returns")}>
        <CappedListNotice shown={returns.data?.returns.length ?? 0} total={returns.data?.total} limit={100} />
        {returns.isError ? <ListErrorState title={tr("scentsx.stx.returns_error", "Couldn't load the returns")} status={0} message={(returns.error as Error)?.message} onRetry={() => void returns.refetch()} /> : (
          <ParityTable<SalesTaxReturn> selectable
            cardTitle title={tr("scentsx.stx.returns", "Sales tax returns")} rows={returns.data?.returns ?? []} rowKey={(r) => r.id} loading={returns.isLoading} storageKey="scentsx-stx-returns-v1"
            exportFilename="ScentsX sales tax returns" exportExcel emptyText="No returns yet."
            columns={[
              { key: "period_end", sortable: true, label: "Period", cellClass: "text-right tabular-nums", render: (r) => `${usDate(r.period_start)} – ${usDate(r.period_end)}`, exportValue: (r) => `${r.period_start} to ${r.period_end}` },
              { className: "text-left", cellClass: "text-left", key: "agency_name", sortable: true, label: "Agency", render: (r) => r.agency_name, exportValue: (r) => r.agency_name },
              { key: "taxable_sales_cents", sortable: true, label: "Taxable", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.taxable_sales_cents), exportValue: (r) => Number(r.taxable_sales_cents) / 100 },
              { key: "non_taxable_sales_cents", sortable: true, label: "Non-taxable", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.non_taxable_sales_cents), exportValue: (r) => Number(r.non_taxable_sales_cents) / 100 },
              { key: "tax_owed_cents", sortable: true, label: "Tax owed", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.tax_owed_cents), exportValue: (r) => Number(r.tax_owed_cents) / 100 },
              { className: "text-left", cellClass: "text-left", key: "status", sortable: true, label: "Status", render: (r) => (r.status === "paid" ? `Paid${r.paid_bill_number ? ` · bill ${r.paid_bill_number}` : ""}` : r.status === "filed" ? "Filed" : "Open"), exportValue: (r) => r.status },
              { key: "act", sortable: false, label: "", render: (r) => (r.status === "paid" ? DASH : (
                <span className="inline-flex gap-1">
                  {r.status === "open" ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" disabled={busy} onClick={(e) => { e.stopPropagation(); void file(r); }} data-testid={`scentsx-stx-file-${r.id}`}>{tr("scentsx.stx.file", "Mark filed")}</Button> : null}
                  <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" disabled={!agency?.agency_vendor_id} onClick={(e) => { e.stopPropagation(); setPaying(r); }} data-testid={`scentsx-stx-pay-${r.id}`}>{tr("scentsx.stx.pay", "Pay sales tax")}</Button>
                </span>)) },
            ]}
          />
        )}
      </section>
      {paying && agency ? <PayTax companyId={id} agency={agency} ret={paying} accountId={L?.account.account_id ?? ""} onClose={() => setPaying(null)} onDone={async () => { setPaying(null); await refresh(); }} /> : null}
    </div>
  );
}

function PayTax({ companyId, agency, ret, accountId, onClose, onDone }: { companyId: string; agency: SalesTaxAgency; ret: SalesTaxReturn; accountId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const banks = useQuery({ queryKey: ["scentsx", "banks", companyId], queryFn: () => getAllAccounts(companyId) });
  const from = (banks.data?.accounts ?? []).filter((r) => r.ledger_account_id && /^(checking|savings|money_market)$/i.test(String(r.account_type ?? "")))
    .map((r) => ({ id: String(r.id), name: String(r.account_name ?? r.name ?? "") }));
  const [bankId, setBankId] = useState("");
  const [cents, setCents] = useState<number | null>(Number(ret.tax_owed_cents) || null);
  const [date, setDate] = useState(todayCT());
  const [method, setMethod] = useState<BillPaymentMethod>("ach");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const bank = from.find((b) => b.id === (bankId || from[0]?.id));
  const ok = Boolean(bank) && Boolean(accountId) && (cents ?? 0) > 0 && (method !== "check" || Boolean(ref.trim()));
  const go = async () => {
    setBusy(true);
    let billId: string | null = null;
    try {
      const label = `Texas sales tax ${ret.period_start} to ${ret.period_end}`;
      const b = await createVendorBill(companyId, { vendor_id: agency.agency_vendor_id!, bill_number: `STX-${ret.period_end.replace(/-/g, "")}-${Date.now() % 100000}`, bill_date: date, due_date: date,
        amount_cents: cents!, memo: label, lines: [{ account_id: accountId, amount_cents: cents!, description: label }] });
      billId = b.bill.id;
      await payVendorBill(billId, companyId, { payment_date: date, amount_cents: cents!, payment_method: method, from_bank_account_id: bank!.id,
        ...(method === "check" ? { check_number: ref.trim() } : ref.trim() ? { reference_number: ref.trim() } : {}), memo: label });
      await markSalesTaxReturnPaid(companyId, ret.id, billId);
      pushToast(`${tr("scentsx.stx.paid_toast", "Sales tax paid")} · ${money(cents!)}`, "success"); await onDone();
    } catch (e) {
      pushToast(userFacingApiError(e, billId ? "Bill recorded but the payment did not finish — pay it from Payables" : "Not paid"), "error");
      if (billId) await onDone();
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("scentsx.stx.pay", "Pay sales tax")} · ${usDate(ret.period_start)} – ${usDate(ret.period_end)}`} size="md" variant="drawer" data-testid="scentsx-stx-pay-modal">
      <div className="space-y-3 text-xs">
        <p>{`${tr("scentsx.stx.pay_help", "A bill to the agency coded to Sales Tax Payable, paid from the bank. Return tax owed")}: ${money(ret.tax_owed_cents)}`}</p>
        <label className="block">{tr("scentsx.stx.amount", "Amount")} *<MoneyInput className="block w-[160px]" ariaLabel="Sales tax amount" valueCents={cents} onChangeCents={setCents} /></label>
        <label className="block">{tr("scentsx.stx.date", "Date")}<DatePicker aria-label="Payment date" value={date} onChange={(v) => setDate(v || todayCT())} /></label>
        <label className="block">{tr("scentsx.stx.from_bank", "Paid from")}
          <select className={`${ctl} block w-full`} value={bank?.id ?? ""} onChange={(e) => setBankId(e.target.value)} data-testid="scentsx-stx-bank">
            {from.map((b) => <option key={b.id} value={b.id}>{formatAccountDisplayLabel({ account_name: b.name })}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <label className="block">{tr("scentsx.stx.method", "Method")}
            <select className={`${ctl} block`} value={method} onChange={(e) => setMethod(e.target.value as BillPaymentMethod)} data-testid="scentsx-stx-method">
              <option value="ach">{tr("scentsx.stx.ach", "ACH / WebFile")}</option><option value="check">{tr("scentsx.stx.check", "Check")}</option><option value="wire">{tr("scentsx.stx.wire", "Wire")}</option>
            </select>
          </label>
          <label className="block">{method === "check" ? `${tr("scentsx.stx.check_no", "Check no.")} *` : tr("scentsx.stx.reference", "Confirmation no.")}
            <input className={`${ctl} block w-[160px]`} aria-label={method === "check" ? "Check no." : "Confirmation no."} value={ref} onChange={(e) => setRef(e.target.value)} data-testid="scentsx-stx-ref" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("scentsx.stx.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void go()} data-testid="scentsx-stx-pay-save">{`${tr("scentsx.stx.pay", "Pay sales tax")} ${ok ? money(cents!) : ""}`}</Button>
        </div>
      </div>
    </Modal>
  );
}
