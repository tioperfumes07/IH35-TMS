/**
 * SCENTSX B12 — a party's KYC profile, IRS tax forms and (customers) pagarés, on the customer card and in Books → Compliance.
 * Owner 2026-11-26 23:17 CT: "VISA PASSPORT RFC CURP FOR MEXICAN CUSTOMERS … WBEN8 … PAGARES … FOR US OR AMERICAN CUSTOMERS THE FED
 * TAX ID, SALES TAX ID, ETC, CONTACT INFORMATION". The rule list (what is missing) comes from the server (kyc.service.ts requirements)
 * — this screen never decides completeness itself. Every document is uploaded to docs.files first; the row stores only the file id.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { uploadSourceDocumentFromFile } from "../../api/docs";
import {
  addScentsxPagare, addScentsxTaxForm, closeScentsxPagare, getScentsxPartyKyc, markScentsxKycReviewed, saveScentsxPartyKyc, voidScentsxTaxForm,
  type ScentsxKycKind, type ScentsxKycProfile, type ScentsxTaxForm,
} from "../../api/scentsx";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { tr } from "./perfumeI18n";

const LABEL: Record<string, string> = {
  kyc_profile: "KYC profile", legal_name: "legal name", phone_or_email: "phone or email", address_line: "street", city: "city", country: "country",
  rfc: "RFC", curp: "CURP", passport_number: "passport number", passport_expires_on: "passport expiry", passport_copy: "passport copy", passport_expired: "passport EXPIRED",
  visa_number: "visa / border card number", visa_expires_on: "visa expiry", visa_copy: "visa copy", visa_expired: "visa EXPIRED",
  constancia_situacion_fiscal: "Constancia de Situación Fiscal", ein: "EIN", sales_tax_permit_number: "sales tax permit number", sales_tax_permit_copy: "sales tax permit copy",
  ssn_itin_last4: "SSN / ITIN last 4", "W-9": "W-9", "W-8BEN": "W-8BEN", "W-8BEN-E": "W-8BEN-E", "W-9_expired": "W-9 expired",
  "W-8BEN_expired": "W-8BEN EXPIRED", "W-8BEN-E_expired": "W-8BEN-E EXPIRED",
};
const label = (k: string) => LABEL[k] ?? k.replace(/_/g, " ");
const money = (cents: number, cur: string) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: cur });
const input = "h-10 rounded-sm border border-[#C6D1DC] px-2 text-xs";

type Draft = Partial<ScentsxKycProfile>;
type FileKey = "passport_file_id" | "visa_file_id" | "ine_file_id" | "constancia_fiscal_file_id" | "sales_tax_permit_file_id" | "proof_of_address_file_id";

export function ScentsxKycBlock({ kind, partyId, companyId, defaultName }: { kind: ScentsxKycKind; partyId: string; companyId: string | null; defaultName: string }) {
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["scentsx", "kyc", kind, partyId], queryFn: () => getScentsxPartyKyc(kind, partyId) });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [files, setFiles] = useState<Partial<Record<FileKey, File>>>({});
  const [busy, setBusy] = useState(false);
  if (q.isError) return <div className="mt-1 text-[#B91C1C]">{tr("scentsx.kyc.error", "Couldn't load KYC")} <button type="button" className="underline" onClick={() => void q.refetch()}>{tr("scentsx.cust.retry", "Retry")}</button></div>;
  const d = q.data;
  if (!d) return null;
  const p: Draft = { residency: "mexico", entity_kind: "individual", legal_name: defaultName, ...(d.profile ?? {}), ...draft };
  const set = (k: keyof ScentsxKycProfile) => (e: { target: { value: string } }) => setDraft((x) => ({ ...x, [k]: e.target.value }));
  const field = (k: keyof ScentsxKycProfile, ph: string, w = "w-40") => (
    <input className={`${input} ${w}`} aria-label={ph} placeholder={ph} value={String(p[k] ?? "")} onChange={set(k)} data-testid={`kyc-${String(k)}`} />
  );
  const dateField = (k: "passport_expires_on" | "visa_expires_on", ph: string) => (
    <DatePicker aria-label={ph} value={String(p[k] ?? "")} onChange={(v) => setDraft((x) => ({ ...x, [k]: v || null }))} data-testid={`kyc-${k}`} />
  );
  const fileIn = (k: FileKey, ph: string) => (
    <label className="flex items-center gap-1 text-[#64748B]">
      <span>{ph}{p[k] ? " ✓" : ""}</span>
      <input type="file" accept="image/*,application/pdf" aria-label={ph} onChange={(e) => { const f = e.target.files?.[0]; if (f) setFiles((x) => ({ ...x, [k]: f })); }} />
    </label>
  );
  const upload = async (f: File) => {
    if (!companyId) throw new Error("ScentsX company not loaded");
    const id = await uploadSourceDocumentFromFile(f, { operating_company_id: companyId });
    if (!id) throw new Error("The file did not upload");
    return id;
  };
  const save = async () => {
    setBusy(true);
    try {
      const body: Draft = { ...draft };
      if (!d.profile) Object.assign(body, { residency: p.residency, entity_kind: p.entity_kind, legal_name: p.legal_name });
      for (const [k, f] of Object.entries(files) as Array<[FileKey, File]>) body[k] = await upload(f);
      const r = await saveScentsxPartyKyc(kind, partyId, body);
      pushToast(r.status === "complete" ? "KYC complete" : `Saved — still missing: ${r.missing.map(label).join(", ")}`, r.status === "complete" ? "success" : "info");
      setDraft({}); setFiles({}); void q.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  const reviewed = async () => {
    setBusy(true);
    try { await markScentsxKycReviewed(kind, partyId); pushToast("Marked reviewed", "success"); void q.refetch(); }
    catch (e) { pushToast(userFacingApiError(e, "Not marked"), "error"); } finally { setBusy(false); }
  };
  const mx = p.residency === "mexico";
  const us = p.residency === "us";
  const ind = p.entity_kind === "individual";
  const chip = d.status === "complete" ? "text-[#15803D]" : "font-semibold text-[#B45309]";
  return (
    <div className="mt-2 space-y-1 border-t border-[#E5EAF0] pt-2" data-testid={`scentsx-kyc-${kind}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={chip} data-testid="scentsx-kyc-status">{tr("scentsx.kycblock.kyc", "KYC:")}{" "}{d.status === "complete" ? (d.profile?.reviewed_at ? "complete, reviewed" : "complete — not reviewed yet") : d.status === "none" ? "not started" : `missing ${d.missing.map(label).join(", ")}`}
        </span>
        <button type="button" className="underline" onClick={() => setOpen((x) => !x)} data-testid="scentsx-kyc-toggle">{open ? "Close" : d.profile ? "Edit" : "Start"}</button>
      </div>
      {d.warnings.length ? <div className="text-[#B45309]" data-testid="scentsx-kyc-warnings">{tr("scentsx.kycblock.expiring", "Expiring:")}{" "}{d.warnings.map((w) => w.replace(/_expires_/, " on ").replace(/_/g, " ")).join(" · ")}</div> : null}
      {open ? (
        <div className="space-y-1 rounded-[3px] bg-[#F8FAFC] p-2">
          <div className="flex flex-wrap gap-2">
            <select className={input} aria-label={tr("scentsx.kycblock.residency", "Residency")} value={p.residency} onChange={set("residency")}>
              <option value="mexico">{tr("scentsx.kycblock.mexico", "Mexico")}</option><option value="us">{tr("scentsx.kycblock.united_states", "United States")}</option><option value="other">{tr("scentsx.kycblock.other_country", "Other country")}</option>
            </select>
            <select className={input} aria-label={tr("scentsx.kycblock.kind", "Kind")} value={p.entity_kind} onChange={set("entity_kind")}>
              <option value="individual">{tr("scentsx.kycblock.individual", "Individual")}</option><option value="business">{tr("scentsx.kycblock.business", "Business")}</option>
            </select>
            {field("legal_name", "Legal name", "w-56")}{field("dba_name", "DBA / trade name")}
          </div>
          <div className="flex flex-wrap gap-2">
            {field("contact_person", "Contact person")}{field("phone", "Phone")}{field("email", "Email", "w-48")}
          </div>
          <div className="flex flex-wrap gap-2">
            {field("address_line", "Street", "w-56")}{field("city", "City", "w-32")}{field("state_region", "State", "w-28")}{field("postal_code", "ZIP", "w-20")}{field("country", "Country (MX, US)", "w-28")}
            {fileIn("proof_of_address_file_id", "Proof of address")}
          </div>
          {mx ? (
            <div className="flex flex-wrap gap-2">
              {field("rfc", "RFC")}{ind ? field("curp", "CURP", "w-48") : null}{field("regimen_fiscal", "Régimen fiscal")}
              {!ind ? fileIn("constancia_fiscal_file_id", "Constancia de Situación Fiscal") : fileIn("ine_file_id", "INE copy")}
            </div>
          ) : null}
          {us ? (
            <div className="flex flex-wrap gap-2">
              {!ind ? field("ein", "EIN (NN-NNNNNNN)") : field("ssn_itin_last4", "SSN / ITIN last 4 only", "w-36")}
              {kind === "customer" && !ind ? <>{field("sales_tax_permit_state", "Permit state (TX)", "w-28")}{field("sales_tax_permit_number", "Sales tax permit #")}{fileIn("sales_tax_permit_file_id", "Permit copy")}</> : null}
            </div>
          ) : null}
          {!us && ind ? (
            <div className="flex flex-wrap gap-2">
              {field("passport_number", "Passport number")}{field("passport_country", "Passport country", "w-28")}{dateField("passport_expires_on", "Passport expiry")}{fileIn("passport_file_id", "Passport copy")}
            </div>
          ) : null}
          {mx && ind ? (
            <div className="flex flex-wrap gap-2">
              <select className={input} aria-label={tr("scentsx.kycblock.visa_kind", "Visa kind")} value={p.visa_kind ?? ""} onChange={set("visa_kind")}>
                <option value="">{tr("scentsx.kycblock.visa_kind", "Visa kind…")}</option><option value="border_crossing_card">{tr("scentsx.kycblock.border_crossing_card_laser_visa", "Border crossing card (laser visa)")}</option><option value="b1_b2">{tr("scentsx.kycblock.b1_b2_visa", "B1/B2 visa")}</option><option value="other">{tr("scentsx.kycblock.other", "Other")}</option>
              </select>
              {field("visa_number", "Visa / card number")}{dateField("visa_expires_on", "Visa expiry")}{fileIn("visa_file_id", "Visa copy")}
            </div>
          ) : null}
          {field("notes", "Notes", "w-full")}
          <div className="flex gap-2">
            <Button type="button" className="h-[28px] px-2 text-xs" disabled={busy || (!d.profile && !p.legal_name)} onClick={() => void save()} data-testid="scentsx-kyc-save">{tr("scentsx.kycblock.save_kyc", "Save KYC")}</Button>
            {d.status === "complete" && !d.profile?.reviewed_at ? <Button type="button" className="h-[28px] px-2 text-xs" disabled={busy} onClick={() => void reviewed()}>{tr("scentsx.kycblock.mark_reviewed", "Mark reviewed")}</Button> : null}
          </div>
          {d.profile ? <TaxForms kind={kind} partyId={partyId} forms={d.tax_forms} upload={upload} onDone={() => void q.refetch()} /> : null}
        </div>
      ) : null}
      {kind === "customer" ? <Pagares contactId={partyId} pagares={d.pagares} upload={upload} suscriptor={p.legal_name ?? defaultName} onDone={() => void q.refetch()} /> : null}
    </div>
  );
}

function TaxForms({ kind, partyId, forms, upload, onDone }: { kind: ScentsxKycKind; partyId: string; forms: ScentsxTaxForm[]; upload: (f: File) => Promise<string>; onDone: () => void }) {
  const { pushToast } = useToast();
  const [form, setForm] = useState<ScentsxTaxForm["form_kind"]>("W-8BEN");
  const [signed, setSigned] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState<ScentsxTaxForm | null>(null);
  const add = async () => {
    if (!file || !signed) return;
    setBusy(true);
    try { await addScentsxTaxForm(kind, partyId, { form_kind: form, signed_on: signed, file_id: await upload(file) }); pushToast(`${form} saved`, "success"); setFile(null); setSigned(""); onDone(); }
    catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-1 border-t border-[#E5EAF0] pt-1" data-testid="scentsx-kyc-taxforms">
      <div className="font-semibold text-[#1F2A44]">{tr("scentsx.kycblock.irs_tax_forms", "IRS tax forms")}</div>
      {forms.filter((f) => !f.voided_at).map((f) => (
        <div key={f.id} className="flex justify-between gap-2">
          <span>{f.form_kind}{" "}{tr("scentsx.kycblock.signed", "· signed")}{" "}{f.signed_on}{f.expires_on ? ` · valid to ${f.expires_on}` : " · no expiry"}</span>
          <button type="button" className="underline" onClick={() => setVoiding(f)}>{tr("scentsx.kycblock.void", "Void")}</button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <select className={input} aria-label={tr("scentsx.kycblock.form", "Form")} value={form} onChange={(e) => setForm(e.target.value as ScentsxTaxForm["form_kind"])}>
          <option value="W-8BEN">{tr("scentsx.kycblock.w_8ben", "W-8BEN")}</option><option value="W-8BEN-E">{tr("scentsx.kycblock.w_8ben_e", "W-8BEN-E")}</option><option value="W-9">{tr("scentsx.kycblock.w_9", "W-9")}</option><option value="W-8ECI">{tr("scentsx.kycblock.w_8eci", "W-8ECI")}</option>
        </select>
        <DatePicker aria-label={tr("scentsx.kycblock.signed_on", "Signed on")} value={signed} onChange={setSigned} />
        <input type="file" accept="image/*,application/pdf" aria-label={tr("scentsx.kycblock.signed_form", "Signed form")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button type="button" className="h-[28px] px-2 text-xs" disabled={busy || !file || !signed} onClick={() => void add()}>{tr("scentsx.kycblock.add_form", "Add form")}</Button>
      </div>
      <VoidReasonModal open={voiding != null} title={voiding ? `Void ${voiding.form_kind} signed ${voiding.signed_on}` : ""} minLength={10}
        onClose={() => setVoiding(null)} onSubmit={async (why) => { if (!voiding) return; await voidScentsxTaxForm(voiding.id, why); setVoiding(null); onDone(); }} />
    </div>
  );
}

function Pagares({ contactId, pagares, upload, suscriptor, onDone }: { contactId: string; pagares: import("../../api/scentsx").ScentsxPagare[]; upload: (f: File) => Promise<string>; suscriptor: string; onDone: () => void }) {
  const { pushToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [v, setV] = useState({ currency: "USD" as "USD" | "MXN", issued_on: "", due_on: "", place: "Laredo, Texas", suscriptor, aval: "", rate: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState<import("../../api/scentsx").ScentsxPagare | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const held = pagares.filter((x) => x.status === "held");
  const add = async () => {
    const cents = amountCents ?? 0;
    if (!file || !v.issued_on || !(cents > 0)) return;
    setBusy(true);
    try {
      const r = await addScentsxPagare({ contact_company_id: contactId, amount_cents: cents, currency: v.currency, issued_on: v.issued_on, due_on: v.due_on || null,
        place_of_payment: v.place, suscriptor_name: v.suscriptor, aval_name: v.aval || null, moratorio_rate_pct: v.rate ? Number(v.rate) : null, signed_file_id: await upload(file) });
      pushToast(`Pagaré ${r.pagare_no} saved`, "success"); setAdding(false); setFile(null); onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  const giveBack = async (id: string) => {
    try { await closeScentsxPagare(id, "return", note); setReturning(null); setNote(""); onDone(); } catch (e) { pushToast(userFacingApiError(e, "Not changed"), "error"); }
  };
  return (
    <div className="space-y-1" data-testid="scentsx-pagares">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[#1F2A44]">{tr("scentsx.kycblock.pagare_s_held", "Pagarés held")}{held.length ? ` (${held.length})` : ""}</span>
        <button type="button" className="underline" onClick={() => setAdding((x) => !x)}>{adding ? "Cancel" : "Add pagaré"}</button>
      </div>
      {held.map((x) => (
        <div key={x.id} className="flex justify-between gap-2" data-testid="scentsx-pagare-row">
          <span>{x.pagare_no} · {money(x.amount_cents, x.currency)} · {x.issued_on}{x.due_on ? ` → ${x.due_on}` : " (a la vista)"}{x.aval_name ? ` · aval ${x.aval_name}` : ""}</span>
          {returning === x.id ? (
            <span className="flex gap-1">
              <input className={`${input} w-56`} aria-label={tr("scentsx.kycblock.why_returned", "Why returned")} placeholder={tr("scentsx.kycblock.why_returned_10_characters", "Why returned (10+ characters)")} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="button" className="h-[28px] px-2 text-xs" disabled={note.trim().length < 10} onClick={() => void giveBack(x.id)}>{tr("scentsx.kycblock.returned", "Returned")}</Button>
            </span>
          ) : (
            <span className="flex gap-2"><button type="button" className="underline" onClick={() => { setReturning(x.id); setNote(""); }}>{tr("scentsx.kycblock.return", "Return")}</button><button type="button" className="underline" onClick={() => setVoiding(x)}>{tr("scentsx.kycblock.void", "Void")}</button></span>
          )}
        </div>
      ))}
      <VoidReasonModal open={voiding != null} title={voiding ? `Void pagaré ${voiding.pagare_no}` : ""} entityRef={voiding?.pagare_no} minLength={10}
        onClose={() => setVoiding(null)} onSubmit={async (why) => { if (!voiding) return; await closeScentsxPagare(voiding.id, "void", why); setVoiding(null); onDone(); }} />
      {adding ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[3px] bg-[#F8FAFC] p-2">
          <MoneyInput valueCents={amountCents} onChangeCents={setAmountCents} ariaLabel="Pagaré amount" />
          <select className={input} aria-label={tr("scentsx.kycblock.currency", "Currency")} value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value as "USD" | "MXN" })}><option value="USD">{tr("scentsx.kycblock.usd", "USD")}</option><option value="MXN">{tr("scentsx.kycblock.mxn", "MXN")}</option></select>
          <DatePicker aria-label={tr("scentsx.kycblock.issued_on", "Issued on")} value={v.issued_on} onChange={(x) => setV({ ...v, issued_on: x })} />
          <DatePicker aria-label={tr("scentsx.kycblock.due_on_blank_a_la_vista", "Due on (blank = a la vista)")} value={v.due_on} onChange={(x) => setV({ ...v, due_on: x })} />
          <input className={`${input} w-40`} aria-label={tr("scentsx.kycblock.place_of_payment", "Place of payment")} placeholder={tr("scentsx.kycblock.place_of_payment", "Place of payment")} value={v.place} onChange={(e) => setV({ ...v, place: e.target.value })} />
          <input className={`${input} w-44`} aria-label={tr("scentsx.kycblock.suscriptor", "Suscriptor")} placeholder={tr("scentsx.kycblock.suscriptor_who_signs", "Suscriptor (who signs)")} value={v.suscriptor} onChange={(e) => setV({ ...v, suscriptor: e.target.value })} />
          <input className={`${input} w-40`} aria-label={tr("scentsx.kycblock.aval", "Aval")} placeholder={tr("scentsx.kycblock.aval_guarantor", "Aval (guarantor)")} value={v.aval} onChange={(e) => setV({ ...v, aval: e.target.value })} />
          <input className={`${input} w-24`} aria-label={tr("scentsx.kycblock.moratorio_rate", "Moratorio rate %")} placeholder={tr("scentsx.kycblock.moratorio", "Moratorio %")} inputMode="decimal" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} />
          <input type="file" accept="image/*,application/pdf" aria-label={tr("scentsx.kycblock.signed_pagare", "Signed pagaré")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button type="button" className="h-[28px] px-2 text-xs" disabled={busy || !file || !v.issued_on || !amountCents || !v.suscriptor.trim() || !v.place.trim()} onClick={() => void add()}>{tr("scentsx.kycblock.save_pagare", "Save pagaré")}</Button>
        </div>
      ) : null}
    </div>
  );
}
