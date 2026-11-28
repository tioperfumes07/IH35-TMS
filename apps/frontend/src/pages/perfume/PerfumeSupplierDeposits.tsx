/**
 * TIO Perfumes · Payables · Supplier deposits — ROUND L.31 M6 (owner 2026-11-27 19:38 CT "AP … BILL PAYMENTS … ALL FULLY COMPLETELY DONE").
 * Money paid to a supplier BEFORE the goods arrive, the QuickBooks way, on the engines ScentsX already posts through (the expense writer
 * requires a truck unit — GO-19-1b — so it is not ScentsX's path):
 *   · "+ Supplier deposit": a deposit bill to the vendor coded to 1310 Supplier Deposits (Dr 1310 / Cr A/P), paid at once from the bank
 *     (Dr A/P / Cr bank) — net: the deposit sits in 1310, nothing left owed.
 *   · "Use deposit on a bill": when the goods bill comes, a vendor credit on 1310 for the amount used (Dr A/P / Cr 1310), applied to that
 *     bill — the bill shows only what is still owed and 1310 goes back down. Never more than what is still available.
 * No GL math here.
 */
import { useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { accountIdByNumber, formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { createVendorBill, payVendorBill, type BillPaymentMethod } from "../../api/accounting";
import { applyVendorCredit, createVendorCredit } from "../../api/vendor-credits";
import type { ScentsxVendorAccount } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { ctl, money, usDate } from "./perfumeDocParts";

const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

export function PerfumeSupplierDeposits({ a, onDone }: { a: ScentsxVendorAccount; onDone: () => Promise<void> }) {
  const [paying, setPaying] = useState(false);
  const [using, setUsing] = useState(false);
  const d = a.deposits;
  if (!d?.account_id) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-[#D8E0E8] p-3 text-xs" data-testid="perfume-ap-deposits">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-card-title">{tr("perfume.ap.deposits", "Supplier deposits")}</span>
        <span className="tabular-nums">{`${tr("perfume.ap.dep_paid", "Paid")} ${money(d.paid_cents)} · ${tr("perfume.ap.dep_used", "used on bills")} ${money(d.used_cents)} · `}
          <b data-testid="perfume-ap-deposit-available">{`${tr("perfume.ap.dep_available", "available")} ${money(d.available_cents)}`}</b></span>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="h-[30px] px-3 text-xs" disabled={d.available_cents <= 0 || !a.open_bills.length} onClick={() => setUsing(true)} data-testid="perfume-ap-deposit-use">
          {tr("perfume.ap.dep_use", "Use deposit on a bill")}</Button>
        <Button type="button" className="h-[30px] px-3 text-xs" disabled={!a.bank_accounts.length} onClick={() => setPaying(true)} data-testid="perfume-ap-deposit-new">{tr("perfume.ap.dep_new", "+ Supplier deposit")}</Button>
      </div>
      {paying ? <PayDeposit a={a} depositAccountId={d.account_id} onClose={() => setPaying(false)} onDone={async () => { setPaying(false); await onDone(); }} /> : null}
      {using ? <UseDeposit a={a} depositAccountId={d.account_id} available={d.available_cents} onClose={() => setUsing(false)} onDone={async () => { setUsing(false); await onDone(); }} /> : null}
    </div>
  );
}

function PayDeposit({ a, depositAccountId, onClose, onDone }: { a: ScentsxVendorAccount; depositAccountId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [cents, setCents] = useState<number | null>(null);
  const [date, setDate] = useState(todayCT());
  const [bank, setBank] = useState(accountIdByNumber(a.bank_accounts, "1000") || a.bank_accounts[0]?.id || "");
  const [method, setMethod] = useState<BillPaymentMethod>("check");
  const [ref, setRef] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = (cents ?? 0) > 0 && Boolean(bank) && (method !== "check" || Boolean(ref.trim()));
  const go = async () => {
    setBusy(true);
    let billId: string | null = null;
    try {
      const label = memo.trim() || `${tr("perfume.ap.dep_label", "Supplier deposit")} ${usDate(date)}`;
      const b = await createVendorBill(a.operating_company_id, { vendor_id: a.vendor.id, bill_number: `DEP-${date.replace(/-/g, "")}-${Date.now() % 100000}`, bill_date: date, due_date: date,
        amount_cents: cents!, memo: label, lines: [{ account_id: depositAccountId, amount_cents: cents!, description: label }] });
      billId = b.bill.id;
      await payVendorBill(billId, a.operating_company_id, { payment_date: date, amount_cents: cents!, payment_method: method, from_bank_account_id: bank,
        ...(method === "check" ? { check_number: ref.trim() } : ref.trim() ? { reference_number: ref.trim() } : {}), memo: label });
      pushToast(`${tr("perfume.ap.dep_paid_toast", "Deposit paid")} · ${money(cents!)} · ${a.vendor.name}`, "success"); await onDone();
    } catch (e) {
      // The deposit bill may exist unpaid if only the payment failed — it then shows in the open bills, payable the normal way.
      pushToast(userFacingApiError(e, billId ? "Deposit recorded but NOT paid — pay it from the open bills" : "Deposit not recorded"), "error");
      if (billId) await onDone();
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("perfume.ap.dep_new_title", "Supplier deposit")} · ${a.vendor.name}`} size="sm" variant="drawer" data-testid="perfume-ap-deposit-modal">
      <div className="space-y-3 text-xs">
        <p>{tr("perfume.ap.dep_help", "Money paid before the goods arrive. It waits in Supplier Deposits until you use it on the supplier's bill.")}</p>
        <label className="block">{tr("perfume.ap.amount", "Amount")} *<MoneyInput className="block w-[160px]" ariaLabel="Deposit amount" valueCents={cents} onChangeCents={setCents} /></label>
        <label className="block">{tr("perfume.ap.date", "Date")}<DatePicker aria-label="Deposit date" value={date} onChange={(v) => setDate(v || todayCT())} /></label>
        <label className="block">{tr("perfume.ap.from", "Paid from")}
          <select className={`${ctl} block w-full`} value={bank} onChange={(e) => setBank(e.target.value)} data-testid="perfume-ap-deposit-bank">
            {a.bank_accounts.map((b) => <option key={b.id} value={b.id}>{formatAccountDisplayLabel({ account_name: b.name, account_number: b.account_number })}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <label className="block">{tr("perfume.ap.method", "Method")}
            <select className={`${ctl} block`} value={method} onChange={(e) => setMethod(e.target.value as BillPaymentMethod)} data-testid="perfume-ap-deposit-method">
              <option value="check">{tr("perfume.ap.check", "Check")}</option><option value="ach">{tr("perfume.ap.ach", "ACH / transfer")}</option><option value="wire">{tr("perfume.ap.wire", "Wire")}</option>
            </select>
          </label>
          <label className="block">{method === "check" ? `${tr("perfume.ap.check_no", "Check no.")} *` : tr("perfume.ap.reference", "Reference")}
            <input className={`${ctl} block w-[140px]`} aria-label={method === "check" ? "Check no." : "Reference"} value={ref} onChange={(e) => setRef(e.target.value)} data-testid="perfume-ap-deposit-ref" />
          </label>
        </div>
        <label className="block">{tr("perfume.ap.memo", "Memo (PO / order it is for)")}<input className={`${ctl} block w-full`} aria-label="Deposit memo" value={memo} onChange={(e) => setMemo(e.target.value)} data-testid="perfume-ap-deposit-memo" /></label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.ap.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void go()} data-testid="perfume-ap-deposit-save">{tr("perfume.ap.dep_pay", "Pay deposit")}</Button>
        </div>
      </div>
    </Modal>
  );
}

function UseDeposit({ a, depositAccountId, available, onClose, onDone }: { a: ScentsxVendorAccount; depositAccountId: string; available: number; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [billId, setBillId] = useState(a.open_bills[0]?.id ?? "");
  const bill = a.open_bills.find((b) => b.id === billId);
  const max = Math.min(available, bill?.open_cents ?? 0);
  const [cents, setCents] = useState<number | null>(max);
  const [busy, setBusy] = useState(false);
  const ok = Boolean(bill) && (cents ?? 0) > 0 && (cents ?? 0) <= max;
  const go = async () => {
    setBusy(true);
    try {
      const vc = await createVendorCredit(a.operating_company_id, { vendor_id: a.vendor.id, issue_date: todayCT(), amount_cents: cents!, coa_account_id: depositAccountId,
        notes: `Supplier deposit used on ${bill!.bill_number ?? bill!.display_id ?? "bill"}` });
      await applyVendorCredit(a.operating_company_id, vc.id, [{ bill_id: bill!.id, applied_cents: cents!, idempotency_key: `dep-${vc.id}-${bill!.id}` }]);
      pushToast(`${money(cents!)} ${tr("perfume.ap.dep_used_toast", "of the deposit used on")} ${bill!.bill_number ?? bill!.display_id ?? ""}`, "success"); await onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Deposit not applied"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={tr("perfume.ap.dep_use", "Use deposit on a bill")} size="sm" data-testid="perfume-ap-deposit-use-modal">
      <div className="space-y-3 text-xs">
        <p>{`${money(available)} ${tr("perfume.ap.dep_available_long", "of deposits available")}`}</p>
        <label className="block">{tr("perfume.ap.bill", "Bill")}
          <select className={`${ctl} block w-full`} value={billId} onChange={(e) => { setBillId(e.target.value); setCents(Math.min(available, a.open_bills.find((b) => b.id === e.target.value)?.open_cents ?? 0)); }} data-testid="perfume-ap-deposit-use-bill">
            {a.open_bills.map((b) => <option key={b.id} value={b.id}>{`${b.bill_number ?? b.display_id ?? b.id.slice(0, 8)} · ${usDate(b.bill_date)} · open ${money(b.open_cents)}`}</option>)}
          </select>
        </label>
        <label className="block">{tr("perfume.ap.amount", "Amount")}<MoneyInput className="block w-[160px]" ariaLabel="Deposit to use" valueCents={cents} onChangeCents={setCents} /></label>
        {(cents ?? 0) > max ? <p className="text-[#B91C1C]">{`${tr("perfume.ap.max", "At most")} ${money(max)}`}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.ap.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void go()} data-testid="perfume-ap-deposit-use-confirm">{tr("perfume.ap.dep_apply", "Apply deposit")}</Button>
        </div>
      </div>
    </Modal>
  );
}
