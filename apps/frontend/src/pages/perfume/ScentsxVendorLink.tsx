/**
 * SCENTSX B13 — a TIO Perfumes vendor becomes ScentsX LLC's vendor (A/P), the vendor twin of ScentsxCustomerLink. One click
 * creates the vendor through the canonical vendor route for ScentsX's company and links it (scentsx.vendor_links — the database
 * refuses a link to another company's vendor); the link screens it against the OFAC list. Then the vendor's KYC and its
 * W-9 / W-8BEN(-E) — the 1099 / withholding papers — are kept on the same card.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { createScentsxVendor, getScentsxCompany, linkScentsxVendor, listScentsxVendorLinks, screenScentsxParty } from "../../api/scentsx";
import { EntityLink } from "../../components/shared/EntityLink";
import { ScentsxKycBlock } from "./ScentsxKycBlock";
import { tr } from "./perfumeI18n";

export function ScentsxVendorLink({ vendorId, name }: { vendorId: string; name: string }) {
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const links = useQuery({ queryKey: ["scentsx", "vendor-link", vendorId], queryFn: () => listScentsxVendorLinks(vendorId) });
  const live = (links.data?.links ?? []).find((l) => !l.voided_at);
  const make = async () => {
    const companyId = co.data?.company.id;
    if (!companyId) return;
    setBusy(true);
    try {
      const created = await createScentsxVendor(companyId, name);
      const engineId = created.id ?? created.vendor?.id;
      if (!engineId) throw new Error("The vendor was created but its id did not come back — open Vendors to link it.");
      const r = await linkScentsxVendor(vendorId, engineId);
      pushToast(`${name} is now a ScentsX vendor${r.screening ? ` — OFAC: ${r.screening.result.replace(/_/g, " ")}` : ""}`, r.screening?.result === "clear" || !r.screening ? "success" : "error");
      void links.refetch();
    } catch (e) {
      pushToast(userFacingApiError(e, "Not created"), "error");
    } finally {
      setBusy(false);
    }
  };
  const screen = async () => {
    if (!live) return;
    setBusy(true);
    try {
      const r = await screenScentsxParty("vendor", live.engine_id);
      pushToast(`OFAC: ${r.screening.result.replace(/_/g, " ")}`, r.screening.result === "clear" ? "success" : "error");
    } catch (e) { pushToast(userFacingApiError(e, "Not screened"), "error"); } finally { setBusy(false); }
  };
  return (
    <div className="w-full rounded-[3px] border border-[#D8E0E8] bg-white p-2 text-xs" data-testid="scentsx-vendor-link">
      <div className="font-semibold text-[#1F2A44]">{tr("scentsx.vend.title", "ScentsX vendor (A/P)")}</div>
      {links.isError ? (
        <div className="text-[#B91C1C]">{tr("scentsx.vend.error", "Couldn't check the link")} <button type="button" className="underline" onClick={() => void links.refetch()}>{tr("scentsx.vend.retry", "Retry")}</button></div>
      ) : live ? (
        <div className="flex items-center gap-2">
          <span>{tr("scentsx.vend.linked", "Linked to")} <EntityLink kind="vendor" id={live.engine_id} label={live.engine_name} /></span>
          <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" disabled={busy} onClick={() => void screen()} data-testid="scentsx-vendor-screen">{tr("scentsx.vend.screen", "Screen OFAC now")}</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[#64748B]">{tr("scentsx.vend.none", "Not a vendor of ScentsX yet.")}</span>
          <Button type="button" className="h-[28px] px-2 text-xs" disabled={busy || !co.data || links.isLoading} onClick={() => void make()} data-testid="scentsx-vendor-make">
            {tr("scentsx.vend.make", "Make ScentsX vendor")}</Button>
        </div>
      )}
      <ScentsxKycBlock kind="vendor" partyId={vendorId} companyId={co.data?.company.id ?? null} defaultName={name} />
    </div>
  );
}
