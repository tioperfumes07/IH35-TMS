/**
 * TIO Perfumes · Receivables — owner 2026-11-27 13:50 CT "lets incorporate what we need from here [CONTROL] in the app". CONTROL's
 * On Account Aging Balance Report (aging date + aging days 30 / 60 / 90 → Current · 30 · 60 · 90+ · A/R balance per customer),
 * Customer Account Status (ticket · date · days · amount · on account · balance + the bucket strip), Customer's Invoice History (each
 * invoice's payments), Payments Entry (apply one payment across a customer's open invoices: tender, amount, reference, applied /
 * unapplied) and Payments Void — on ScentsX LLC's own books.
 * Reads /api/v1/scentsx/receivables/*; records and voids through the one payment engine (/api/v1/accounting/payments), which posts
 * Dr cash / Cr A/R. Nothing here computes money of its own beyond adding up the books' open balances for the screen.
 * M1 (L.31): one payment across several invoices (oldest first) + payments received BEFORE the invoice: the payment engine posts them
 * Dr bank / Cr A/R like any payment and leaves them unapplied — the customer's credit on A/R, the QuickBooks way (not 2150) — and
 * "Unapplied payments" applies them to an invoice when it arrives (POST /api/v1/accounting/payments/:id/applications; no second JE).
 */
import { PerfumeCustomerCredits } from "./PerfumeCustomerCredits";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { applyPayment, createPayment, voidPayment, type PaymentMethod } from "../../api/accounting";
import { getScentsxAging, getScentsxCustomerAccount, type ScentsxAgingDays, type ScentsxAgingRow, type ScentsxArInvoice, type ScentsxArPayment, type ScentsxBuckets } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { CustomerStatement, ReturnForm, ReturnsList } from "./PerfumeReturnsParts";
import { ctl, DASH, DocLink, money, useOpenDoc, usDate } from "./perfumeDocParts";

const TENDERS: Array<[PaymentMethod, string]> = [["cash", "Cash"], ["check", "Check"], ["wire", "Wire"], ["ach", "ACH"], ["credit_card", "Card"], ["other", "Other"]];
const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

function BucketStrip({ b, d, testId }: { b: ScentsxBuckets; d: ScentsxAgingDays; testId: string }) {
  return (
    <div className="grid grid-cols-2 gap-[10px] md:grid-cols-5" data-testid={testId}>
      <KpiCard label={tr("perfume.ar.current", "Current")} number={money(b.current)} disabled />
      <KpiCard label={`${d.d1} ${tr("perfume.ar.days", "days")}`} number={money(b.b1)} disabled />
      <KpiCard label={`${d.d2} ${tr("perfume.ar.days", "days")}`} number={money(b.b2)} disabled />
      <KpiCard label={`${d.d3}+ ${tr("perfume.ar.days", "days")}`} number={money(b.b3)} accent={b.b3 > 0 ? "#B91C1C" : undefined} disabled />
      <KpiCard label={tr("perfume.ar.balance", "A/R balance")} number={money(b.total)} disabled />
    </div>
  );
}

