/**
 * TIO Perfumes · Vendors / Customers · Create — owner 2026-11-27 18:21 CT: "we are missing create vendor create customer, and the correct pop
 * up and profile creator". A QuickBooks-style drawer: the company (name, type, several relationships / business types, phone, web,
 * address sized like an address) and SEVERAL contact people (owner 2026-11-28 14:58 CT — the one shared form, PerfumeCompanyForm). Saved through the contacts import engine, so a company already on file (same name key, phone or domain) is never created twice —
 * the pop-up says so and opens that profile instead.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { createPerfumeCompany, listPerfumeCatalogs } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { ctl } from "./perfumeDocParts";
import { CompanyFields, ContactsFields, EMPTY_COMPANY_FORM, EMPTY_CONTACT, type CompanyFormValues, type ContactRow } from "./PerfumeCompanyForm";

type Role = "vendor" | "customer" | "both";
export function PerfumeCreateCompany({ role, onCreated, onOpen }: { role: "vendor" | "customer"; onCreated: (name: string) => void; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end">
      <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => setOpen(true)} data-testid={`perfume-create-${role}`}>
        {role === "vendor" ? tr("perfume.create.vendor", "+ Create vendor") : tr("perfume.create.customer", "+ Create customer")}</Button>
      {open ? <CreateModal role={role} onClose={() => setOpen(false)} onCreated={onCreated} onOpen={onOpen} /> : null}
    </div>
  );
}

function CreateModal({ role, onClose, onCreated, onOpen }: { role: "vendor" | "customer"; onClose: () => void; onCreated: (name: string) => void; onOpen: (id: string) => void }) {
  const { pushToast } = useToast();
  const cats = useQuery({ queryKey: ["perfume", "catalogs"], queryFn: listPerfumeCatalogs });
  const [name, setName] = useState("");
  const [isA, setIsA] = useState<Role>(role);
  const [type, setType] = useState("");
  const [co, setCo] = useState<CompanyFormValues>({ ...EMPTY_COMPANY_FORM });
  const [people, setPeople] = useState<ContactRow[]>([{ ...EMPTY_CONTACT }]);
  const [busy, setBusy] = useState(false);
  const values = (kind: string) => (cats.data?.kinds?.find((k) => k.kind === kind)?.values ?? []).map((x) => x.value);
  const lists = { category: values("category"), segment: values("segment"), industry: values("industry"), review_tag: values("review_tag") };
  const typeKind = isA === "customer" ? "customer_type" : "vendor_type";
  const nul = (x: string) => (x.trim() ? x.trim() : null);
  const filled = people.filter((p) => p.name.trim() || p.email.trim() || p.phone.trim());
  const badEmail = filled.find((p) => p.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email.trim()));
  const save = async () => {
    setBusy(true);
    try {
      const firstEmail = filled.find((p) => p.email.trim())?.email.trim().toLowerCase() ?? "";
      // A free mailbox (gmail, yahoo …) is not the company's web domain — never used as one (it would match unrelated companies).
      const mailDomain = firstEmail.includes("@") ? firstEmail.split("@")[1]! : null;
      const freeMail = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|prodigy|protonmail)\./i;
      const domain = nul(co.website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] ?? "") ?? (mailDomain && !freeMail.test(mailDomain) ? mailDomain : null);
      const r = await createPerfumeCompany({
        company: { name: name.trim(), role: isA, source: "Created in app", domain, website: nul(co.website), phone: nul(co.phone), address: nul(co.address), city: nul(co.city),
          state: nul(co.state), zip: nul(co.zip), country: nul(co.country), notes: nul(co.notes),
          main_category: co.relationships[0] ?? null, segment: co.business_types[0] ?? null,
          relationships: co.relationships, business_types: co.business_types, categories: co.categories,
          vendor_type: isA !== "customer" ? nul(type) : null, customer_type: isA !== "vendor" ? nul(type) : null, status: "active" },
        people: filled.map((p) => ({ name: nul(p.name), title: nul(p.title), email: nul(p.email.toLowerCase()), phones: p.phone.trim() ? [p.phone.trim()] : [], role: isA })),
        origins: [{ how: "Created in app", source: role === "vendor" ? "Vendors · Create vendor" : "Customers · Create customer" }],
      });
      pushToast(r.existed ? `${name.trim()} is already on file — opened its profile (no second record)` : `${name.trim()} created with ${filled.length} contact${filled.length === 1 ? "" : "s"}`, r.existed ? "info" : "success");
      onCreated(name.trim()); if (r.id) onOpen(r.id); onClose();
    } catch (e) { pushToast(userFacingApiError(e, "Not created"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={role === "vendor" ? tr("perfume.create.vendor_title", "New vendor") : tr("perfume.create.customer_title", "New customer")} size="lg" variant="drawer" data-testid="perfume-create-modal">
      <div className="space-y-3 text-xs">
        <div className="text-card-title">{tr("perfume.create.company", "Company")}</div>
        <div className="grid grid-cols-12 gap-2">
          <label className="col-span-12 block">{`${tr("perfume.create.name", "Company name")} *`}
            <input className={`${ctl} mt-0.5 w-full`} value={name} maxLength={300} onChange={(e) => setName(e.target.value)} data-testid="perfume-create-name" /></label>
          <label className="col-span-12 block md:col-span-4">{tr("perfume.create.role", "Is a")}
            <select className={`${ctl} mt-0.5 w-full`} value={isA} onChange={(e) => { setIsA(e.target.value as Role); setType(""); }} data-testid="perfume-create-role">
              <option value="vendor">Vendor</option><option value="customer">Customer</option><option value="both">Vendor + customer</option>
            </select></label>
          <label className="col-span-12 block md:col-span-8">{isA === "customer" ? tr("perfume.create.ctype", "Customer type") : tr("perfume.create.vtype", "Vendor type")}
            <select className={`${ctl} mt-0.5 w-full`} value={type} onChange={(e) => setType(e.target.value)} data-testid="perfume-create-type">
              <option value="">—</option>{values(typeKind).map((x) => <option key={x} value={x}>{x}</option>)}
            </select></label>
        </div>
        <CompanyFields v={co} set={setCo} lists={lists} showTags={false} testPrefix="perfume-create" />
        <div className="text-card-title">{`${tr("perfume.create.people", "Contacts")} (${filled.length})`}</div>
        <ContactsFields rows={people} set={setPeople} testPrefix="perfume-create" />
        {badEmail ? <p className="text-[#B91C1C]" data-testid="perfume-create-bad-email">{`"${badEmail.email}" is not an email address.`}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.cat.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !name.trim() || Boolean(badEmail)} onClick={() => void save()} data-testid="perfume-create-save">
            {role === "vendor" ? tr("perfume.create.save_vendor", "Create vendor") : tr("perfume.create.save_customer", "Create customer")}</Button>
        </div>
      </div>
    </Modal>
  );
}
