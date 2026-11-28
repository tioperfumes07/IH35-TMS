/**
 * Role + type on the ONE company record (owner 2026-11-27 17:20 / 17:25 CT): Leads "Convert to vendor / customer / both",
 * and the vendor / customer type from Catalogs ("TRADERS IS A TYPE OF CUSTOMER OR VENDOR, THEY DO NOT HAVE RETAIL STORES …
 * THEY JUST PURCHASE MERCHANDISE AND FLIP IMMEDIATELY"). Saved with one history row.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { listPerfumeCatalogs, setPerfumeCompanyRole, type PerfumeProfileCompany } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { ctl } from "./perfumeDocParts";

type Role = "vendor" | "customer" | "both" | "";
const ROLE_TEXT: Record<Exclude<Role, "">, string> = { vendor: "Vendor", customer: "Customer", both: "Vendor + customer" };

export function CompanyRoleEditor({ company }: { company: PerfumeProfileCompany }) {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["perfume", "catalogs"], queryFn: listPerfumeCatalogs, staleTime: 60_000 });
  const [role, setRole] = useState<Role>((company.role as Role) ?? "");
  const [vt, setVt] = useState(company.vendor_type ?? "");
  const [ct, setCt] = useState(company.customer_type ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRole((company.role as Role) ?? ""); setVt(company.vendor_type ?? ""); setCt(company.customer_type ?? ""); }, [company.id, company.role, company.vendor_type, company.customer_type]);
  const values = (kind: string) => cats.data?.kinds?.find((k) => k.kind === kind)?.values?.map((v) => v.value) ?? [];
  const isVendor = role === "vendor" || role === "both";
  const isCustomer = role === "customer" || role === "both";
  const dirty = role !== ((company.role as Role) ?? "") || vt !== (company.vendor_type ?? "") || ct !== (company.customer_type ?? "");
  const save = async () => {
    setBusy(true);
    try {
      await setPerfumeCompanyRole(company.id, { role: role || null, vendor_type: isVendor ? (vt || null) : null, customer_type: isCustomer ? (ct || null) : null });
      pushToast("Saved", "success");
      await qc.invalidateQueries({ queryKey: ["perfume"] });
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
    finally { setBusy(false); }
  };
  const opts = (kind: string, cur: string) => { const v = values(kind); return cur && !v.includes(cur) ? [cur, ...v] : v; };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="perfume-company-role">
      <span className="text-[#64748B]">{tr("perfume.role.is", "This company is a")}</span>
      <select className={ctl} value={role} aria-label={tr("perfume.role.role", "Vendor or customer")} onChange={(e) => setRole(e.target.value as Role)} data-testid="perfume-company-role-role">
        <option value="">{tr("perfume.role.none", "Not set (lead)")}</option>
        {(Object.keys(ROLE_TEXT) as Array<Exclude<Role, "">>).map((r) => <option key={r} value={r}>{ROLE_TEXT[r]}</option>)}
      </select>
      {isVendor ? (
        <select className={ctl} value={vt} aria-label={tr("perfume.role.vendor_type", "Vendor type")} onChange={(e) => setVt(e.target.value)} data-testid="perfume-company-role-vendor-type">
          <option value="">{tr("perfume.role.vendor_type", "Vendor type")}…</option>
          {opts("vendor_type", vt).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      ) : null}
      {isCustomer ? (
        <select className={ctl} value={ct} aria-label={tr("perfume.role.customer_type", "Customer type")} onChange={(e) => setCt(e.target.value)} data-testid="perfume-company-role-customer-type">
          <option value="">{tr("perfume.role.customer_type", "Customer type")}…</option>
          {opts("customer_type", ct).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      ) : null}
      <Button type="button" variant="primary" className="h-[28px] px-2 text-xs" disabled={!dirty || busy} onClick={() => void save()} data-testid="perfume-company-role-save">
        {tr("perfume.role.save", "Save")}
      </Button>
    </div>
  );
}
