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
import { createScentsxCustomer, getScentsxCompany, linkScentsxCustomer, listScentsxCustomerLinks } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { EntityLink } from "../../components/shared/EntityLink";

export function ScentsxCustomerLink({ contactId, name, email, phone }: { contactId: string; name: string; email?: string | null; phone?: string | null }) {
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const links = useQuery({ queryKey: ["scentsx", "customer-link", contactId], queryFn: () => listScentsxCustomerLinks(contactId) });
  const live = (links.data?.links ?? []).find((l) => !l.voided_at);
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
    </div>
  );
}
