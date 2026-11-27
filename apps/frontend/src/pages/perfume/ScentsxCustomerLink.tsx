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
import { createScentsxCustomer, getScentsxCompany, getScentsxCredit, linkScentsxCustomer, listScentsxCustomerLinks } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { EntityLink } from "../../components/shared/EntityLink";

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
    </div>
  );
}