export function PerfumeReceivablesPanel() {
  const { openId, open } = useOpenDoc();
  const [asOf, setAsOf] = useState<string>(todayCT());
  const [days, setDays] = useState<ScentsxAgingDays>({ d1: 30, d2: 60, d3: 90 });
  const aging = useQuery({ queryKey: ["scentsx", "aging", asOf, days], queryFn: () => getScentsxAging(asOf, days) });
  const setDay = (k: keyof ScentsxAgingDays, v: string) => { const n = Number(v); if (Number.isInteger(n) && n > 0) setDays({ ...days, [k]: n }); };
  if (aging.isError) return <ListErrorState title={tr("perfume.ar.error", "Couldn't load receivables")} status={0} message={(aging.error as Error)?.message} onRetry={() => void aging.refetch()} />;
  const d = aging.data;
  return (
    <div className="space-y-3" data-testid="perfume-receivables-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.ar.aging", "Aging balance report")}>
        <div className="text-card-title">{tr("perfume.ar.aging", "Aging balance report")}</div>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label>{tr("perfume.ar.as_of", "Aging date")} <DatePicker aria-label={tr("perfume.ar.as_of", "Aging date")} value={asOf} onChange={(v) => setAsOf(v || todayCT())} /></label>
          {(["d1", "d2", "d3"] as const).map((k, i) => (
            <label key={k}>{`${tr("perfume.ar.aging_days", "Aging days")} ${i + 1}`} <input type="number" min={1} className={`${ctl} block w-[80px] text-right`} value={days[k]} onChange={(e) => setDay(k, e.target.value)} data-testid={`perfume-ar-${k}`} /></label>
          ))}
          <span className="text-[#64748B]">{tr("perfume.ar.basis", "Days counted from the invoice date. Balances are the books' own open amounts (A/R control account).")}</span>
        </div>
        {d ? <BucketStrip b={d.totals} d={d.days} testId="perfume-ar-totals" /> : null}
        <ParityTable<ScentsxAgingRow> selectable
          rows={d?.customers ?? []} rowKey={(r) => r.customer_id} loading={aging.isLoading} storageKey="perfume-ar-aging-v1" exportFilename={`TIO aging ${asOf}`} exportExcel
          emptyText="No open invoices — nothing owed on ScentsX's books." onRowClick={(r) => open("receivables", r.customer_id)}
          columns={[
            { className: "text-left", key: "customer", label: "Customer", sortable: true, render: (r) => <span className="font-semibold">{r.customer}</span>, exportValue: (r) => r.customer },
            { key: "current", label: "Current", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.current), exportValue: (r) => r.current / 100 },
            { key: "b1", label: `${d?.days.d1 ?? 30} days`, kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.b1), exportValue: (r) => r.b1 / 100 },
            { key: "b2", label: `${d?.days.d2 ?? 60} days`, kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.b2), exportValue: (r) => r.b2 / 100 },
            { key: "b3", label: `${d?.days.d3 ?? 90}+ days`, kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => <span className={r.b3 > 0 ? "text-[#B91C1C]" : ""}>{money(r.b3)}</span>, exportValue: (r) => r.b3 / 100 },
            { key: "total", label: "A/R balance", kind: "number", sortable: true, cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.total), exportValue: (r) => r.total / 100 },
            { key: "invoices", label: "Open invoices", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => r.invoices.toLocaleString("en-US") },
            { key: "oldest_days", label: "Oldest (days)", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => r.oldest_days.toLocaleString("en-US") },
          ]}
        />
      </section>
      {openId ? <CustomerAccount key={openId} customerId={openId} asOf={asOf} days={days} onChanged={() => void aging.refetch()} /> : null}
      <section className="rounded-[3px] border border-[#D8E0E8] bg-white p-3"><ReturnsList /></section>
    </div>
  );
}

