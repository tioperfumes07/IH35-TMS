/**
 * TIO Perfumes · Receivables · Credits & write-offs — ROUND L.31 M2 + M3 (owner 2026-11-27 19:38 CT "AR … CUSTOMER PAYMENTS … ALL FULLY
 * COMPLETELY DONE"). On the customer's account, the QuickBooks way, all through the ONE credit-memo engine
 * (POST /api/v1/accounting/credit-memos — posts Dr the account it names / Cr A/R at creation; /:id/apply moves the sub-ledger only):
 *   · M2 — the customer's credit memos with what is left to apply, "Apply to invoice", and "+ Credit memo" (returns & allowances 4800,
 *     discounts 4810 …) optionally applied to an invoice at once.
 *   · M3 — "Write off" an open invoice as bad debt: a credit memo for its open balance coded to 6700 Bad Debt Expense, applied to that
 *     invoice (Dr 6700 / Cr A/R), with the reason kept on the memo. Never a delete, never a void of the invoice.
 *   · Refund (owner 2026-11-27 22:40 CT "Build refund engine") — pay a credit memo's credit back by check / ACH / wire / card / cash
 *     from Operating Checking or a cash account (POST /api/v1/accounting/customer-refunds: Dr A/R / Cr that account), the refunds
 *     listed under it, each voidable (the posting reverses and the credit comes back).
 * No GL math here.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ParityTable } from "../../components/parity/ParityTable";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { accountIdByNumber, formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { applyCreditMemo, createCreditMemo, listCreditMemos, type CreditMemo, type CreditMemoReason } from "../../api/credit-memos";
import { listScentsxAccounts, type ScentsxArInvoice } from "../../api/scentsx";
import { createCustomerRefund, listCustomerRefunds, voidCustomerRefund, type CustomerRefund, type RefundMethod } from "../../api/customer-refunds";
import { getAllAccounts } from "../../api/banking";
import { DatePicker } from "../../components/forms/DatePicker";
import { tr } from "./perfumeI18n";
import { ctl, DASH, money, usDate } from "./perfumeDocParts";

const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
/** The engine's reasons that fit a perfume sale (the rest are freight reasons). */
const REASONS: Array<{ value: CreditMemoReason; label: string }> = [
  { value: "damage", label: "Damaged goods" }, { value: "shortage", label: "Short shipped" }, { value: "duplicate_billing", label: "Billed twice" },
  { value: "billing_error_ours", label: "Our billing error" }, { value: "agreed_concession", label: "Agreed allowance" },
  { value: "quick_pay_discount", label: "Early-payment discount" }, { value: "other", label: "Other" },
];
const METHOD_LABEL: Record<RefundMethod, string> = { check: "Check", ach: "ACH", wire: "Wire", card: "Card", cash: "Cash" };
const invLabel = (i: ScentsxArInvoice) => `${i.number ?? i.id.slice(0, 8)} · ${usDate(i.issue_date)} · open ${money(i.open_cents)}`;

