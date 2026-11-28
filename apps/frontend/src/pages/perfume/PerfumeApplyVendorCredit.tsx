/**
 * TIO Perfumes · Payables · vendor credits — LEAD item 26 (owner 15:05 CT "fully wire … AP"). A vendor credit (goods returned after billing,
 * #29960) is applied to an open bill of the same vendor through the ONE vendor-credit apply engine (POST /api/v1/accounting/vendor-credits/
 * :id/apply — vendor identity check, row lock, over-apply refusal, idempotency). No new GL math: the bill's balance falls by the amount
 * applied, the credit's unapplied amount falls with it. Pop-up per owner 17:25 CT.
 * Vendor refund (owner 2026-11-27 22:54 CT "all and total wiring … ar ap") — the vendor pays the credit back instead: "Refund received"
 * records it into a bank or cash account (POST /api/v1/accounting/vendor-refunds: Dr that account / Cr A/P), listed under it, voidable.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { createVendorRefund, listVendorRefunds, voidVendorRefund, type VendorRefund } from "../../api/vendor-refunds";
import type { RefundMethod } from "../../api/customer-refunds";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { applyVendorCredit } from "../../api/vendor-credits";
import type { ScentsxApCredit, ScentsxApOpenBill, ScentsxBank } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { ctl, DASH, money, usDate } from "./perfumeDocParts";

const METHOD_LABEL: Record<RefundMethod, string> = { check: "Check", ach: "ACH", wire: "Wire", card: "Card", cash: "Cash" };
/** Where a vendor's refund can land: ScentsX's bank and cash accounts (never the credit card). */
const REFUND_TO_TYPES = /^(checking|savings|money_market|cash_on_hand|petty_cash)$/i;
const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

export function PerfumeVendorCredits({ credits, openBills, companyId, vendorId, banks, onDone }: { credits: ScentsxApCredit[]; openBills: ScentsxApOpenBill[]; companyId: string; vendorId?: string; banks?: ScentsxBank[]; onDone: () => Promise<void> }) {
  const [applying, setApplying] = useState<ScentsxApCredit | null>(null);
  const [refunding, setRefunding] = useState<ScentsxApCredit | null>(null);
  const [voiding, setVoiding] = useState<VendorRefund | null>(null);
  const refunds = useQuery({ queryKey: ["scentsx", "vendor-refunds", vendorId], queryFn: () => listVendorRefunds(companyId, { vendor_id: vendorId }), enabled: Boolean(vendorId && companyId) });
  const refundRows = refunds.data?.refunds ?? [];
  const refundTo = (banks ?? []).filter((b) => REFUND_TO_TYPES.test(b.account_type ?? ""));
  const after = async () => { setApplying(null); setRefunding(null); setVoiding(null); await refunds.refetch(); await onDone(); };
  return (
    <>
      <ParityTable<ScentsxApCredit> selectable
        cardTitle title={tr("perfume.ap.credits", "Vendor credits")} rows={credits} rowKey={(r) => `${r.id}-${r.unapplied_cents}`} storageKey="perfume-ap-credits-v1" exportFilename="TIO vendor credits" exportExcel
        emptyText="No vendor credits."
        columns={[
          { className: "text-left", key: "display_id", sortable: true, label: "Credit", render: (r) => r.display_id, exportValue: (r) => r.display_id },
          { key: "issue_date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.issue_date), exportValue: (r) => r.issue_date },
          { className: "text-left", key: "notes", sortable: true, label: "Memo", render: (r) => r.notes ?? DASH, exportValue: (r) => r.notes ?? "" },
          { key: "amount_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.amount_cents), exportValue: (r) => r.amount_cents / 100 },
          { key: "applied_cents", sortable: true, label: "Applied", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.applied_cents), exportValue: (r) => r.applied_cents / 100 },
          { key: "unapplied_cents", sortable: true, label: "Left to apply", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.unapplied_cents), exportValue: (r) => r.unapplied_cents / 100 },
          { key: "apply", label: "", render: (r) => (r.unapplied_cents > 0 ? (
            <span className="inline-flex gap-1">
              {openBills.length ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => setApplying(r)} data-testid={`perfume-ap-apply-credit-${r.id}`}>{tr("perfume.ap.apply_credit", "Apply to a bill")}</Button> : null}
              {vendorId && refundTo.length ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => setRefunding(r)} data-testid={`perfume-ap-refund-credit-${r.id}`}>{tr("perfume.ap.refund_received", "Refund received")}</Button> : null}
            </span>) : DASH) },
        ]}
      />
      {refundRows.length ? (
        <ParityTable<VendorRefund> selectable
          cardTitle title={tr("perfume.ap.refunds", "Refunds received")} rows={refundRows} rowKey={(r) => r.id} storageKey="perfume-ap-refunds-v1" exportFilename="TIO vendor refunds" exportExcel
          emptyText="No vendor refunds."
          columns={[
            { className: "text-left", cellClass: "text-left font-semibold", key: "display_id", sortable: true, label: "Refund", render: (r) => r.display_id, exportValue: (r) => r.display_id },
            { key: "refund_date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.refund_date), exportValue: (r) => r.refund_date },
            { className: "text-left", cellClass: "text-left", key: "vendor_credit_display_id", sortable: true, label: "Vendor credit", render: (r) => r.vendor_credit_display_id ?? DASH, exportValue: (r) => r.vendor_credit_display_id ?? "" },
            { className: "text-left", cellClass: "text-left", key: "method", sortable: true, label: "Paid by", render: (r) => `${METHOD_LABEL[r.method]}${r.reference ? ` ${r.reference}` : ""}`, exportValue: (r) => `${r.method} ${r.reference ?? ""}`.trim() },
            { className: "text-left", cellClass: "text-left", key: "bank_account_name", sortable: true, label: "Into", render: (r) => r.bank_account_name ?? DASH, exportValue: (r) => r.bank_account_name ?? "" },
            { key: "amount_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.amount_cents), exportValue: (r) => r.amount_cents / 100 },
            { className: "text-left", cellClass: "text-left", key: "voided_at", sortable: true, label: "Status", render: (r) => (r.voided_at ? `Voided · ${r.void_reason ?? ""}` : "Received"), exportValue: (r) => (r.voided_at ? "voided" : "received") },
            { key: "void", sortable: false, label: "", render: (r) => (r.voided_at ? DASH
              : <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => setVoiding(r)} data-testid={`perfume-ap-refund-void-${r.id}`}>{tr("perfume.ap.void", "Void")}</Button>) },
          ]}
        />
      ) : null}
      {refunding ? <ReceiveRefund credit={refunding} banks={refundTo} companyId={companyId} onClose={() => setRefunding(null)} onDone={after} /> : null}
      {voiding ? <VoidRefund refund={voiding} companyId={companyId} onClose={() => setVoiding(null)} onDone={after} /> : null}
      {applying ? <ApplyCredit credit={applying} openBills={openBills} companyId={companyId} onClose={() => setApplying(null)} onDone={async () => { setApplying(null); await onDone(); }} /> : null}
    </>
  );
}

