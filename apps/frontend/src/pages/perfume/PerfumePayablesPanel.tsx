/**
 * TIO Perfumes · Payables — owner 2026-11-27 15:05 CT "fully wire … liabilities … ap … vendors": the vendor side of Receivables, on
 * ScentsX LLC's own books. A/P aging by vendor (Current = not yet due · 1–30 · 31–60 · 61–90 · 90+ days past due), the vendor account
 * (open bills with their PO, every bill, every payment), paying a bill and the vendor statement.
 * Reads /api/v1/scentsx/payables/* (the books' own open balances — ties to the A/P aging and the A/P control account); pays through the
 * one bill engine (POST /api/v1/accounting/bills/:id/pay → Dr A/P / Cr the bank's ledger account) and prints the vendor statement from
 * /api/v1/accounting/vendors/:id/statement. Nothing here computes money of its own beyond adding up the books' open balances.
 * M4 (CC-2 ROUND L.34): multi-bill selection → one check pays several bills. The check engine enforces uniqueness per bank per check
 * number; for a batch, the first bill takes the entered check number and subsequent bills carry it as a reference_number (method=ach)
 * so each payment row is distinct. The UI groups them as "Check batch {checkNo}".
 */
import { accountIdByNumber, formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { payCheckBills } from "../../api/checks";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { openPrintableDocument } from "../../lib/openPrintableDocument";
import { payVendorBill, type BillPaymentMethod } from "../../api/accounting";
import { getVendorStatementOfAccount, type CounterpartyStatementLine } from "../../api/reports";
import { getScentsxPayablesAging, getScentsxVendorAccount, type ScentsxApAgingRow, type ScentsxApBill, type ScentsxApBuckets, type ScentsxApOpenBill,
  type ScentsxApPayment, type ScentsxBank } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { PerfumeVendorCredits } from "./PerfumeApplyVendorCredit";
import { PerfumeSupplierDeposits } from "./PerfumeSupplierDeposits";
import { ctl, DASH, DocLink, money, useOpenDoc, usDate } from "./perfumeDocParts";

const METHODS: Array<[BillPaymentMethod, string]> = [["check", "Check"], ["ach", "ACH"], ["wire", "Wire"], ["cash", "Cash"], ["credit_card", "Card"]];
const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

function ApStrip({ b, testId }: { b: ScentsxApBuckets; testId: string }) {
  return (
    <div className="grid grid-cols-2 gap-[10px] md:grid-cols-6" data-testid={testId}>
      <KpiCard label={tr("perfume.ap.current", "Current (not due)")} number={money(b.current)} disabled />
      <KpiCard label={tr("perfume.ap.d1_30", "1–30 past due")} number={money(b.d1_30)} disabled />
      <KpiCard label={tr("perfume.ap.d31_60", "31–60")} number={money(b.d31_60)} disabled />
      <KpiCard label={tr("perfume.ap.d61_90", "61–90")} number={money(b.d61_90)} disabled />
      <KpiCard label={tr("perfume.ap.d90", "90+")} number={money(b.d90_plus)} accent={b.d90_plus > 0 ? "#B91C1C" : undefined} disabled />
      <KpiCard label={tr("perfume.ap.balance", "A/P balance")} number={money(b.total)} disabled />
    </div>
  );
}

export function PerfumePayablesPanel() {
  const { openId, open } = useOpenDoc();
  const [asOf, setAsOf] = useState<string>(todayCT());
  const aging = useQuery({ queryKey: ["scentsx", "ap-aging", asOf], queryFn: () => getScentsxPayablesAging(asOf) });
  if (aging.isError) return <ListErrorState title={tr("perfume.ap.error", "Couldn't load payables")} status={0} message={(aging.error as Error)?.message} onRetry={() => void aging.refetch()} />;
  const d = aging.data;
  return (
    <div className="space-y-3" data-testid="perfume-payables-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.ap.aging", "A/P aging")}>
        <div className="text-card-title">{tr("perfume.ap.aging", "A/P aging by vendor")}</div>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label>{tr("perfume.ap.as_of", "As of")} <DatePicker aria-label={tr("perfume.ap.as_of", "As of")} value={asOf} onChange={(v) => setAsOf(v || todayCT())} /></label>
          <span className="text-[#64748B]">{tr("perfume.ap.basis", "Days past the bill's due date. Balances are the books' own open amounts (A/P control account).")}</span>
        </div>
        {d ? <ApStrip b={d.totals} testId="perfume-ap-totals" /> : null}
        <ParityTable<ScentsxApAgingRow> selectable
          rows={d?.vendors ?? []} rowKey={(r) => r.vendor_id ?? r.vendor} loading={aging.isLoading} storageKey="perfume-ap-aging-v1" exportFilename={`TIO payables ${asOf}`} exportExcel
          emptyText="No open bills — nothing owed to vendors on ScentsX's books." onRowClick={(r) => { if (r.vendor_id) open("payables", r.vendor_id); }}
          columns={[
            { className: "text-left", key: "vendor", label: "Vendor", sortable: true, render: (r) => r.vendor_id ? <span className="font-semibold"><DocLink tab="suppliers" id={r.vendor_id}>{r.vendor}</DocLink></span> : <span className="font-semibold">{r.vendor}</span>, exportValue: (r) => r.vendor },
            { key: "current", label: "Current", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.current), exportValue: (r) => r.current / 100 },
            { key: "d1_30", label: "1–30", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.d1_30), exportValue: (r) => r.d1_30 / 100 },
            { key: "d31_60", label: "31–60", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.d31_60), exportValue: (r) => r.d31_60 / 100 },
            { key: "d61_90", label: "61–90", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.d61_90), exportValue: (r) => r.d61_90 / 100 },
            { key: "d90_plus", label: "90+", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => <span className={r.d90_plus > 0 ? "text-[#B91C1C]" : ""}>{money(r.d90_plus)}</span>, exportValue: (r) => r.d90_plus / 100 },
            { key: "credits", label: "Vendor credits", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.credits ? <span className="text-[#166534]">{money(-r.credits)}</span> : money(0)), exportValue: (r) => -(r.credits ?? 0) / 100 },
            { key: "total", label: "A/P balance", kind: "number", sortable: true, cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.total), exportValue: (r) => r.total / 100 },
            { key: "bills", label: "Open bills", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => r.bills.toLocaleString("en-US") },
            { key: "oldest_past_due", label: "Most days past due", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.oldest_past_due > 0 ? r.oldest_past_due.toLocaleString("en-US") : DASH) },
          ]}
        />
      </section>
      {openId ? <VendorAccount key={openId} vendorId={openId} asOf={asOf} onChanged={() => void aging.refetch()} /> : null}
    </div>
  );
}

