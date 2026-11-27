/**
 * SCENTSX B9 — Cash & Form 8300 desk inside ScentsX's Books (owner 2026-11-26 20:18 CT "compliance for money forms … money
 * laundering etc fincen"). Logs every cash-like receipt with its payment form and payer, shows Form 8300 cases with their
 * 15-day due date, structuring alerts waiting for review, and ScentsX cash payments taken in the payment engine but never
 * logged here. The money itself is received and posted by the existing payment engine; this desk is the compliance record.
 * Full SSN / ITIN / ID numbers are never typed here — last 4 and a copy of the ID only.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { EntityLink } from "../../components/shared/EntityLink";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { userFacingApiError } from "../../lib/api-error-message";
import { uploadSourceDocumentFromFile } from "../../api/docs";
import {
  createScentsxCashPayer, getScentsxCompany, getScentsxCompliance, markScentsx8300Filed, markScentsx8300StatementSent, markScentsxReceiptSuspicious,
  recordScentsxCashReceipt, reviewScentsxStructuringAlert, updateScentsxCashPayer, voidScentsxCashReceipt,
  clearScentsxScreening, confirmScentsxMatch, getScentsxSanctions, loadScentsxSanctionsList, type ScentsxScreening, getScentsxKycDesk, type ScentsxKycDesk,
  type Scentsx8300Case, type ScentsxCashReceipt, type ScentsxPayerInput, type ScentsxPaymentForm, type ScentsxStructuringAlert, type ScentsxUnloggedCash,
} from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { ScentsxKycBlock } from "./ScentsxKycBlock";

const money = (cents: number | string) => (Number(cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (iso: string | null) => (iso ? String(iso).slice(0, 10) : "—");
const FORMS: Array<[ScentsxPaymentForm, string]> = [
  ["currency_usd", "US currency"], ["currency_foreign", "Foreign currency"], ["cashiers_check", "Cashier's check"], ["money_order", "Money order"],
  ["bank_draft", "Bank draft"], ["travelers_check", "Traveler's check"], ["personal_check", "Personal check"], ["wire", "Wire"], ["card", "Card"],
];
const INSTRUMENT = new Set<ScentsxPaymentForm>(["cashiers_check", "money_order", "bank_draft", "travelers_check"]);
const inputCls = "h-[30px] rounded-sm border border-[#C6D1DC] px-2";

export function ScentsxCompliancePanel() {
  const { pushToast } = useToast();
  const desk = useQuery({ queryKey: ["scentsx", "compliance"], queryFn: getScentsxCompliance });
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  // Notes for the three non-void actions (suspicious reason, BSA confirmation, alert review). A VOID goes through VoidReasonModal.
  const [noteFor, setNoteFor] = useState<{ id: string; action: "suspicious" | "filed" | "review" } | null>(null);
  const [note, setNote] = useState("");
  const [voiding, setVoiding] = useState<ScentsxCashReceipt | null>(null);
  if (desk.isError) return <ListErrorState title={tr("scentsx.cash.error", "Couldn't load the cash log")} status={0} message={(desk.error as Error)?.message} onRetry={() => void desk.refetch()} />;
  const d = desk.data;
  const openCases = (d?.cases ?? []).filter((c) => c.status === "open");
  const overdue = openCases.filter((c) => c.overdue);
  const alertsOpen = (d?.alerts ?? []).filter((a) => !a.reviewed_at);
  const unlogged = d?.unlogged_cash_payments ?? [];
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const act = async () => {
    if (!noteFor || note.trim().length < 3) return;
    try {
      if (noteFor.action === "suspicious") { const r = await markScentsxReceiptSuspicious(noteFor.id, note); pushToast(`Form 8300 ${r.case.case_no} opened, due ${r.case.due_on}`, "success"); }
      if (noteFor.action === "filed") await markScentsx8300Filed(noteFor.id, note);
      if (noteFor.action === "review") await reviewScentsxStructuringAlert(noteFor.id, note);
      setNoteFor(null); setNote(""); void desk.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  const noteBox = (id: string, action: "suspicious" | "filed" | "review", label: string) =>
    noteFor?.id === id && noteFor.action === action ? (
      <span className="flex items-center gap-1">
        <input className={inputCls} autoFocus placeholder={label} value={note} onChange={(e) => setNote(e.target.value)} aria-label={label} />
        <Button type="button" className="h-[28px] px-2 text-xs" disabled={note.trim().length < 3} onClick={() => void act()}>{tr("scentsx.cash.save", "Save")}</Button>
        <button type="button" className="underline" onClick={() => setNoteFor(null)}>{tr("scentsx.cash.cancel", "Cancel")}</button>
      </span>
    ) : null;

  return (
    <section className="space-y-3" data-testid="scentsx-compliance">
      <div className="rounded-[3px] border border-[#D8E0E8] bg-white p-3 text-xs">
        <div className="text-section-header">{tr("scentsx.cash.title", "Cash & Form 8300")}</div>
        <div className="mt-1 text-[#64748B]">
          {d ? `Form 8300 when related cash from one payer is over ${money(d.settings.cash_report_threshold_cents)} (within ${d.settings.related_window_hours} hours, on the same order or invoice, or linked) — file within ${d.settings.filing_days} days. Alert when ${d.settings.structuring_min_count}+ cash receipts of ${money(d.settings.structuring_floor_cents)}–${money(d.settings.cash_report_threshold_cents)} come within ${d.settings.structuring_window_days} days. Never tell a payer to split a payment.` : "…"}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiCard label={tr("scentsx.cash.kpi_open", "Form 8300 to file")} number={String(openCases.length)} onClick={() => jump("scentsx-8300-cases")} />
        <KpiCard label={tr("scentsx.cash.kpi_overdue", "Past due")} number={String(overdue.length)} onClick={() => jump("scentsx-8300-cases")} />
        <KpiCard label={tr("scentsx.cash.kpi_alerts", "Alerts to review")} number={String(alertsOpen.length)} onClick={() => jump("scentsx-structuring")} />
        <KpiCard label={tr("scentsx.cash.kpi_unlogged", "Cash payments not logged")} number={String(unlogged.length)} onClick={() => jump("scentsx-unlogged")} />
      </div>
      {overdue.length ? (
        <div className="rounded-[3px] border border-[#B91C1C] bg-[#FEF2F2] p-2 text-xs font-semibold text-[#B91C1C]" data-testid="scentsx-8300-overdue">
          {overdue.map((c) => `${c.case_no} (${c.payer_name}) was due ${c.due_on}`).join(" · ")}
        </div>
      ) : null}

      <SanctionsBlock />

      <KycDeskBlock companyId={co.data?.company.id ?? null} />

      <ReceiptForm payers={d?.payers ?? []} companyId={co.data?.company.id ?? null} unlogged={unlogged} onDone={() => void desk.refetch()} />

      <div id="scentsx-8300-cases">
        <ParityTable<Scentsx8300Case>
          title={tr("scentsx.cash.cases", "Form 8300 cases")}
          rows={d?.cases ?? []}
          rowKey={(c) => c.id}
          loading={desk.isLoading}
          storageKey="scentsx-8300-cases-v1"
          exportFilename="ScentsX Form 8300 cases"
          exportExcel
          emptyText="No Form 8300 cases."
          columns={[
            { key: "case_no", label: "Case", sortable: true, render: (c) => <span className="font-semibold">{c.case_no}</span> },
            { key: "payer_name", label: "Payer", sortable: true },
            { key: "reason", label: "Why", sortable: true, render: (c) => (c.reason === "voluntary_suspicious" ? "Suspicious (voluntary)" : "Cash over the line") },
            { key: "total_cash_cents", label: "Cash", sortable: true, cellClass: "text-right tabular-nums", render: (c) => money(c.total_cash_cents) },
            { key: "due_on", label: "Due date", sortable: true, render: (c) => <span className={c.overdue ? "font-semibold text-[#B91C1C]" : ""}>{c.due_on}</span> },
            { key: "status", label: "Status", sortable: true, render: (c) => (c.status === "filed" ? `Filed ${day(c.filed_at)} · ${c.bsa_confirmation}` : c.status) },
            { key: "payer_statement_sent_on", label: "Payer statement sent", sortable: true, render: (c) => c.payer_statement_sent_on ?? (c.status === "filed" ? (
              <button type="button" className="underline" onClick={() => void markScentsx8300StatementSent(c.id, new Date().toISOString().slice(0, 10)).then(() => desk.refetch()).catch((e) => pushToast(userFacingApiError(e, "Not saved"), "error"))}>
                {tr("scentsx.cash.sent_today", "Sent today")}</button>) : "—") },
            { key: "actions", label: "", render: (c) => c.status === "open" ? (noteBox(c.id, "filed", "BSA e-filing confirmation number") ?? (
              <button type="button" className="underline" onClick={() => { setNoteFor({ id: c.id, action: "filed" }); setNote(""); }}>{tr("scentsx.cash.mark_filed", "Mark filed")}</button>)) : null },
          ]}
        />
      </div>

      <div id="scentsx-structuring">
        <ParityTable<ScentsxStructuringAlert>
          title={tr("scentsx.cash.alerts", "Structuring alerts")}
          rows={d?.alerts ?? []}
          rowKey={(a) => a.id}
          loading={desk.isLoading}
          storageKey="scentsx-structuring-v1"
          emptyText="No alerts."
          columns={[
            { key: "created_at", label: "Raised on", sortable: true, render: (a) => day(a.created_at) },
            { key: "payer_name", label: "Payer", sortable: true },
            { key: "receipt_no", label: "Receipt", sortable: true },
            { key: "receipt_count", label: "Receipts in window", sortable: true, cellClass: "text-right tabular-nums" },
            { key: "window_total_cents", label: "Total", sortable: true, cellClass: "text-right tabular-nums", render: (a) => money(a.window_total_cents) },
            { key: "review_note", label: "Review", render: (a) => a.reviewed_at ? `${day(a.reviewed_at)} · ${a.review_note}` : (noteBox(a.id, "review", "What you found") ?? (
              <button type="button" className="underline" onClick={() => { setNoteFor({ id: a.id, action: "review" }); setNote(""); }}>{tr("scentsx.cash.review", "Review")}</button>)) },
          ]}
        />
      </div>

      <div id="scentsx-unlogged">
        <ParityTable<ScentsxUnloggedCash>
          title={tr("scentsx.cash.unlogged", "ScentsX cash payments not in the cash log")}
          rows={unlogged}
          rowKey={(p) => p.id}
          loading={desk.isLoading}
          storageKey="scentsx-unlogged-cash-v1"
          emptyText="Every ScentsX cash payment is logged."
          columns={[
            { key: "payment_date", label: "Payment date", sortable: true },
            { key: "display_id", label: "Payment", sortable: true, render: (p) => <EntityLink kind="payment" id={p.id} label={p.display_id ?? p.id.slice(0, 8)} /> },
            { key: "amount_cents", label: "Amount", sortable: true, cellClass: "text-right tabular-nums", render: (p) => money(p.amount_cents) },
          ]}
        />
      </div>

      <ParityTable<ScentsxCashReceipt>
        title={tr("scentsx.cash.receipts", "Cash log")}
        rows={d?.receipts ?? []}
        rowKey={(r) => r.id}
        loading={desk.isLoading}
        storageKey="scentsx-cash-log-v1"
        exportFilename="ScentsX cash log"
        exportExcel
        emptyText="No receipts logged."
        columns={[
          { key: "received_at", label: "Received on", sortable: true, render: (r) => day(r.received_at) },
          { key: "receipt_no", label: "Receipt", sortable: true, render: (r) => <span className={r.voided_at ? "line-through" : "font-semibold"}>{r.receipt_no}</span> },
          { key: "payer_name", label: "Payer", sortable: true },
          { key: "payment_form", label: "Form", sortable: true, render: (r) => FORMS.find(([k]) => k === r.payment_form)?.[1] ?? r.payment_form },
          { key: "amount_cents", label: "Amount", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.amount_cents) },
          { key: "counts_as_cash", label: "Counts as cash", sortable: true, render: (r) => (r.counts_as_cash ? "Yes" : "No") },
          { key: "case_no", label: "Form 8300", sortable: true, render: (r) => r.case_no ?? "—" },
          { key: "payment_id", label: "Payment", render: (r) => (r.payment_id ? <EntityLink kind="payment" id={r.payment_id} label="Open" /> : "—") },
          { key: "actions", label: "", render: (r) => r.voided_at ? `Voided: ${r.void_reason}` : (noteBox(r.id, "suspicious", "Why suspicious") ?? (
            <span className="flex gap-2">
              <button type="button" className="underline" onClick={() => setVoiding(r)}>{tr("scentsx.cash.void", "Void")}</button>
              {!r.case_no ? <button type="button" className="underline" onClick={() => { setNoteFor({ id: r.id, action: "suspicious" }); setNote(""); }}>{tr("scentsx.cash.suspicious", "Suspicious")}</button> : null}
            </span>)) },
        ]}
      />
      <VoidReasonModal
        open={voiding != null}
        title={voiding ? `Void cash receipt ${voiding.receipt_no}` : ""}
        entityRef={voiding?.receipt_no}
        onClose={() => setVoiding(null)}
        onSubmit={async (why) => { if (!voiding) return; await voidScentsxCashReceipt(voiding.id, why); setVoiding(null); void desk.refetch(); }}
      />
    </section>
  );
}

function ReceiptForm({ payers, companyId, unlogged, onDone }: { payers: Array<{ id: string; legal_name: string; identity_complete: boolean; payer_kind: string }>; companyId: string | null; unlogged: ScentsxUnloggedCash[]; onDone: () => void }) {
  const { pushToast } = useToast();
  const [payerId, setPayerId] = useState("");
  const [form, setForm] = useState<ScentsxPaymentForm>("currency_usd");
  const [cents, setCents] = useState<number | null>(null);
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 16));
  const [paymentId, setPaymentId] = useState("");
  const [issuer, setIssuer] = useState("");
  const [serial, setSerial] = useState("");
  const [ccy, setCcy] = useState("MXN");
  const [durable, setDurable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needIdentity, setNeedIdentity] = useState<string[] | null>(null);
  const [newPayer, setNewPayer] = useState(false);
  const save = async () => {
    if (!payerId || !cents) return;
    setBusy(true);
    try {
      const { receipt } = await recordScentsxCashReceipt({
        payer_id: payerId, payment_form: form, amount_cents: cents, received_at: new Date(when).toISOString(), payment_id: paymentId || null,
        instrument_issuer: INSTRUMENT.has(form) ? issuer : null, instrument_serial: INSTRUMENT.has(form) ? serial : null,
        foreign_currency_code: form === "currency_foreign" ? ccy : null, consumer_durable_retail: durable,
      });
      pushToast(receipt.case ? `${receipt.receipt_no} logged — Form 8300 ${receipt.case.case_no} is due ${receipt.case.due_on}` : `${receipt.receipt_no} logged`, receipt.case ? "info" : "success");
      if (receipt.structuring_alert_id) pushToast("Structuring alert raised for the owner to review", "info");
      setCents(null); setPaymentId(""); setNeedIdentity(null); onDone();
    } catch (e) {
      const missing = (e as { data?: { missing?: string[] } })?.data?.missing;
      if (missing?.length) setNeedIdentity(missing);
      pushToast(userFacingApiError(e, "Not logged"), "error");
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3 text-xs" data-testid="scentsx-cash-form">
      <div className="text-section-header">{tr("scentsx.cash.log", "Log a cash receipt")}</div>
      <div className="flex flex-wrap items-center gap-2">
        <select className={inputCls} aria-label="Payer" value={payerId} onChange={(e) => setPayerId(e.target.value)}>
          <option value="">{tr("scentsx.cash.pick_payer", "Payer…")}</option>
          {payers.map((p) => <option key={p.id} value={p.id}>{p.legal_name}{p.identity_complete ? "" : " (identity incomplete)"}</option>)}
        </select>
        <button type="button" className="underline" onClick={() => setNewPayer((v) => !v)}>{tr("scentsx.cash.new_payer", "New payer")}</button>
        <select className={inputCls} aria-label="Payment form" value={form} onChange={(e) => setForm(e.target.value as ScentsxPaymentForm)}>
          {FORMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <MoneyInput valueCents={cents} onChangeCents={setCents} ariaLabel="Amount" />
        <input type="datetime-local" className={inputCls} aria-label="Received" value={when} onChange={(e) => setWhen(e.target.value)} />
        <select className={inputCls} aria-label="ScentsX payment" value={paymentId} onChange={(e) => setPaymentId(e.target.value)}>
          <option value="">{tr("scentsx.cash.no_payment", "Payment in the books (optional)")}</option>
          {unlogged.map((p) => <option key={p.id} value={p.id}>{p.payment_date} · {money(p.amount_cents)}</option>)}
        </select>
      </div>
      {INSTRUMENT.has(form) ? (
        <div className="flex flex-wrap items-center gap-2">
          <input className={inputCls} placeholder="Issuer (bank)" aria-label="Issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
          <input className={inputCls} placeholder="Serial number" aria-label="Serial number" value={serial} onChange={(e) => setSerial(e.target.value)} />
          <label className="flex items-center gap-1"><input type="checkbox" checked={durable} onChange={(e) => setDurable(e.target.checked)} />{tr("scentsx.cash.durable", "Retail sale of a consumer durable")}</label>
        </div>
      ) : null}
      {form === "currency_foreign" ? <input className={inputCls} aria-label="Currency" value={ccy} maxLength={3} onChange={(e) => setCcy(e.target.value.toUpperCase())} /> : null}
      {needIdentity ? <div className="font-semibold text-[#B91C1C]" data-testid="scentsx-cash-identity-needed">{tr("scentsx.cash.identity_needed", "Complete the payer's identity first")}: {needIdentity.join(", ")}</div> : null}
      <Button type="button" className="h-[30px] px-3 text-xs" disabled={busy || !payerId || !cents} onClick={() => void save()} data-testid="scentsx-cash-save">{tr("scentsx.cash.save_receipt", "Log receipt")}</Button>
      {newPayer || (needIdentity && payerId) ? <PayerForm companyId={companyId} payerId={needIdentity ? payerId : null} onDone={(id) => { setPayerId(id); setNewPayer(false); setNeedIdentity(null); onDone(); }} /> : null}
    </div>
  );
}

function PayerForm({ companyId, payerId, onDone }: { companyId: string | null; payerId: string | null; onDone: (id: string) => void }) {
  const { pushToast } = useToast();
  const [p, setP] = useState<ScentsxPayerInput>({ payer_kind: "individual", legal_name: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ScentsxPayerInput) => (e: { target: { value: string } }) => setP((x) => ({ ...x, [k]: e.target.value || null }));
  const save = async () => {
    setBusy(true);
    try {
      const fileId = file && companyId ? await uploadSourceDocumentFromFile(file, { operating_company_id: companyId }) : undefined;
      const body = { ...p, ...(fileId ? { id_copy_file_id: fileId } : {}) };
      // Completing an existing payer sends only what was typed, so a blank box never erases what is already on file.
      const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v != null && String(v).trim() !== "")) as Partial<ScentsxPayerInput>;
      const r = payerId ? await updateScentsxCashPayer(payerId, patch) : await createScentsxCashPayer(body);
      pushToast(r.payer.identity_complete ? "Payer saved — identity complete" : `Payer saved — still missing: ${r.payer.missing.join(", ")}`, r.payer.identity_complete ? "success" : "info");
      onDone(r.payer.id);
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  const field = (k: keyof ScentsxPayerInput, label: string, type = "text") => (
    <input className={inputCls} type={type} placeholder={label} aria-label={label} value={String(p[k] ?? "")} onChange={set(k)} />
  );
  return (
    <div className="space-y-2 border-t border-[#E5EAF0] pt-2" data-testid="scentsx-payer-form">
      <div className="font-semibold">{payerId ? tr("scentsx.cash.complete_identity", "Complete payer identity (Form 8300)") : tr("scentsx.cash.new_payer", "New payer")}</div>
      <div className="flex flex-wrap items-center gap-2">
        <select className={inputCls} aria-label="Payer kind" value={p.payer_kind} onChange={(e) => setP((x) => ({ ...x, payer_kind: e.target.value as "individual" | "business" }))}>
          <option value="individual">Individual</option><option value="business">Business</option>
        </select>
        {field("legal_name", "Legal name")}{field("address_line", "Street address")}{field("city", "City")}{field("state_region", "State")}
        {field("postal_code", "ZIP")}{field("country", "Country")}{field("occupation", p.payer_kind === "business" ? "Nature of business" : "Occupation (specific)")}
        {p.payer_kind === "individual" ? field("date_of_birth", "Date of birth", "date") : null}
        <select className={inputCls} aria-label="Tax ID kind" value={p.tin_kind ?? ""} onChange={(e) => setP((x) => ({ ...x, tin_kind: (e.target.value || null) as ScentsxPayerInput["tin_kind"] }))}>
          <option value="">Tax ID…</option><option value="ssn">SSN</option><option value="itin">ITIN</option><option value="ein">EIN</option><option value="foreign_none">Foreign, none</option>
        </select>
        {p.tin_kind && p.tin_kind !== "foreign_none" ? field("tin_last4", "Tax ID last 4") : null}
        {p.payer_kind === "individual" ? (
          <>
            <select className={inputCls} aria-label="ID type" value={p.id_type ?? ""} onChange={(e) => setP((x) => ({ ...x, id_type: (e.target.value || null) as ScentsxPayerInput["id_type"] }))}>
              <option value="">ID…</option><option value="drivers_license">Driver's license</option><option value="passport">Passport</option>
              <option value="alien_registration">Alien registration</option><option value="ine_mexico">INE (Mexico)</option><option value="other_government">Other government ID</option>
            </select>
            {field("id_issuer", "ID issued by")}{field("id_number_last4", "ID number last 4")}
            <label className="flex items-center gap-1">{tr("scentsx.cash.id_copy", "ID copy")}<input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          </>
        ) : null}
      </div>
      <Button type="button" className="h-[30px] px-3 text-xs" disabled={busy || (!payerId && !p.legal_name.trim())} onClick={() => void save()}>{tr("scentsx.cash.save_payer", "Save payer")}</Button>
    </div>
  );
}

/** OFAC: the list in use, "Load the newest list" (re-screens every ScentsX party), and possible matches waiting for a decision. */
function SanctionsBlock() {
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["scentsx", "sanctions"], queryFn: getScentsxSanctions });
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  if (q.isError) return <ListErrorState title={tr("scentsx.ofac.error", "Couldn't load the OFAC screening")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const load = async () => {
    setBusy(true);
    try {
      const r = await loadScentsxSanctionsList();
      pushToast(`${r.load.new_load ? "New OFAC list loaded" : "OFAC list unchanged"} (${r.load.names.toLocaleString("en-US")} names) — ${r.rescreen.screened} re-screened, ${r.rescreen.possible_matches} possible matches`, "success");
      void q.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Not loaded"), "error"); } finally { setBusy(false); }
  };
  const decide = async (id: string, confirm: boolean) => {
    try {
      if (confirm) await confirmScentsxMatch(id); else await clearScentsxScreening(id, why);
      setClearing(null); setWhy(""); void q.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  const list = q.data?.list;
  return (
    <div className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3 text-xs" data-testid="scentsx-ofac">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-section-header">{tr("scentsx.ofac.title", "OFAC sanctions screening")}</div>
          <div className="text-[#64748B]">{list ? `List loaded ${day(list.loaded_at)} · ${list.sdn_rows.toLocaleString("en-US")} names + ${list.alt_rows.toLocaleString("en-US")} aliases · refreshed daily` : tr("scentsx.ofac.none", "No OFAC list loaded yet — nobody can be cleared to buy or sell until it is.")}</div>
        </div>
        <Button type="button" className="h-[30px] px-3 text-xs" disabled={busy} onClick={() => void load()} data-testid="scentsx-ofac-load">{tr("scentsx.ofac.load", "Load the newest list")}</Button>
      </div>
      <ParityTable<ScentsxScreening>
        title={tr("scentsx.ofac.open", "Possible matches waiting for you")}
        rows={q.data?.open_matches ?? []}
        rowKey={(s) => s.id}
        loading={q.isLoading}
        storageKey="scentsx-ofac-open-v1"
        emptyText="No possible matches."
        columns={[
          { key: "created_at", label: "Screened on", sortable: true, render: (s) => day(s.created_at) },
          { key: "screened_name", label: "Name screened", sortable: true },
          { key: "party_kind", label: "Who", sortable: true, render: (s) => s.party_kind.replace("_", " ") },
          { key: "hits", label: "Listed as", render: (s) => (s.hits ?? []).slice(0, 3).map((h) => `${h.name} (${h.program ?? "—"}, ${Math.round(h.score * 100)}%)`).join(" · ") },
          { key: "actions", label: "", render: (s) => clearing === s.id ? (
            <span className="flex items-center gap-1">
              <input className={inputCls} autoFocus placeholder="Why it is not them" aria-label="Why it is not them" value={why} onChange={(e) => setWhy(e.target.value)} />
              <Button type="button" className="h-[28px] px-2 text-xs" disabled={why.trim().length < 10} onClick={() => void decide(s.id, false)}>{tr("scentsx.ofac.clear", "Not them — clear")}</Button>
              <button type="button" className="underline" onClick={() => setClearing(null)}>{tr("scentsx.cash.cancel", "Cancel")}</button>
            </span>
          ) : (
            <span className="flex gap-2">
              <button type="button" className="underline" onClick={() => { setClearing(s.id); setWhy(""); }}>{tr("scentsx.ofac.not_them", "Not them")}</button>
              <button type="button" className="font-semibold text-[#B91C1C] underline" onClick={() => void decide(s.id, true)}>{tr("scentsx.ofac.confirm", "It is them — block")}</button>
            </span>
          ) },
        ]}
      />
    </div>
  );
}

const KYC_LABEL: Record<string, string> = { kyc_profile: "no profile", phone_or_email: "phone/email", passport_copy: "passport copy", visa_copy: "visa copy",
  constancia_situacion_fiscal: "Constancia", sales_tax_permit_number: "sales tax permit", sales_tax_permit_copy: "permit copy", ssn_itin_last4: "SSN/ITIN last 4" };

/** SCENTSX B12 — every linked ScentsX customer and vendor with its KYC result (RFC / CURP / passport / visa / EIN / sales tax permit /
 *  W-9 / W-8) and every pagaré held. Open a row to complete it; the rule list is the server's (kyc.service.ts). */
function KycDeskBlock({ companyId }: { companyId: string | null }) {
  const q = useQuery({ queryKey: ["scentsx", "kyc-desk"], queryFn: getScentsxKycDesk });
  const [open, setOpen] = useState<string | null>(null);
  if (q.isError) return <ListErrorState title={tr("scentsx.kyc.desk_error", "Couldn't load KYC")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const d = q.data;
  type Row = ScentsxKycDesk["parties"][number];
  return (
    <div className="space-y-2" data-testid="scentsx-kyc-desk">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard label={tr("scentsx.kyc.complete", "KYC complete")} number={String(d?.counts.complete ?? "—")} />
        <KpiCard label={tr("scentsx.kyc.incomplete", "KYC missing documents")} number={String(d?.counts.incomplete ?? "—")} />
        <KpiCard label={tr("scentsx.kyc.none", "No KYC yet")} number={String(d?.counts.none ?? "—")} />
        <KpiCard label={tr("scentsx.kyc.expiring", "Documents expiring ≤ 60 days")} number={String(d?.counts.expiring ?? "—")} />
      </div>
      <ParityTable<Row>
        title={tr("scentsx.kyc.title", "Customers & vendors — KYC and tax forms")}
        rows={d?.parties ?? []}
        rowKey={(r) => `${r.kind}:${r.party_id}`}
        loading={q.isLoading}
        storageKey="scentsx-kyc-desk-v1"
        exportFilename="ScentsX KYC status"
        exportExcel
        emptyText="No ScentsX customer or vendor linked yet."
        columns={[
          { key: "name", label: "Party", sortable: true, render: (r) => <EntityLink kind={r.kind === "customer" ? "customer" : "vendor"} id={r.engine_id} label={r.name} /> },
          { key: "kind", label: "Side", sortable: true, render: (r) => (r.kind === "customer" ? "Customer (A/R)" : "Vendor (A/P)") },
          { key: "status", label: "KYC", sortable: true, render: (r) => <span className={r.status === "complete" ? "text-[#15803D]" : "font-semibold text-[#B45309]"}>{r.status === "complete" ? (r.reviewed_at ? "Complete, reviewed" : "Complete") : r.status === "none" ? "Not started" : "Missing"}</span> },
          { key: "missing", label: "Missing / expiring", render: (r) => [...r.missing.map((m) => KYC_LABEL[m] ?? m.replace(/_/g, " ")), ...r.warnings.map((w) => w.replace(/_expires_/, " expires ").replace(/_/g, " "))].join(", ") || "—" },
          { key: "actions", label: "", render: (r) => <button type="button" className="underline" onClick={() => setOpen(open === `${r.kind}:${r.party_id}` ? null : `${r.kind}:${r.party_id}`)}>{open === `${r.kind}:${r.party_id}` ? "Close" : "Open"}</button> },
        ]}
      />
      {open ? (() => {
        const r = (d?.parties ?? []).find((x) => `${x.kind}:${x.party_id}` === open);
        return r ? <div className="rounded-[3px] border border-[#D8E0E8] p-2 text-xs"><div className="font-semibold">{r.name}</div><ScentsxKycBlock kind={r.kind} partyId={r.party_id} companyId={companyId} defaultName={r.name} /></div> : null;
      })() : null}
      {(d?.pagares_held.length ?? 0) > 0 ? (
        <div className="rounded-[3px] border border-[#D8E0E8] p-2 text-xs" data-testid="scentsx-pagares-held">
          <div className="font-semibold text-[#1F2A44]">{tr("scentsx.kyc.pagares", "Pagarés held as security")}</div>
          {d!.pagares_held.map((x) => (
            <div key={x.id} className="flex justify-between gap-2">
              <span>{x.pagare_no} · {x.customer_name}</span>
              <span className="tabular-nums">{(x.amount_cents / 100).toLocaleString("en-US", { style: "currency", currency: x.currency })} · {x.issued_on}{x.due_on ? ` → ${x.due_on}` : " (a la vista)"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