function ApplyCredit({ credit, openBills, companyId, onClose, onDone }: { credit: ScentsxApCredit; openBills: ScentsxApOpenBill[]; companyId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [billId, setBillId] = useState(openBills[0]?.id ?? "");
  const bill = useMemo(() => openBills.find((b) => b.id === billId) ?? null, [openBills, billId]);
  const cap = bill ? Math.min(credit.unapplied_cents, bill.open_cents) : 0;
  const [amount, setAmount] = useState<number | null>(cap || null);
  const [busy, setBusy] = useState(false);
  // One key per attempt: a double-click or a retry after a timeout applies once (uq_vendor_credit_app_idempotency).
  const [key] = useState(() => `perfume-ap-${credit.id}-${Date.now()}`);
  const ok = bill && amount != null && amount > 0 && amount <= cap;
  const apply = async () => {
    if (!ok || !bill) return;
    setBusy(true);
    try {
      await applyVendorCredit(companyId, credit.id, [{ bill_id: bill.id, applied_cents: amount!, idempotency_key: key }]);
      pushToast(`${credit.display_id}: ${money(amount!)} applied to ${bill.display_id ?? "the bill"}`, "success");
      await onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not applied"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("perfume.ap.apply_title", "Apply vendor credit")} ${credit.display_id}`} size="sm" data-testid="perfume-ap-apply-modal">
      <div className="space-y-3 text-xs">
        <p>{`${tr("perfume.ap.left", "Left to apply")}: ${money(credit.unapplied_cents)}`}</p>
        <label className="block">{tr("perfume.ap.to_bill", "Apply to bill")}
          <select className={`${ctl} block w-full`} value={billId} data-testid="perfume-ap-apply-bill"
            onChange={(e) => { setBillId(e.target.value); const b = openBills.find((x) => x.id === e.target.value); setAmount(b ? Math.min(credit.unapplied_cents, b.open_cents) : null); }}>
            {openBills.map((b) => <option key={b.id} value={b.id}>{`${b.display_id ?? b.id.slice(0, 8)} · ${b.bill_number ?? ""} · balance ${money(b.open_cents)}`}</option>)}
          </select>
        </label>
        <label className="block">{tr("perfume.ap.apply_amount", "Amount")}
          <MoneyInput className="block w-[140px]" ariaLabel="Credit amount to apply" valueCents={amount} onChangeCents={setAmount} />
        </label>
        {amount != null && amount > cap ? <p className="text-[#B91C1C]" role="alert">{`${tr("perfume.ap.over", "At most")} ${money(cap)} — ${tr("perfume.ap.over_why", "the smaller of the credit left and the bill's balance.")}`}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.cat.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void apply()} data-testid="perfume-ap-apply-confirm">{tr("perfume.ap.apply_confirm", "Apply credit")}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ReceiveRefund({ credit, banks, companyId, onClose, onDone }: { credit: ScentsxApCredit; banks: ScentsxBank[]; companyId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [bankId, setBankId] = useState(banks[0]?.id ?? "");
  const [cents, setCents] = useState<number | null>(credit.unapplied_cents);
  const [method, setMethod] = useState<RefundMethod>("check");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(todayCT());
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => `vrefund:${credit.id}:${Date.now()}`);
  const ok = Boolean(bankId) && (cents ?? 0) > 0 && (cents ?? 0) <= credit.unapplied_cents;
  const go = async () => {
    setBusy(true);
    try {
      const r = await createVendorRefund(companyId, { vendor_credit_id: credit.id, bank_account_id: bankId, amount_cents: cents!, refund_date: date, method,
        ...(ref.trim() ? { reference: ref.trim() } : {}), ...(memo.trim() ? { memo: memo.trim() } : {}), idempotency_key: key });
      pushToast(`${r.refund.display_id} · ${money(cents!)} ${tr("perfume.ap.refund_in", "received")} · ${credit.display_id}`, "success"); await onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not recorded"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("perfume.ap.refund_received", "Refund received")} · ${credit.display_id}`} size="md" variant="drawer" data-testid="perfume-ap-refund-modal">
      <div className="space-y-3 text-xs">
        <p>{`${money(credit.unapplied_cents)} ${tr("perfume.ap.left_refund", "of credit the vendor still owes")}`}</p>
        <label className="block">{tr("perfume.ap.apply_amount", "Amount")} *<MoneyInput className="block w-[160px]" ariaLabel="Vendor refund amount" valueCents={cents} onChangeCents={setCents} /></label>
        {(cents ?? 0) > credit.unapplied_cents ? <p className="text-[#B91C1C]" role="alert">{`${tr("perfume.ap.over", "At most")} ${money(credit.unapplied_cents)}`}</p> : null}
        <label className="block">{tr("perfume.ap.date", "Date")}<DatePicker aria-label="Vendor refund date" value={date} onChange={(v) => setDate(v || todayCT())} /></label>
        <label className="block">{tr("perfume.ap.deposit_to", "Deposit to")}
          <select className={`${ctl} block w-full`} value={bankId} onChange={(e) => setBankId(e.target.value)} data-testid="perfume-ap-refund-to">
            {banks.map((b) => <option key={b.id} value={b.id}>{formatAccountDisplayLabel({ account_name: b.name })}</option>)}
          </select>
        </label>
        <label className="block">{tr("perfume.ap.method", "Paid by")}
          <select className={`${ctl} block w-full`} value={method} onChange={(e) => setMethod(e.target.value as RefundMethod)} data-testid="perfume-ap-refund-method">
            {(Object.keys(METHOD_LABEL) as RefundMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select>
        </label>
        <label className="block">{tr("perfume.ap.ref", "Check no. / reference")}<input className={`${ctl} block w-[180px]`} aria-label="Vendor refund check number or reference" value={ref} onChange={(e) => setRef(e.target.value)} data-testid="perfume-ap-refund-ref" /></label>
        <label className="block">{tr("perfume.ap.memo", "Memo")}<input className={`${ctl} block w-full`} aria-label="Vendor refund memo" value={memo} onChange={(e) => setMemo(e.target.value)} data-testid="perfume-ap-refund-memo" /></label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.cat.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void go()} data-testid="perfume-ap-refund-save">
            {`${tr("perfume.ap.record_refund", "Record refund")} ${ok ? money(cents!) : ""}`}</Button>
        </div>
      </div>
    </Modal>
  );
}

function VoidRefund({ refund, companyId, onClose, onDone }: { refund: VendorRefund; companyId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await voidVendorRefund(companyId, refund.id, why.trim()); pushToast(`${refund.display_id} ${tr("perfume.ap.voided", "voided")}`, "success"); await onDone(); }
    catch (e) { pushToast(userFacingApiError(e, "Not voided"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("perfume.ap.void_refund", "Void vendor refund")} · ${refund.display_id}`} size="sm" data-testid="perfume-ap-refund-void-modal">
      <div className="space-y-3 text-xs">
        <p>{tr("perfume.ap.void_refund_help", "The refund's entry is reversed and the vendor owes the credit again. The refund stays on record as voided.")}</p>
        <label className="block">{tr("perfume.ap.why", "Reason")} *<textarea className={`${ctl} block h-[56px] w-full py-1`} aria-label="Void reason" value={why} onChange={(e) => setWhy(e.target.value)} data-testid="perfume-ap-refund-void-reason" /></label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.cat.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !why.trim()} onClick={() => void go()} data-testid="perfume-ap-refund-void-confirm">{tr("perfume.ap.void", "Void")}</Button>
        </div>
      </div>
    </Modal>
  );
}
