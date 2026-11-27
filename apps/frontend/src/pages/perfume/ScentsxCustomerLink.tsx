/**
 * SCENTSX — a TIO Perfumes contact becomes ScentsX LLC's customer (design: "A lead becomes a customer only when it buys or
 * applies for credit"). One click creates the customer through the canonical customer route for ScentsX's company and
 * links it to this contact (scentsx.customer_links — the database refuses a link to any other company's customer).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { addScentsxResaleCertificate, createScentsxCustomer, getScentsxCompany, getScentsxCredit, getScentsxCustomerCompliance, linkScentsxCustomer, listScentsxCustomerLinks, screenScentsxParty } from "../../api/scentsx";
import { uploadSourceDocumentFromFile } from "../../api/docs";
import { tr } from "./perfumeI18n";
import { EntityLink } from "../../components/shared/EntityLink";
import { ScentsxKycBlock } from "./ScentsxKycBlock";
import { DatePicker } from "../../components/forms/DatePicker";

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ScentsxCustomerLink({ contactId, name, email, phone }: { contactId: string; name: string; email?: string | null; phone?: string | null }) {
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const links = useQuery({ queryKey: ["scentsx", "customer-link", contactId], queryFn: () => listScentsxCustomerLinks(contactId) });
  const live = (links.data?.links ?? []).find((l) => !l.voided_at);
  const credit = useQuery({ queryKey: ["scentsx", "credit", contactId], queryFn: () => getScentsxCredit(contactId) });
  const make = async () => {
    const companyId = co.data?.company.id;
    if (!companyId) return;
    setBusy(true);
    try {
      const created = await createScentsxCustomer(companyId, { name, billing_email: email, billing_phone: phone });
      const customerId = (created as { id?: string }).id;
      if (!customerId) throw new Error("The customer was created but its id did not come back — open Customers to link it.");
      await linkScentsxCustomer(contactId, customerId);
      pushToast(`${name} is now a ScentsX customer`, "success");
      void links.refetch();
    } catch (e) {
      pushToast(userFacingApiError(e, "Not created"), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-2 rounded-[3px] border border-[#D8E0E8] p-2" data-testid="scentsx-customer-link">
      <div className="font-semibold text-[#1F2A44]">{tr("scentsx.cust.title", "ScentsX customer")}</div>
      {links.isError ? (
        <div className="text-[#B91C1C]">{tr("scentsx.cust.error", "Couldn't check the link")} <button type="button" className="underline" onClick={() => void links.refetch()}>{tr("scentsx.cust.retry", "Retry")}</button></div>
      ) : live ? (
        <div>{tr("scentsx.cust.linked", "Linked to")} <EntityLink kind="customer" id={live.engine_id} label={live.engine_name} /></div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[#64748B]">{tr("scentsx.cust.none", "Not a customer of ScentsX yet.")}</span>
          <Button type="button" className="h-[28px] px-2 text-xs" disabled={busy || !co.data || links.isLoading} onClick={() => void make()} data-testid="scentsx-customer-make">
            {tr("scentsx.cust.make", "Make ScentsX customer")}</Button>
        </div>
      )}
      {credit.isError ? (
        <div className="mt-1 text-[#B91C1C]">{tr("scentsx.credit.error", "Couldn't load credit")} <button type="button" className="underline" onClick={() => void credit.refetch()}>{tr("scentsx.cust.retry", "Retry")}</button></div>
      ) : credit.data ? (
        <CreditBlock c={credit.data.credit} />
      ) : null}
      <CustomerCompliance contactId={contactId} companyId={co.data?.company.id ?? null} />
      <ScentsxKycBlock kind="customer" partyId={contactId} companyId={co.data?.company.id ?? null} defaultName={name} />
    </div>
  );
}

/** Books-side credit picture: what this buyer owes ScentsX, what is about to be owed, and what is left of the limit. */
function CreditBlock({ c }: { c: import("../../api/scentsx").ScentsxCredit }) {
  const row = (label: string, cents: number, testid: string) => (
    <div className="flex justify-between gap-4"><span className="text-[#64748B]">{label}</span><span className="tabular-nums" data-testid={testid}>{money(cents)}</span></div>
  );
  return (
    <div className="mt-2 space-y-0.5 border-t border-[#E5EAF0] pt-2" data-testid="scentsx-credit">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[#1F2A44]">{tr("scentsx.credit.title", "Credit")}</span>
        <span className="text-[#64748B]">{c.account_type ?? tr("scentsx.credit.noacct", "no account")}{c.terms_days != null ? ` · ${c.terms_days} days` : ""}</span>
      </div>
      {c.on_hold ? <div className="font-semibold text-[#B91C1C]" data-testid="scentsx-credit-hold">{tr("scentsx.credit.hold", "On hold")}: {c.hold_reason}</div> : null}
      {row(tr("scentsx.credit.ar", "Open invoices"), c.open_ar_cents, "scentsx-credit-ar")}
      {c.past_due_cents > 0 ? row(`${tr("scentsx.credit.pastdue", "Past due")}${c.oldest_past_due_days != null ? ` (oldest ${c.oldest_past_due_days} days)` : ""}`, c.past_due_cents, "scentsx-credit-pastdue") : null}
      {row(tr("scentsx.credit.draft", "Draft invoices"), c.draft_invoice_cents, "scentsx-credit-draft")}
      {row(tr("scentsx.credit.shipped", "Shipped, not invoiced"), c.shipped_not_billed_cents, "scentsx-credit-shipped")}
      {row(tr("scentsx.credit.orders", "Open orders"), c.open_order_cents, "scentsx-credit-orders")}
      <div className="flex justify-between gap-4 font-semibold"><span>{tr("scentsx.credit.exposure", "Total owed + on order")}</span><span className="tabular-nums" data-testid="scentsx-credit-exposure">{money(c.exposure_cents)}</span></div>
      {c.credit_limit_cents != null ? (
        <div className={`flex justify-between gap-4 ${c.over_limit ? "font-semibold text-[#B91C1C]" : ""}`}>
          <span>{tr("scentsx.credit.available", "Left of")} {money(c.credit_limit_cents)} {tr("scentsx.credit.limit", "limit")}</span>
          <span className="tabular-nums" data-testid="scentsx-credit-available">{money(c.available_cents ?? 0)}</span>
        </div>
      ) : <div className="text-[#64748B]">{tr("scentsx.credit.nolimit", "No credit limit — cash or prepaid only.")}</div>}
      {c.pagares_held > 0 ? (
        <div className="flex justify-between gap-4" data-testid="scentsx-credit-pagares">
          <span className="text-[#64748B]">{tr("scentsx.credit.pagares", "Secured by pagarés")} ({c.pagares_held})</span>
          <span className="tabular-nums">{[c.pagare_held_usd_cents ? money(c.pagare_held_usd_cents) : null, c.pagare_held_mxn_cents ? (c.pagare_held_mxn_cents / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : null].filter(Boolean).join(" + ")}</span>
        </div>
      ) : null}
      {c.account_type === "credit" && c.kyc_status !== "complete" ? (
        <div className="font-semibold text-[#B45309]" data-testid="scentsx-credit-kyc">{tr("scentsx.credit.kyc", "Credit account without complete KYC")}: {c.kyc_missing.join(", ")}</div>
      ) : null}
    </div>
  );
}

const OFAC_TEXT = {
  never_screened: "Not screened against the OFAC list yet.",
  list_changed: "Screened against an older OFAC list.",
  possible_match: "Possible OFAC match — decide on Books → Compliance.",
  confirmed_match: "Confirmed OFAC match — no sale.",
} as const;

/** OFAC status (screen now) and the Texas resale certificate (Form 01-339) for this buyer. */
function CustomerCompliance({ contactId, companyId }: { contactId: string; companyId: string | null }) {
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["scentsx", "customer-compliance", contactId], queryFn: () => getScentsxCustomerCompliance(contactId) });
  const [file, setFile] = useState<File | null>(null);
  const [signed, setSigned] = useState("");
  const [busy, setBusy] = useState(false);
  if (q.isError) return <div className="mt-1 text-[#B91C1C]">{tr("scentsx.comp.error", "Couldn't load OFAC / resale status")} <button type="button" className="underline" onClick={() => void q.refetch()}>{tr("scentsx.cust.retry", "Retry")}</button></div>;
  const d = q.data;
  if (!d) return null;
  const screen = async () => {
    setBusy(true);
    try {
      const r = await screenScentsxParty(d.customer_id ? "customer" : "contact_company", d.customer_id ?? contactId);
      pushToast(r.screening.result === "clear" ? "OFAC: clear" : `OFAC: possible match (${r.screening.hits}) — decide on Books → Compliance`, r.screening.result === "clear" ? "success" : "error");
      void q.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Not screened"), "error"); } finally { setBusy(false); }
  };
  const saveCert = async () => {
    if (!file || !companyId || !signed) return;
    setBusy(true);
    try {
      const fileId = await uploadSourceDocumentFromFile(file, { operating_company_id: companyId });
      if (!fileId) throw new Error("The file did not upload");
      await addScentsxResaleCertificate({ contact_company_id: contactId, customer_id: d.customer_id, signed_on: signed, file_id: fileId });
      pushToast("Resale certificate saved", "success"); setFile(null); void q.refetch();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 space-y-1 border-t border-[#E5EAF0] pt-2" data-testid="scentsx-customer-compliance">
      <div className="flex items-center justify-between gap-2">
        <span className={d.sanctions?.blocked ? "font-semibold text-[#B91C1C]" : "text-[#15803D]"} data-testid="scentsx-customer-ofac">
          {d.sanctions?.blocked && d.sanctions.reason ? OFAC_TEXT[d.sanctions.reason] : tr("scentsx.comp.ofac_clear", "OFAC: screened, clear")}
        </span>
        <button type="button" className="underline" disabled={busy} onClick={() => void screen()}>{tr("scentsx.comp.screen", "Screen now")}</button>
      </div>
      {d.resale_certificate_on_file ? (
        <div className="text-[#15803D]" data-testid="scentsx-customer-resale">{tr("scentsx.comp.resale_on_file", "Resale certificate (Form 01-339) on file")}</div>
      ) : (
        <div className="flex flex-wrap items-center gap-2" data-testid="scentsx-customer-resale">
          <span className="text-[#64748B]">{tr("scentsx.comp.resale_none", "No resale certificate — Texas sales tax applies.")}</span>
          <DatePicker aria-label={tr("scentsx.customerlink.signed_on", "Signed on")} value={signed} onChange={setSigned} />
          <input type="file" accept="image/*,application/pdf" aria-label={tr("scentsx.customerlink.resale_certificate_file", "Resale certificate file")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button type="button" className="h-[28px] px-2 text-xs" disabled={busy || !file || !signed || !companyId} onClick={() => void saveCert()}>{tr("scentsx.comp.resale_save", "Save certificate")}</Button>
        </div>
      )}
    </div>
  );
}