function CustomerAccount({ customerId, asOf, days, onChanged }: { customerId: string; asOf: string; days: ScentsxAgingDays; onChanged: () => void }) {
  const acct = useQuery({ queryKey: ["scentsx", "ar-customer", customerId, asOf, days], queryFn: () => getScentsxCustomerAccount(customerId, asOf, days) });
  const [openInv, setOpenInv] = useState<string | null>(null);
  const [returnInv, setReturnInv] = useState<string | null>(null);
  if (acct.isError) return <ListErrorState title={tr("perfume.ar.cust_error", "Couldn't load the customer's account")} status={0} message={(acct.error as Error)?.message} onRetry={() => void acct.refetch()} />;
  const a = acct.data;
  if (!a) return null;
  const refresh = async () => { await acct.refetch(); onChanged(); };
  const shown = a.invoices.find((x) => x.id === openInv) ?? null;
  return (
    <section className="space-y-3 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-ar-customer" aria-label={a.customer.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{`${tr("perfume.ar.account_status", "Customer account status")} · ${a.customer.name}`}</div>
        <div className="flex flex-wrap gap-3 text-xs text-[#475569]">
          {a.customer.perfume_company_id ? <DocLink tab="customers" id={a.customer.perfume_company_id}>{tr("perfume.ar.open_customer", "Customer card")}</DocLink> : null}
          <span>{`${tr("perfume.ar.terms", "Terms")} ${a.customer.terms_days == null ? DASH : `${a.customer.terms_days} ${tr("perfume.ar.days", "days")}`}`}</span>
          <span>{`${tr("perfume.ar.limit", "Credit limit")} ${money(a.customer.credit_limit_cents)}`}</span>
          {a.customer.credit_limit_cents != null && a.buckets.total > a.customer.credit_limit_cents
            ? <span className="font-semibold text-[#B91C1C]" data-testid="perfume-ar-over-limit">{tr("perfume.ar.over_limit", "Over the credit limit")}</span> : null}
        </div>
      </div>
      <BucketStrip b={a.buckets} d={a.days} testId="perfume-ar-customer-buckets" />
      <PaymentEntry acctId={a.operating_company_id} customerId={a.customer.id} open={a.open_invoices} onDone={refresh} />
      <CustomerDeposits companyId={a.operating_company_id} payments={a.payments} open={a.open_invoices} onDone={refresh} />
      <PerfumeCustomerCredits companyId={a.operating_company_id} customerId={a.customer.id} open={a.open_invoices} onDone={refresh} />
      <ParityTable<ScentsxArInvoice> selectable
        cardTitle title={tr("perfume.ar.history", "Invoice history — click an invoice for its payments")} rows={a.invoices} rowKey={(r) => r.id} storageKey="perfume-ar-invoices-v1"
        exportFilename={`TIO invoices ${a.customer.name}`} exportExcel emptyText="No invoices on ScentsX's books for this customer." onRowClick={(r) => setOpenInv(r.id === openInv ? null : r.id)}
        columns={[
          { className: "text-left", key: "number", label: "Invoice", sortable: true, render: (r) => <Link className="underline" to={`/accounting/invoices/${encodeURIComponent(r.id)}`} onClick={(e) => e.stopPropagation()}>{r.number ?? r.id.slice(0, 8)}</Link>, exportValue: (r) => r.number ?? "" },
          { key: "issue_date", label: "Date", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.issue_date), exportValue: (r) => r.issue_date },
          { key: "due_date", label: "Due date", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.due_date ? usDate(r.due_date) : DASH), exportValue: (r) => r.due_date ?? "" },
          { key: "days", label: "Days", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => r.days.toLocaleString("en-US") },
          { key: "total_cents", label: "Amount", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.total_cents), exportValue: (r) => r.total_cents / 100 },
          { key: "paid_cents", label: "Payments", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.paid_cents), exportValue: (r) => r.paid_cents / 100 },
          { key: "open_cents", label: "Balance", kind: "number", sortable: true, cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.open_cents), exportValue: (r) => r.open_cents / 100 },
          { key: "return", label: "", render: (r) => (["sent", "partial", "paid"].includes(r.status)
            ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); setReturnInv(r.id); }} data-testid={`perfume-ar-return-${r.id}`}>{tr("perfume.ar.return", "Return")}</Button>
            : null) },
        ]}
      />
      {returnInv ? <ReturnForm key={returnInv} invoiceId={returnInv} onClose={() => setReturnInv(null)} onDone={() => void refresh()} /> : null}
      {shown ? (
        <ParityTable<ScentsxArInvoice["payments"][number]> selectable
          cardTitle title={`${tr("perfume.ar.payments_on", "Payments on invoice")} ${shown.number ?? ""} · ${tr("perfume.ar.amount", "amount")} ${money(shown.total_cents)} · ${tr("perfume.ar.paid", "paid")} ${money(shown.paid_cents)} · ${tr("perfume.ar.balance", "A/R balance")} ${money(shown.open_cents)}`}
          rows={shown.payments} rowKey={(p) => `${p.payment_id}-${p.amount_cents}`} storageKey="perfume-ar-inv-payments-v1" exportFilename="TIO invoice payments" exportExcel emptyText="No payment applied to this invoice."
          columns={[
            { className: "text-left", key: "payment_no", label: "Payment", render: (p) => <Link className="underline" to={`/accounting/payments/${encodeURIComponent(p.payment_id)}`}>{p.payment_no ?? p.payment_id.slice(0, 8)}</Link>, exportValue: (p) => p.payment_no ?? "" },
            { key: "date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (p) => (p.date ? usDate(p.date) : DASH), exportValue: (p) => p.date ?? "" },
            { className: "text-left", key: "method", sortable: true, label: "Tender", render: (p) => p.method ?? DASH, exportValue: (p) => p.method ?? "" },
            { className: "text-left", key: "reference", sortable: true, label: "Reference", render: (p) => p.reference ?? DASH, exportValue: (p) => p.reference ?? "" },
            { key: "amount_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums", render: (p) => money(p.amount_cents), exportValue: (p) => p.amount_cents / 100 },
            { className: "text-left", key: "counted", sortable: true, label: "Status", render: (p) => (p.voided ? "Voided" : p.unapplied ? "Unapplied" : "Applied"), exportValue: (p) => (p.voided ? "Voided" : p.unapplied ? "Unapplied" : "Applied") },
          ]}
        />
      ) : null}
      <PaymentsList companyId={a.operating_company_id} rows={a.payments} onDone={refresh} />
      <CustomerStatement companyId={a.operating_company_id} customerId={a.customer.id} />
    </section>
  );
}