export function PerfumeCustomerCredits({ companyId, customerId, open, onDone }: { companyId: string; customerId: string; open: ScentsxArInvoice[]; onDone: () => Promise<void> }) {
  const memos = useQuery({ queryKey: ["scentsx", "credit-memos", customerId], queryFn: () => listCreditMemos(companyId, { customer_id: customerId, status: "active" }) });
  const ledger = useQuery({ queryKey: ["scentsx", "accounts"], queryFn: listScentsxAccounts });
  const [applying, setApplying] = useState<CreditMemo | null>(null);
  const [creating, setCreating] = useState(false);
  const [writeOff, setWriteOff] = useState<ScentsxArInvoice | null>(null);
  const [refunding, setRefunding] = useState<CreditMemo | null>(null);
  const [voiding, setVoiding] = useState<CustomerRefund | null>(null);
  const refunds = useQuery({ queryKey: ["scentsx", "customer-refunds", customerId], queryFn: () => listCustomerRefunds(companyId, { customer_id: customerId }) });
  const rows = memos.data?.credit_memos ?? [];
  const refundRows = refunds.data?.refunds ?? [];
  const done = async () => { setApplying(null); setCreating(false); setWriteOff(null); setRefunding(null); setVoiding(null); await memos.refetch(); await refunds.refetch(); await onDone(); };
  const accounts = ledger.data?.accounts ?? [];
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] p-3" data-testid="perfume-ar-credits" aria-label={tr("perfume.ar.credits", "Credits & write-offs")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{tr("perfume.ar.credits", "Credits & write-offs")}</div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="h-[30px] px-3 text-xs" disabled={!open.length} onClick={() => setWriteOff(open[0] ?? null)} data-testid="perfume-ar-writeoff">
            {tr("perfume.ar.writeoff", "Write off bad debt")}</Button>
          <Button type="button" className="h-[30px] px-3 text-xs" onClick={() => setCreating(true)} data-testid="perfume-ar-new-credit">{tr("perfume.ar.new_credit", "+ Credit memo")}</Button>
        </div>
      </div>
      {memos.isError ? <ListErrorState title={tr("perfume.ar.credits_error", "Couldn't load the credit memos")} status={0} message={(memos.error as Error)?.message} onRetry={() => void memos.refetch()} /> : (
        <ParityTable<CreditMemo> selectable
          rows={rows} rowKey={(r) => r.id} loading={memos.isLoading} storageKey="perfume-ar-credits-v1" exportFilename="TIO customer credit memos" exportExcel
          emptyText="No credit memos for this customer."
          columns={[
            { className: "text-left", cellClass: "text-left font-semibold", key: "display_id", sortable: true, label: "Credit memo", render: (r) => r.display_id, exportValue: (r) => r.display_id },
            { key: "issue_date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.issue_date), exportValue: (r) => r.issue_date },
            { className: "text-left", cellClass: "text-left", key: "notes", sortable: true, label: "Reason", render: (r) => r.notes || REASONS.find((x) => x.value === r.reason)?.label || r.reason, exportValue: (r) => r.notes ?? r.reason },
            { key: "amount_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.amount_cents), exportValue: (r) => r.amount_cents / 100 },
            { key: "amount_unapplied_cents", sortable: true, label: "Left to apply", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.amount_unapplied_cents), exportValue: (r) => r.amount_unapplied_cents / 100 },
            { key: "apply", sortable: false, label: "", render: (r) => (r.amount_unapplied_cents > 0
              ? <span className="inline-flex gap-1">
                  {open.length ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); setApplying(r); }} data-testid={`perfume-ar-apply-${r.id}`}>{tr("perfume.ar.apply", "Apply to invoice")}</Button> : null}
                  <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); setRefunding(r); }} data-testid={`perfume-ar-refund-${r.id}`}>{tr("perfume.ar.refund", "Refund")}</Button>
                </span> : DASH) },
          ]}
        />
      )}
      {refunds.isError ? <ListErrorState title={tr("perfume.ar.refunds_error", "Couldn't load the refunds")} status={0} message={(refunds.error as Error)?.message} onRetry={() => void refunds.refetch()} /> : refundRows.length ? (
        <>
          <div className="text-xs font-semibold">{tr("perfume.ar.refunds", "Refunds paid")}</div>
          <ParityTable<CustomerRefund> selectable
            rows={refundRows} rowKey={(r) => r.id} loading={refunds.isLoading} storageKey="perfume-ar-refunds-v1" exportFilename="TIO customer refunds" exportExcel
            emptyText="No refunds for this customer."
            columns={[
              { className: "text-left", cellClass: "text-left font-semibold", key: "display_id", sortable: true, label: "Refund", render: (r) => r.display_id, exportValue: (r) => r.display_id },
              { key: "refund_date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.refund_date), exportValue: (r) => r.refund_date },
              { className: "text-left", cellClass: "text-left", key: "credit_memo_display_id", sortable: true, label: "Credit memo", render: (r) => r.credit_memo_display_id ?? DASH, exportValue: (r) => r.credit_memo_display_id ?? "" },
              { className: "text-left", cellClass: "text-left", key: "method", sortable: true, label: "Paid by", render: (r) => `${METHOD_LABEL[r.method]}${r.reference ? ` ${r.reference}` : ""}`, exportValue: (r) => `${r.method} ${r.reference ?? ""}`.trim() },
              { className: "text-left", cellClass: "text-left", key: "bank_account_name", sortable: true, label: "From", render: (r) => r.bank_account_name ?? DASH, exportValue: (r) => r.bank_account_name ?? "" },
              { key: "amount_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.amount_cents), exportValue: (r) => r.amount_cents / 100 },
              { className: "text-left", cellClass: "text-left", key: "voided_at", sortable: true, label: "Status", render: (r) => (r.voided_at ? `Voided · ${r.void_reason ?? ""}` : "Paid"), exportValue: (r) => (r.voided_at ? "voided" : "paid") },
              { key: "void", sortable: false, label: "", render: (r) => (r.voided_at ? DASH
                : <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); setVoiding(r); }} data-testid={`perfume-ar-refund-void-${r.id}`}>{tr("perfume.ar.void", "Void")}</Button>) },
            ]}
          />
        </>
      ) : null}
      {refunding ? <RefundModal memo={refunding} companyId={companyId} onClose={() => setRefunding(null)} onDone={done} /> : null}
      {voiding ? <VoidRefundModal refund={voiding} companyId={companyId} onClose={() => setVoiding(null)} onDone={done} /> : null}
      {applying ? <ApplyModal memo={applying} companyId={companyId} open={open} onClose={() => setApplying(null)} onDone={done} /> : null}
      {creating ? <CreditModal companyId={companyId} customerId={customerId} open={open} accounts={accounts} onClose={() => setCreating(false)} onDone={done} /> : null}
      {writeOff ? <WriteOffModal companyId={companyId} customerId={customerId} open={open} first={writeOff} badDebtId={accountIdByNumber(accounts, "6700")} onClose={() => setWriteOff(null)} onDone={done} /> : null}
    </section>
  );
}