function VendorAccount({ vendorId, asOf, onChanged }: { vendorId: string; asOf: string; onChanged: () => void }) {
  const acct = useQuery({ queryKey: ["scentsx", "ap-vendor", vendorId, asOf], queryFn: () => getScentsxVendorAccount(vendorId, asOf) });
  const [paying, setPaying] = useState<string | null>(null);
  const [selectedBillKeys, setSelectedBillKeys] = useState<string[]>([]);
  const [showMultiPay, setShowMultiPay] = useState(false);
  if (acct.isError) return <ListErrorState title={tr("perfume.ap.vendor_error", "Couldn't load the vendor's account")} status={0} message={(acct.error as Error)?.message} onRetry={() => void acct.refetch()} />;
  const a = acct.data;
  if (!a) return null;
  const refresh = async () => { await acct.refetch(); onChanged(); };
  const bill = a.open_bills.find((b) => b.id === paying) ?? null;
  // selectedBillKeys uses rowKey `${r.id}-${r.open_cents}`; extract bill ids from keys
  const selectedBills = a.open_bills.filter((b) => selectedBillKeys.some((k) => k.startsWith(b.id + "-")));
  return (
    <section className="space-y-3 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-ap-vendor" aria-label={a.vendor.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{`${tr("perfume.ap.account", "Vendor account")} · ${a.vendor.name}`}</div>
        {a.vendor.perfume_vendor_id ? <DocLink tab="suppliers" id={a.vendor.perfume_vendor_id}>{tr("perfume.ap.open_vendor", "Supplier profile")}</DocLink> : null}
      </div>
      <ApStrip b={a.buckets} testId="perfume-ap-vendor-buckets" />
      <ParityTable<ScentsxApOpenBill> selectable
        cardTitle title={tr("perfume.ap.open_bills", "Open bills")} rows={a.open_bills} rowKey={(r) => `${r.id}-${r.open_cents}`} storageKey="perfume-ap-open-v1" exportFilename={`TIO open bills ${a.vendor.name}`} exportExcel
        emptyText="Nothing owed to this vendor."
        onSelectionChange={setSelectedBillKeys}
        columns={[
          { className: "text-left", key: "display_id", label: "Bill", render: (r) => <Link className="underline" to={`/accounting/bills/${encodeURIComponent(r.id)}`}>{r.display_id ?? r.id.slice(0, 8)}</Link>, exportValue: (r) => r.display_id ?? "" },
          { className: "text-left", key: "bill_number", sortable: true, label: "Vendor invoice", render: (r) => r.bill_number ?? DASH, exportValue: (r) => r.bill_number ?? "" },
          { className: "text-left", key: "po_number", label: "PO", render: (r) => (r.purchase_order_id ? <DocLink tab="purchases" id={r.purchase_order_id}>{r.po_number ?? "PO"}</DocLink> : DASH), exportValue: (r) => r.po_number ?? "" },
          { key: "bill_date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.bill_date), exportValue: (r) => r.bill_date },
          { key: "due_date", sortable: true, label: "Due", cellClass: "text-right tabular-nums", render: (r) => usDate(r.due_date), exportValue: (r) => r.due_date },
          { key: "past_due", label: "Days past due", kind: "number", cellClass: "text-right tabular-nums", render: (r) => (r.past_due > 0 ? <span className="text-[#B91C1C]">{r.past_due.toLocaleString("en-US")}</span> : DASH) },
          { key: "amount_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.amount_cents), exportValue: (r) => r.amount_cents / 100 },
          { key: "settled_cents", sortable: true, label: "Paid", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.settled_cents), exportValue: (r) => r.settled_cents / 100 },
          { key: "open_cents", sortable: true, label: "Balance", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.open_cents), exportValue: (r) => r.open_cents / 100 },
          { key: "pay", label: "", render: (r) => <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => { setPaying(r.id); setShowMultiPay(false); }} data-testid={`perfume-ap-pay-${r.id}`}>{tr("perfume.ap.pay", "Pay")}</Button> },
        ]}
      />
      {selectedBills.length >= 2 && !showMultiPay && !paying ? (
        <div className="flex items-center justify-between rounded-[3px] border border-[#D8E0E8] bg-[#F7F8FA] px-3 py-2 text-xs">
          <span>{selectedBills.length} {tr("perfume.ap.bills_selected", "bills selected")} · {money(selectedBills.reduce((s, b) => s + b.open_cents, 0))} {tr("perfume.ap.total", "total")}</span>
          <Button type="button" className="h-[28px] px-3 text-xs" onClick={() => { setPaying(null); setShowMultiPay(true); }} data-testid="perfume-ap-multi-pay-btn">
            {tr("perfume.ap.pay_selected", "Pay selected with one check")}
          </Button>
        </div>
      ) : null}
      {bill && !showMultiPay ? <PayBill key={bill.id} bill={bill} companyId={a.operating_company_id} banks={a.bank_accounts} onClose={() => setPaying(null)} onDone={async () => { setPaying(null); await refresh(); }} /> : null}
      {showMultiPay && selectedBills.length >= 1 ? (
        <PayMultipleBills
          bills={selectedBills}
          vendorId={a.vendor.id}
          companyId={a.operating_company_id}
          banks={a.bank_accounts}
          onClose={() => setShowMultiPay(false)}
          onDone={async () => { setShowMultiPay(false); setSelectedBillKeys([]); await refresh(); }}
        />
      ) : null}
      <PerfumeSupplierDeposits a={a} onDone={refresh} />
      <PerfumeVendorCredits credits={a.credits ?? []} openBills={a.open_bills} companyId={a.operating_company_id} vendorId={a.vendor.id} banks={a.bank_accounts} onDone={refresh} />
      <ParityTable<ScentsxApPayment> selectable
        cardTitle title={tr("perfume.ap.payments", "Payments")} rows={a.payments} rowKey={(r) => r.id} storageKey="perfume-ap-payments-v1" exportFilename={`TIO vendor payments ${a.vendor.name}`} exportExcel
        emptyText="No payments to this vendor."
        columns={[
          { key: "date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.date), exportValue: (r) => r.date },
          { className: "text-left", key: "bill", label: "Bill", render: (r) => <Link className="underline" to={`/accounting/bills/${encodeURIComponent(r.bill_id)}`}>{r.bill ?? r.bill_id.slice(0, 8)}</Link>, exportValue: (r) => r.bill ?? "" },
          { className: "text-left", key: "method", sortable: true, label: "Method", render: (r) => r.method, exportValue: (r) => r.method },
          { className: "text-left", key: "check_number", sortable: true, label: "Check / ref.", render: (r) => r.check_number ?? r.reference_number ?? DASH, exportValue: (r) => r.check_number ?? r.reference_number ?? "" },
          { className: "text-left", key: "paid_from", sortable: true, label: "Paid from", render: (r) => r.paid_from ?? DASH, exportValue: (r) => r.paid_from ?? "" },
          { key: "amount_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.amount_cents), exportValue: (r) => r.amount_cents / 100 },
          { className: "text-left", key: "voided", sortable: true, label: "Status", render: (r) => (r.voided ? "Voided" : "Paid"), exportValue: (r) => (r.voided ? "Voided" : "Paid") },
        ]}
      />
      <ParityTable<ScentsxApBill> selectable
        cardTitle title={tr("perfume.ap.bills", "Every bill")} rows={a.bills} rowKey={(r) => r.id} storageKey="perfume-ap-bills-v1" exportFilename={`TIO bills ${a.vendor.name}`} exportExcel emptyText="No bills."
        columns={[
          { className: "text-left", key: "display_id", label: "Bill", render: (r) => <Link className="underline" to={`/accounting/bills/${encodeURIComponent(r.id)}`}>{r.display_id ?? r.id.slice(0, 8)}</Link>, exportValue: (r) => r.display_id ?? "" },
          { className: "text-left", key: "bill_number", sortable: true, label: "Vendor invoice", render: (r) => r.bill_number ?? DASH, exportValue: (r) => r.bill_number ?? "" },
          { className: "text-left", key: "po_number", label: "PO", render: (r) => (r.purchase_order_id ? <DocLink tab="purchases" id={r.purchase_order_id}>{r.po_number ?? "PO"}</DocLink> : DASH), exportValue: (r) => r.po_number ?? "" },
          { key: "bill_date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.bill_date), exportValue: (r) => r.bill_date },
          { key: "amount_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.amount_cents), exportValue: (r) => r.amount_cents / 100 },
          { className: "text-left", key: "status", sortable: true, label: "Status", render: (r) => (r.voided ? "Voided" : r.status), exportValue: (r) => (r.voided ? "Voided" : r.status) },
        ]}
      />
      <VendorStatement companyId={a.operating_company_id} vendorId={a.vendor.id} />
    </section>
  );
}

/** Pay one bill through the one bill engine (Dr A/P / Cr the bank's ledger account). A check needs its number. */
function PayBill({ bill, companyId, banks, onClose, onDone }: { bill: ScentsxApOpenBill; companyId: string; banks: ScentsxBank[]; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [amount, setAmount] = useState<number | null>(bill.open_cents);
  const [method, setMethod] = useState<BillPaymentMethod>("check");
  const [bank, setBank] = useState<string>(accountIdByNumber(banks, "1000") || banks[0]?.id || "");
  const [date, setDate] = useState(todayCT());
  const [checkNo, setCheckNo] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const problem = !amount || amount <= 0 ? tr("perfume.ap.need_amount", "Type the amount")
    : amount > bill.open_cents ? tr("perfume.ap.too_much", "More than the bill's balance")
    : !bank ? tr("perfume.ap.need_bank", "Pick the account it is paid from")
    : method === "check" && !checkNo.trim() ? tr("perfume.ap.need_check", "Type the check number") : null;
  const save = async () => {
    if (problem || amount == null) return;
    setBusy(true);
    try {
      await payVendorBill(bill.id, companyId, { payment_date: date, amount_cents: amount, payment_method: method, from_bank_account_id: bank,
        ...(method === "check" ? { check_number: checkNo.trim() } : {}), ...(ref.trim() ? { reference_number: ref.trim() } : {}) });
      pushToast(`${bill.display_id ?? "Bill"} paid ${money(amount)}`, "success");
      await onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Payment not recorded"), "error"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-[3px] border border-[#D8E0E8] p-3" data-testid="perfume-ap-pay-form">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-[#1F2A44]">{`${tr("perfume.ap.pay_bill", "Pay bill")} ${bill.display_id ?? ""} · ${bill.bill_number ?? ""} · ${tr("perfume.ap.balance_short", "balance")} ${money(bill.open_cents)}`}</div>
        <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={onClose}>{tr("perfume.ap.close", "Close")}</Button>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label>{tr("perfume.ap.date", "Date")} <DatePicker aria-label={tr("perfume.ap.pay_date", "Payment date")} value={date} onChange={(v) => setDate(v || todayCT())} /></label>
        <label>{tr("perfume.ap.method", "Method")}
          <select className={`${ctl} block`} aria-label={tr("perfume.ap.method", "Method")} value={method} onChange={(e) => setMethod(e.target.value as BillPaymentMethod)} data-testid="perfume-ap-pay-method">
            {METHODS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label>{tr("perfume.ap.from", "Paid from")}
          <select className={`${ctl} block w-[220px]`} aria-label={tr("perfume.ap.from", "Paid from")} value={bank} onChange={(e) => setBank(e.target.value)} data-testid="perfume-ap-pay-bank">
            {banks.map((b) => <option key={b.id} value={b.id}>{`${b.account_number ?? ""} ${b.name}`.trim()}</option>)}
          </select>
        </label>
        <label>{tr("perfume.ap.amount", "Amount")} <MoneyInput className="block w-[130px]" ariaLabel="Payment amount" valueCents={amount} onChangeCents={setAmount} /></label>
        {method === "check"
          ? <label>{tr("perfume.ap.check_no", "Check no.")} <input className={`${ctl} block w-[120px]`} aria-label={tr("perfume.ap.check_no", "Check no.")} value={checkNo} onChange={(e) => setCheckNo(e.target.value)} data-testid="perfume-ap-pay-check" /></label>
          : null}
        <label>{tr("perfume.ap.reference", "Reference")} <input className={`${ctl} block w-[160px]`} aria-label={tr("perfume.ap.reference", "Reference")} value={ref} onChange={(e) => setRef(e.target.value)} data-testid="perfume-ap-pay-ref" /></label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-4 text-xs">
        <span className="text-[#64748B]">{tr("perfume.ap.one_bill", "One payment pays one bill.")}</span>
        {problem ? <span className="text-[#B91C1C]">{problem}</span> : null}
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || Boolean(problem)} onClick={() => void save()} data-testid="perfume-ap-pay-save">{tr("perfume.ap.record", "Record payment")}</Button>
      </div>
    </div>
  );
}

/** M4: One check pays several bills. The check# is used only on the first bill; subsequent bills carry it as reference_number to avoid
 * the unique-check-number constraint on accounting.bill_payments. The UI shows them together in the payments table as the same batch. */
export function PayMultipleBills({ bills, vendorId, companyId, banks, onClose, onDone }: { bills: ScentsxApOpenBill[]; vendorId: string; companyId: string; banks: ScentsxBank[]; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [bank, setBank] = useState<string>(accountIdByNumber(banks, "1000") || banks[0]?.id || "");
  const [date, setDate] = useState(todayCT());
  const [checkNo, setCheckNo] = useState("");
  const [busy, setBusy] = useState(false);
  const total = bills.reduce((s, b) => s + b.open_cents, 0);
  const problem = !checkNo.trim() ? tr("perfume.ap.need_check", "Type the check number")
    : !bank ? tr("perfume.ap.need_bank", "Pick the account it is paid from") : null;
  const save = async () => {
    if (problem) return;
    setBusy(true);
    try {
      // LEAD (QuickBooks bill payment): ONE check = ONE bill-payment document applied across the bills, through the check engine
      // (POST /api/v1/checks/pay-bills — check number reserved in the check register, Dr A/P / Cr bank once), so the bank statement's
      // single check line reconciles to a single book line. Never N separate payments with the number on the first only.
      await payCheckBills({ operating_company_id: companyId, payee_kind: "vendor", payee_id: vendorId, bank_account_id: bank, check_date: date,
        check_number: checkNo.trim(), applications: bills.map((b) => ({ bill_id: b.id, amount_cents: b.open_cents })) });
      pushToast(`Check ${checkNo.trim()} · ${money(total)} · pays ${bills.length} bill${bills.length > 1 ? "s" : ""}`, "success");
      await onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Payment not fully recorded — check the payments list"), "error"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-[#FAFBFF] p-3" data-testid="perfume-ap-multi-pay-form">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-[#1F2A44]">
          {tr("perfume.ap.pay_multiple_title", "Pay")} {bills.length} {tr("perfume.ap.bills_with_check", "bills with one check")} · {money(total)}
        </div>
        <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={onClose}>{tr("perfume.ap.close", "Close")}</Button>
      </div>
      <div className="text-xs text-[#64748B] space-y-0.5">
        {bills.map((b, i) => (
          <div key={b.id}>{i + 1}. {b.display_id ?? b.bill_number ?? "Bill (no number)"} {b.bill_number ? `· ${b.bill_number}` : ""} · {money(b.open_cents)}</div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label>{tr("perfume.ap.date", "Date")} <DatePicker aria-label={tr("perfume.ap.pay_date", "Payment date")} value={date} onChange={(v) => setDate(v || todayCT())} /></label>
        <label>{tr("perfume.ap.from", "Paid from")}
          <select className={`${ctl} block w-[220px]`} aria-label={tr("perfume.ap.from", "Paid from")} value={bank} onChange={(e) => setBank(e.target.value)} data-testid="perfume-ap-multi-bank">
            {banks.map((b) => <option key={b.id} value={b.id}>{formatAccountDisplayLabel({ account_name: b.name, account_number: b.account_number })}</option>)}
          </select>
        </label>
        <label>{tr("perfume.ap.check_no", "Check no.")} <input className={`${ctl} block w-[120px]`} aria-label={tr("perfume.ap.check_no", "Check no.")} value={checkNo} onChange={(e) => setCheckNo(e.target.value)} data-testid="perfume-ap-multi-check" /></label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-4 text-xs">
        <span className="text-[#64748B]">{tr("perfume.ap.multi_note", "One check, one payment applied to every bill listed.")}</span>
        {problem ? <span className="text-[#B91C1C]">{problem}</span> : null}
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || Boolean(problem)} onClick={() => void save()} data-testid="perfume-ap-multi-pay-save">{busy ? tr("perfume.ap.recording", "Recording…") : tr("perfume.ap.record_all", `Record check for ${bills.length} bills`)}</Button>
      </div>
    </div>
  );
}

type StmtRow = { key: string; date: string; reference: string; description: string; debit_cents: number; credit_cents: number; balance_cents: number; bold?: boolean };
/** The vendor statement from the books (opening balance, bills and payments with the running balance, closing balance), printable. */
function VendorStatement({ companyId, vendorId }: { companyId: string; vendorId: string }) {
  const first = () => `${new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }).slice(0, 4)}-01-01`;
  const [from, setFrom] = useState(first());
  const [to, setTo] = useState(todayCT());
  const q = useQuery({ queryKey: ["scentsx", "vendor-statement", vendorId, from, to], enabled: from <= to,
    queryFn: () => getVendorStatementOfAccount({ operating_company_id: companyId, vendor_id: vendorId, from_date: from, to_date: to }) });
  const s = q.data;
  const rows: StmtRow[] = s ? [
    { key: "open", date: s.from_date, reference: "", description: tr("perfume.stmt.opening", "Opening balance"), debit_cents: 0, credit_cents: 0, balance_cents: s.opening_balance_cents, bold: true },
    ...s.lines.map((l: CounterpartyStatementLine, i: number) => ({ key: `${l.link_id}-${i}`, date: l.date, reference: l.reference, description: l.description, debit_cents: l.debit_cents, credit_cents: l.credit_cents, balance_cents: l.running_balance_cents })),
    { key: "close", date: s.to_date, reference: "", description: tr("perfume.stmt.closing", "Closing balance"), debit_cents: 0, credit_cents: 0, balance_cents: s.closing_balance_cents, bold: true },
  ] : [];
  const print = `/api/v1/accounting/vendors/${encodeURIComponent(vendorId)}/statement.html?operating_company_id=${encodeURIComponent(companyId)}&from_date=${from}&to_date=${to}`;
  return (
    <div className="space-y-2 rounded-[3px] border border-[#D8E0E8] p-3" data-testid="perfume-ap-statement">
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <span className="font-semibold text-[#1F2A44]">{tr("perfume.ap.statement", "Vendor statement")}</span>
        <label>{tr("perfume.stmt.from", "From")} <DatePicker aria-label={tr("perfume.stmt.from", "From")} value={from} onChange={(v) => setFrom(v || first())} /></label>
        <label>{tr("perfume.stmt.to", "To")} <DatePicker aria-label={tr("perfume.stmt.to", "To")} value={to} onChange={(v) => setTo(v || todayCT())} /></label>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!s} onClick={() => openPrintableDocument(print)} data-testid="perfume-ap-statement-print">{tr("perfume.stmt.print", "Print / PDF")}</Button>
      </div>
      {q.isError ? <ListErrorState title={tr("perfume.stmt.error", "Couldn't load the statement")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : (
        <ParityTable<StmtRow> selectable
          rows={rows} rowKey={(r) => r.key} loading={q.isLoading} storageKey="perfume-ap-statement-v1" exportFilename={`TIO vendor statement ${from} to ${to}`} exportExcel emptyText="No statement."
          columns={[
            { key: "date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.date), exportValue: (r) => r.date },
            { className: "text-left", key: "reference", sortable: true, label: "Reference", render: (r) => r.reference || DASH, exportValue: (r) => r.reference },
            { className: "text-left", key: "description", label: "Description", render: (r) => <span className={r.bold ? "font-semibold" : ""}>{r.description}</span>, exportValue: (r) => r.description },
            { key: "debit_cents", sortable: true, label: "Payment / credit", kind: "number", cellClass: "text-right tabular-nums", render: (r) => (r.debit_cents ? money(r.debit_cents) : DASH), exportValue: (r) => r.debit_cents / 100 },
            { key: "credit_cents", sortable: true, label: "Bill", kind: "number", cellClass: "text-right tabular-nums", render: (r) => (r.credit_cents ? money(r.credit_cents) : DASH), exportValue: (r) => r.credit_cents / 100 },
            { key: "balance_cents", label: "Balance", kind: "number", cellClass: "text-right tabular-nums", render: (r) => <span className={r.bold ? "font-semibold" : ""}>{money(r.balance_cents)}</span>, exportValue: (r) => r.balance_cents / 100 },
          ]}
        />
      )}
    </div>
  );
}