/**
 * Unapplied payments — money received before (or beyond) an invoice (unapplied_cents > 0, not voided). Already posted Dr bank / Cr A/R,
 * it is the customer's credit on A/R until "Apply to invoice" (POST /api/v1/accounting/payments/:id/applications) moves it onto an
 * invoice — sub-ledger only, no new GL math. A refund of it goes through a credit memo + Refund (customer refunds).
 */
function CustomerDeposits({ companyId, payments, open, onDone }: { companyId: string; payments: ScentsxArPayment[]; open: ScentsxArInvoice[]; onDone: () => Promise<void> }) {
  const deposits = payments.filter((p) => !p.voided_at && p.unapplied_cents > 0);
  const [applying, setApplying] = useState<ScentsxArPayment | null>(null);
  if (deposits.length === 0) return null;
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] p-3" data-testid="perfume-ar-deposits" aria-label={tr("perfume.ar.deposits", "Unapplied payments")}>
      <div className="text-card-title">{tr("perfume.ar.deposits", "Unapplied payments")}</div>
      <p className="text-xs text-[#64748B]">{tr("perfume.ar.deposits_note", "Money received before an invoice (or more than it): already in the bank, held as the customer's credit on A/R. Apply it to an invoice when it arrives.")}</p>
      <ParityTable<ScentsxArPayment> selectable
        rows={deposits} rowKey={(r) => r.id} storageKey="perfume-ar-deposits-v1" exportFilename="TIO customer deposits" exportExcel
        emptyText="No unapplied deposits."
        columns={[
          { className: "text-left", key: "number", sortable: true, label: "Payment", render: (r) => <Link className="underline" to={`/accounting/payments/${encodeURIComponent(r.id)}`}>{r.number ?? "Payment"}</Link>, exportValue: (r) => r.number ?? "" },
          { key: "date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.date), exportValue: (r) => r.date },
          { className: "text-left", key: "method", sortable: true, label: "Tender", render: (r) => r.method, exportValue: (r) => r.method },
          { className: "text-left", key: "reference", sortable: true, label: "Reference", render: (r) => r.reference ?? DASH, exportValue: (r) => r.reference ?? "" },
          { key: "amount_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.amount_cents), exportValue: (r) => r.amount_cents / 100 },
          { key: "unapplied_cents", sortable: true, label: "Unapplied", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.unapplied_cents), exportValue: (r) => r.unapplied_cents / 100 },
          { key: "apply", sortable: false, label: "", render: (r) => (open.length > 0
            ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); setApplying(r); }} data-testid={`perfume-ar-deposit-apply-${r.id}`}>{tr("perfume.ar.apply_deposit", "Apply to invoice")}</Button>
            : DASH) },
        ]}
      />
      {applying ? <ApplyDepositModal payment={applying} companyId={companyId} open={open} onClose={() => setApplying(null)} onDone={async () => { setApplying(null); await onDone(); }} /> : null}
    </section>
  );
}