function ApplyModal({ memo, companyId, open, onClose, onDone }: { memo: CreditMemo; companyId: string; open: ScentsxArInvoice[]; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [invId, setInvId] = useState(open[0]?.id ?? "");
  const inv = open.find((i) => i.id === invId);
  const max = Math.min(memo.amount_unapplied_cents, inv?.open_cents ?? 0);
  const [cents, setCents] = useState<number | null>(max);
  const [busy, setBusy] = useState(false);
  const ok = Boolean(inv) && (cents ?? 0) > 0 && (cents ?? 0) <= max;
  const go = async () => {
    setBusy(true);
    try { await applyCreditMemo(companyId, memo.id, [{ invoice_id: invId, applied_cents: cents! }]); pushToast(`${memo.display_id} applied · ${money(cents!)}`, "success"); await onDone(); }
    catch (e) { pushToast(userFacingApiError(e, "Not applied"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("perfume.ar.apply", "Apply to invoice")} · ${memo.display_id}`} size="sm" data-testid="perfume-ar-apply-modal">
      <div className="space-y-3 text-xs">
        <p>{`${money(memo.amount_unapplied_cents)} ${tr("perfume.ar.left", "left to apply")}`}</p>
        <label className="block">{tr("perfume.ar.invoice", "Invoice")}
          <select className={`${ctl} block w-full`} value={invId} onChange={(e) => { setInvId(e.target.value); setCents(Math.min(memo.amount_unapplied_cents, open.find((i) => i.id === e.target.value)?.open_cents ?? 0)); }} data-testid="perfume-ar-apply-invoice">
            {open.map((i) => <option key={i.id} value={i.id}>{invLabel(i)}</option>)}
          </select>
        </label>
        <label className="block">{tr("perfume.ar.amount", "Amount")}<MoneyInput className="block w-[160px]" ariaLabel="Amount to apply" valueCents={cents} onChangeCents={setCents} /></label>
        {(cents ?? 0) > max ? <p className="text-[#B91C1C]">{`${tr("perfume.ar.max", "At most")} ${money(max)}`}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.ar.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void go()} data-testid="perfume-ar-apply-confirm">{tr("perfume.ar.apply_confirm", "Apply")}</Button>
        </div>
      </div>
    </Modal>
  );
}

function CreditModal({ companyId, customerId, open, accounts, onClose, onDone }: { companyId: string; customerId: string; open: ScentsxArInvoice[]; accounts: Array<{ id: string; account_number: string | null; account_name: string; account_type: string }>; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const income = accounts.filter((a) => a.account_type === "Income");
  const [cents, setCents] = useState<number | null>(null);
  const [reason, setReason] = useState<CreditMemoReason>("damage");
  const [accountId, setAccountId] = useState(accountIdByNumber(income, "4800") || income[0]?.id || "");
  const [invId, setInvId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const inv = open.find((i) => i.id === invId);
  const ok = (cents ?? 0) > 0 && Boolean(accountId) && (!inv || (cents ?? 0) <= inv.open_cents);
  const go = async () => {
    setBusy(true);
    try {
      const r = await createCreditMemo(companyId, { customer_id: customerId, issue_date: todayCT(), amount_cents: cents!, reason, account_id: accountId, notes: notes.trim() || undefined,
        ...(inv ? { related_invoice_id: inv.id, apply_to_invoice: true } : {}) });
      pushToast(`${r.display_id} · ${money(cents!)}${inv ? ` ${tr("perfume.ar.applied_to", "applied to")} ${inv.number ?? ""}` : ""}`, "success"); await onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={tr("perfume.ar.new_credit_title", "New credit memo")} size="md" variant="drawer" data-testid="perfume-ar-credit-modal">
      <div className="space-y-3 text-xs">
        <label className="block">{tr("perfume.ar.amount", "Amount")} *<MoneyInput className="block w-[160px]" ariaLabel="Credit amount" valueCents={cents} onChangeCents={setCents} /></label>
        <label className="block">{tr("perfume.ar.reason", "Reason")}
          <select className={`${ctl} block w-full`} value={reason} onChange={(e) => setReason(e.target.value as CreditMemoReason)} data-testid="perfume-ar-credit-reason">
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className="block">{tr("perfume.ar.account", "Account it reduces")}
          <select className={`${ctl} block w-full`} value={accountId} onChange={(e) => setAccountId(e.target.value)} data-testid="perfume-ar-credit-account">
            {income.map((a) => <option key={a.id} value={a.id}>{formatAccountDisplayLabel(a)}</option>)}
          </select>
        </label>
        <label className="block">{tr("perfume.ar.apply_now", "Apply to invoice now (optional)")}
          <select className={`${ctl} block w-full`} value={invId} onChange={(e) => setInvId(e.target.value)} data-testid="perfume-ar-credit-invoice">
            <option value="">{tr("perfume.ar.keep_credit", "Keep as customer credit")}</option>
            {open.map((i) => <option key={i.id} value={i.id}>{invLabel(i)}</option>)}
          </select>
        </label>
        <label className="block">{tr("perfume.ar.notes", "Notes")}<textarea className={`${ctl} block h-[56px] w-full py-1`} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="perfume-ar-credit-notes" /></label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.ar.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void go()} data-testid="perfume-ar-credit-save">{tr("perfume.ar.save_credit", "Save credit memo")}</Button>
        </div>
      </div>
    </Modal>
  );
}

function WriteOffModal({ companyId, customerId, open, first, badDebtId, onClose, onDone }: { companyId: string; customerId: string; open: ScentsxArInvoice[]; first: ScentsxArInvoice; badDebtId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [invId, setInvId] = useState(first.id);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const inv = open.find((i) => i.id === invId);
  const ok = Boolean(inv) && inv!.open_cents > 0 && Boolean(why.trim()) && Boolean(badDebtId);
  const go = async () => {
    setBusy(true);
    try {
      const r = await createCreditMemo(companyId, { customer_id: customerId, issue_date: todayCT(), amount_cents: inv!.open_cents, reason: "other", account_id: badDebtId,
        notes: `Bad debt write-off: ${why.trim()}`, related_invoice_id: inv!.id, apply_to_invoice: true });
      pushToast(`${inv!.number ?? ""} ${tr("perfume.ar.written_off", "written off")} · ${money(inv!.open_cents)} · ${r.display_id}`, "success"); await onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not written off"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={tr("perfume.ar.writeoff_title", "Write off bad debt")} size="sm" data-testid="perfume-ar-writeoff-modal">
      <div className="space-y-3 text-xs">
        <p>{tr("perfume.ar.writeoff_help", "The open balance becomes Bad Debt Expense and the invoice is closed by a credit memo. The invoice itself stays on record.")}</p>
        {!badDebtId ? <p className="text-[#B91C1C]">{tr("perfume.ar.no_bad_debt", "ScentsX has no Bad Debt Expense account.")}</p> : null}
        <label className="block">{tr("perfume.ar.invoice", "Invoice")}
          <select className={`${ctl} block w-full`} value={invId} onChange={(e) => setInvId(e.target.value)} data-testid="perfume-ar-writeoff-invoice">
            {open.map((i) => <option key={i.id} value={i.id}>{invLabel(i)}</option>)}
          </select>
        </label>
        <label className="block">{tr("perfume.ar.why", "Reason")} *<textarea className={`${ctl} block h-[56px] w-full py-1`} value={why} onChange={(e) => setWhy(e.target.value)} data-testid="perfume-ar-writeoff-reason" /></label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.ar.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void go()} data-testid="perfume-ar-writeoff-confirm">
            {`${tr("perfume.ar.writeoff_confirm", "Write off")} ${inv ? money(inv.open_cents) : ""}`}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Where a refund can come from: ScentsX's bank and cash accounts (never the credit card or Undeposited Funds). */
const REFUND_FROM_TYPES = /^(checking|savings|money_market|cash_on_hand|petty_cash)$/i;

function RefundModal({ memo, companyId, onClose, onDone }: { memo: CreditMemo; companyId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const banks = useQuery({ queryKey: ["scentsx", "banks", companyId], queryFn: () => getAllAccounts(companyId) });
  const from = (banks.data?.accounts ?? []).filter((r) => r.ledger_account_id && REFUND_FROM_TYPES.test(String(r.account_type ?? "")))
    .map((r) => ({ id: String(r.id), name: String(r.account_name ?? r.name ?? ""), type: String(r.account_type ?? "") }));
  const [bankId, setBankId] = useState("");
  const [cents, setCents] = useState<number | null>(memo.amount_unapplied_cents);
  const [method, setMethod] = useState<RefundMethod>("check");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(todayCT());
  const [memoText, setMemoText] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => `refund:${memo.id}:${Date.now()}`);
  const bank = from.find((b) => b.id === (bankId || from[0]?.id));
  const ok = Boolean(bank) && (cents ?? 0) > 0 && (cents ?? 0) <= memo.amount_unapplied_cents;
  const go = async () => {
    setBusy(true);
    try {
      const r = await createCustomerRefund(companyId, { credit_memo_id: memo.id, bank_account_id: bank!.id, amount_cents: cents!, refund_date: date, method,
        ...(ref.trim() ? { reference: ref.trim() } : {}), ...(memoText.trim() ? { memo: memoText.trim() } : {}), idempotency_key: key });
      pushToast(`${r.refund.display_id} · ${money(cents!)} ${tr("perfume.ar.refunded", "refunded")} · ${memo.display_id}`, "success"); await onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not refunded"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("perfume.ar.refund", "Refund")} · ${memo.display_id}`} size="md" variant="drawer" data-testid="perfume-ar-refund-modal">
      <div className="space-y-3 text-xs">
        <p>{`${money(memo.amount_unapplied_cents)} ${tr("perfume.ar.left_refund", "of credit left to refund")}`}</p>
        <label className="block">{tr("perfume.ar.amount", "Amount")} *<MoneyInput className="block w-[160px]" ariaLabel="Refund amount" valueCents={cents} onChangeCents={setCents} /></label>
        {(cents ?? 0) > memo.amount_unapplied_cents ? <p className="text-[#B91C1C]">{`${tr("perfume.ar.max", "At most")} ${money(memo.amount_unapplied_cents)}`}</p> : null}
        <label className="block">{tr("perfume.ar.date", "Date")}<DatePicker aria-label="Refund date" value={date} onChange={(v) => setDate(v || todayCT())} /></label>
        <label className="block">{tr("perfume.ar.paid_from", "Paid from")}
          <select className={`${ctl} block w-full`} value={bank?.id ?? ""} onChange={(e) => setBankId(e.target.value)} data-testid="perfume-ar-refund-from">
            {from.map((b) => <option key={b.id} value={b.id}>{formatAccountDisplayLabel({ account_name: b.name })}</option>)}
          </select>
        </label>
        <label className="block">{tr("perfume.ar.method", "Paid by")}
          <select className={`${ctl} block w-full`} value={method} onChange={(e) => setMethod(e.target.value as RefundMethod)} data-testid="perfume-ar-refund-method">
            {(Object.keys(METHOD_LABEL) as RefundMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select>
        </label>
        <label className="block">{tr("perfume.ar.ref", "Check no. / reference")}<input className={`${ctl} block w-[180px]`} aria-label="Refund check number or reference" value={ref} onChange={(e) => setRef(e.target.value)} data-testid="perfume-ar-refund-ref" /></label>
        <label className="block">{tr("perfume.ar.memo", "Memo")}<input className={`${ctl} block w-full`} aria-label="Refund memo" value={memoText} onChange={(e) => setMemoText(e.target.value)} data-testid="perfume-ar-refund-memo" /></label>
        {!banks.isLoading && !from.length ? <p className="text-[#B91C1C]">{tr("perfume.ar.no_bank", "ScentsX has no bank or cash account to refund from.")}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.ar.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void go()} data-testid="perfume-ar-refund-save">
            {`${tr("perfume.ar.refund_confirm", "Refund")} ${ok ? money(cents!) : ""}`}</Button>
        </div>
      </div>
    </Modal>
  );
}

function VoidRefundModal({ refund, companyId, onClose, onDone }: { refund: CustomerRefund; companyId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await voidCustomerRefund(companyId, refund.id, why.trim()); pushToast(`${refund.display_id} ${tr("perfume.ar.voided", "voided")}`, "success"); await onDone(); }
    catch (e) { pushToast(userFacingApiError(e, "Not voided"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("perfume.ar.void_refund", "Void refund")} · ${refund.display_id}`} size="sm" data-testid="perfume-ar-refund-void-modal">
      <div className="space-y-3 text-xs">
        <p>{tr("perfume.ar.void_refund_help", "The refund's entry is reversed and the credit goes back to the credit memo. The refund stays on record as voided.")}</p>
        <label className="block">{tr("perfume.ar.why", "Reason")} *<textarea className={`${ctl} block h-[56px] w-full py-1`} value={why} onChange={(e) => setWhy(e.target.value)} data-testid="perfume-ar-refund-void-reason" /></label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.ar.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !why.trim()} onClick={() => void go()} data-testid="perfume-ar-refund-void-confirm">{tr("perfume.ar.void", "Void")}</Button>
        </div>
      </div>
    </Modal>
  );
}