function ApplyDepositModal({ payment, companyId, open, onClose, onDone }: { payment: ScentsxArPayment; companyId: string; open: ScentsxArInvoice[]; onClose: () => void; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [invId, setInvId] = useState(open[0]?.id ?? "");
  const inv = open.find((i) => i.id === invId);
  const max = Math.min(payment.unapplied_cents, inv?.open_cents ?? 0);
  const [cents, setCents] = useState<number | null>(max);
  const [busy, setBusy] = useState(false);
  const ok = Boolean(inv) && (cents ?? 0) > 0 && (cents ?? 0) <= max;
  const go = async () => {
    if (!ok || !inv || cents == null) return;
    setBusy(true);
    try {
      const r = await applyPayment(payment.id, companyId, { invoice_id: invId, amount_cents: cents });
      pushToast(`${money(cents)} applied · ${inv.number ?? "invoice"}${r.payment_amount_unapplied_cents > 0 ? ` · ${money(r.payment_amount_unapplied_cents)} still on account` : ""}`, "success");
      await onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not applied"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("perfume.ar.apply_deposit", "Apply to invoice")} · ${payment.number ?? ""}`} size="sm" data-testid="perfume-ar-apply-deposit-modal">
      <div className="space-y-3 text-xs">
        <p>{`${tr("perfume.ar.deposit_balance", "Unapplied")} ${money(payment.unapplied_cents)}`}</p>
        <label className="block">{tr("perfume.ar.invoice", "Invoice")}
          <select className={`${ctl} block w-full`} value={invId} onChange={(e) => { setInvId(e.target.value); setCents(Math.min(payment.unapplied_cents, open.find((i) => i.id === e.target.value)?.open_cents ?? 0)); }} data-testid="perfume-ar-deposit-invoice">
            {open.map((i) => <option key={i.id} value={i.id}>{`${i.number ?? "Invoice"} · ${usDate(i.issue_date)} · open ${money(i.open_cents)}`}</option>)}
          </select>
        </label>
        <label className="block">{tr("perfume.ar.amount", "Amount")} <MoneyInput className="block w-[160px]" ariaLabel="Amount to apply" valueCents={cents} onChangeCents={setCents} /></label>
        {(cents ?? 0) > max ? <p className="text-[#B91C1C]">{`${tr("perfume.ar.max", "At most")} ${money(max)}`}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.ar.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void go()} data-testid="perfume-ar-deposit-apply-confirm">{tr("perfume.ar.apply", "Apply")}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** CONTROL Payments Entry: one payment (tender, amount, reference) applied across the customer's open invoices, oldest first by default. */
function PaymentEntry({ acctId, customerId, open, onDone }: { acctId: string; customerId: string; open: ScentsxArInvoice[]; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [amount, setAmount] = useState<number | null>(null);
  const [tender, setTender] = useState<PaymentMethod>("check");
  const [date, setDate] = useState(todayCT());
  const [ref, setRef] = useState("");
  const [apply, setApply] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const applied = useMemo(() => Object.values(apply).reduce((s, v) => s + v, 0), [apply]);
  const oldestFirst = (amt: number | null) => {
    let left = amt ?? 0; const next: Record<string, number> = {};
    for (const inv of [...open].sort((x, y) => x.issue_date.localeCompare(y.issue_date))) { if (left <= 0) break; const take = Math.min(left, inv.open_cents); next[inv.id] = take; left -= take; }
    setApply(next);
  };
  const tooMuch = open.find((i) => (apply[i.id] ?? 0) > i.open_cents);
  const ok = amount != null && amount > 0 && applied <= amount && !tooMuch;
  const save = async () => {
    if (!ok || amount == null) return;
    setBusy(true);
    try {
      const r = await createPayment(acctId, { customer_id: customerId, payment_method: tender, payment_date: date, reference: ref.trim() || undefined, amount_cents: amount,
        apply_to: Object.entries(apply).filter(([, v]) => v > 0).map(([invoice_id, amount_cents]) => ({ invoice_id, amount_cents })) });
      pushToast(`Payment ${r.display_id} recorded${r.amount_unapplied_cents ? ` — ${money(r.amount_unapplied_cents)} left as the customer's credit` : ""}`, "success");
      setAmount(null); setRef(""); setApply({}); await onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Payment not recorded"), "error"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-[3px] border border-[#D8E0E8] p-3" data-testid="perfume-ar-payment">
      <div className="text-xs font-semibold text-[#1F2A44]">{tr("perfume.ar.payment_entry", "Payment entry")}</div>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label>{tr("perfume.ar.date", "Date")} <DatePicker aria-label={tr("perfume.ar.pay_date", "Payment date")} value={date} onChange={(v) => setDate(v || todayCT())} /></label>
        <label>{tr("perfume.ar.tender", "Tender")}
          <select className={`${ctl} block`} value={tender} onChange={(e) => setTender(e.target.value as PaymentMethod)} data-testid="perfume-ar-pay-tender">
            {TENDERS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label>{tr("perfume.ar.amount", "Amount")} <MoneyInput className="block w-[130px]" ariaLabel="Payment amount" valueCents={amount} onChangeCents={(c) => { setAmount(c); oldestFirst(c); }} /></label>
        <label>{tr("perfume.ar.reference", "Reference")} <input className={`${ctl} block w-[180px]`} aria-label={tr("perfume.ar.reference", "Reference")} placeholder="Check no. / wire ref." value={ref} onChange={(e) => setRef(e.target.value)} data-testid="perfume-ar-pay-ref" /></label>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!amount} onClick={() => oldestFirst(amount)} data-testid="perfume-ar-pay-oldest">{tr("perfume.ar.oldest", "Apply oldest first")}</Button>
      </div>
      <ParityTable<ScentsxArInvoice> selectable
        rows={open} rowKey={(r) => r.id} storageKey="perfume-ar-apply-v1" emptyText="No open invoice — a payment would sit as the customer's credit."
        columns={[
          { className: "text-left", key: "number", sortable: true, label: "Invoice", render: (r) => r.number ?? r.id.slice(0, 8), exportValue: (r) => r.number ?? "" },
          { key: "issue_date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.issue_date), exportValue: (r) => r.issue_date },
          { key: "days", sortable: true, label: "Days", kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.days.toLocaleString("en-US") },
          { key: "open_cents", sortable: true, label: "Balance", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.open_cents), exportValue: (r) => r.open_cents / 100 },
          { key: "apply", label: "Apply", render: (r) => (
            <MoneyInput className="w-[120px]" ariaLabel={`Apply to ${r.number ?? r.id}`} valueCents={apply[r.id] ?? null} onChangeCents={(c) => setApply({ ...apply, [r.id]: c ?? 0 })} />) },
          { key: "new_balance", sortable: true, label: "New balance", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.open_cents - (apply[r.id] ?? 0)) },
        ]}
      />
      <div className="flex flex-wrap items-center justify-end gap-4 text-xs" data-testid="perfume-ar-pay-totals">
        <span>{`${tr("perfume.ar.payment", "Payment")} ${money(amount ?? 0)}`}</span>
        <span>{`${tr("perfume.ar.applied", "Applied")} ${money(applied)}`}</span>
        <span className={applied > (amount ?? 0) ? "font-semibold text-[#B91C1C]" : ""}>{`${tr("perfume.ar.unapplied", "Unapplied (customer credit)")} ${money((amount ?? 0) - applied)}`}</span>
        {tooMuch ? <span className="font-semibold text-[#B91C1C]">{`${tr("perfume.ar.too_much", "More than the balance on")} ${tooMuch.number ?? ""}`}</span> : null}
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void save()} data-testid="perfume-ar-pay-save">{tr("perfume.ar.record", "Record payment")}</Button>
      </div>
    </div>
  );
}

/** The customer's payments; CONTROL Payments Void = void with a written reason through the payment engine (it reverses the posting). */
function PaymentsList({ companyId, rows, onDone }: { companyId: string; rows: ScentsxArPayment[]; onDone: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const doVoid = async (id: string) => {
    try { await voidPayment(id, companyId, reason.trim()); pushToast("Payment voided — its invoices are open again", "success"); setVoiding(null); setReason(""); await onDone(); }
    catch (e) { pushToast(userFacingApiError(e, "Payment not voided"), "error"); }
  };
  return (
    <ParityTable<ScentsxArPayment> selectable
      cardTitle title={tr("perfume.ar.payments", "Payments")} rows={rows} rowKey={(r) => `${r.id}-${r.voided_at ?? ""}`} storageKey="perfume-ar-payments-v1" exportFilename="TIO customer payments" exportExcel
      emptyText="No payments recorded for this customer."
      columns={[
        { className: "text-left", key: "number", label: "Payment", render: (r) => <Link className="underline" to={`/accounting/payments/${encodeURIComponent(r.id)}`}>{r.number ?? r.id.slice(0, 8)}</Link>, exportValue: (r) => r.number ?? "" },
        { key: "date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(r.date), exportValue: (r) => r.date },
        { className: "text-left", key: "method", sortable: true, label: "Tender", render: (r) => r.method, exportValue: (r) => r.method },
        { className: "text-left", key: "reference", sortable: true, label: "Reference", render: (r) => r.reference ?? DASH, exportValue: (r) => r.reference ?? "" },
        { key: "amount_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.amount_cents), exportValue: (r) => r.amount_cents / 100 },
        { key: "applied_cents", sortable: true, label: "Applied", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.applied_cents), exportValue: (r) => r.applied_cents / 100 },
        { key: "unapplied_cents", sortable: true, label: "Unapplied", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.unapplied_cents), exportValue: (r) => r.unapplied_cents / 100 },
        { className: "text-left", key: "voided_at", label: "Status", render: (r) => (r.voided_at ? `Voided — ${r.void_reason ?? ""}` : voiding === r.id ? (
          <span className="flex items-center gap-1">
            <input className={`${ctl} w-[180px]`} aria-label={tr("perfume.ar.void_reason", "Why the payment is voided")} placeholder="Why (3+ letters)" value={reason} onChange={(e) => setReason(e.target.value)} data-testid={`perfume-ar-void-reason-${r.id}`} />
            <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" disabled={reason.trim().length < 3} onClick={() => void doVoid(r.id)} data-testid={`perfume-ar-void-confirm-${r.id}`}>{tr("perfume.ar.void_it", "Void")}</Button>
            <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => setVoiding(null)}>{tr("perfume.ar.cancel", "Cancel")}</Button>
          </span>) : (
          <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => { setVoiding(r.id); setReason(""); }} data-testid={`perfume-ar-void-${r.id}`}>{tr("perfume.ar.void", "Void payment")}</Button>)),
          exportValue: (r) => (r.voided_at ? `Voided — ${r.void_reason ?? ""}` : "Posted") },
      ]}
    />
  );
}
